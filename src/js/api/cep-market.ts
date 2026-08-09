/**
 * CEP market catalog — Motionflow only.
 *
 * `GET /api/cep/market?host=` with Bearer; install via authenticated download.
 * @see next-app/CEP_API.md
 */
import { apiUrl } from "./config";
import { cepHttpRequest } from "@/lib/api/cep-http";
import {
  getSessionToken,
  handleUnauthorized,
  sessionAuthHeaders,
} from "@/lib/api/session";
import { openLinkInBrowser } from "@/lib/utils/bolt";
import { fs, os, path } from "@/lib/cep/node";
import {
  loadPreferencesFile,
  resolvePreferencesPath,
  savePreferencesFile,
} from "@/lib/api/preferences";
import { downloadToFile } from "@/utils/download-file";
import { installPackFromFile } from "@/lib/utils/pack-install";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";
import { version as EXTENSION_VERSION } from "../../shared/shared";

export const CEP_MARKET_ENDPOINT = "/api/cep/market";

const SITE_ORIGIN = import.meta.env.DEV
  ? "http://localhost:3000"
  : "https://motionflow.pro";

export type CepMarketAction = "install" | "buy" | "get_free" | string;

export type CepMarketPackage = {
  id: number | string;
  name: string;
  pack_name: string;
  author?: string;
  version?: string;
  primary_type: "AE" | "PR" | string;
  image_url: string;
  custom_price?: number;
  discount?: number | string;
  video_id?: string;
  owned?: boolean;
  covered_by_subscription?: boolean;
  action?: CepMarketAction;
  install_url?: string | null;
  buy_url?: string | null;
  details_url?: string | null;
  min_extension_version?: string | null;
  min_host_version?: string | null;
};

export type CepMarketPayload = {
  subscription_active?: boolean;
  subscribe_url?: string;
  Packages?: CepMarketPackage[];
};

declare const __CEP_API_MOCKS__: boolean | undefined;
const MOCK_ENABLED =
  typeof __CEP_API_MOCKS__ === "boolean"
    ? __CEP_API_MOCKS__
    : Boolean(import.meta.env.DEV);

function authHeaders(): Record<string, string> {
  return sessionAuthHeaders();
}

function defaultSubscribeUrl(): string {
  return `${SITE_ORIGIN}/pricing?client=spunkram-cep`;
}

/** Compare dotted versions; returns negative if a < b, 0 if equal, positive if a > b. */
export function compareDottedVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function checkPackVersionGates(
  item: CepMarketPackage,
  opts?: { extensionVersion?: string; hostVersion?: string | null },
): { ok: true } | { ok: false; message: string } {
  const extVer = opts?.extensionVersion ?? EXTENSION_VERSION;
  if (
    item.min_extension_version &&
    compareDottedVersions(extVer, item.min_extension_version) < 0
  ) {
    return {
      ok: false,
      message: `This pack requires panel v${item.min_extension_version} or newer (you have ${extVer}).`,
    };
  }
  const hostVer = opts?.hostVersion;
  if (
    item.min_host_version &&
    hostVer &&
    compareDottedVersions(hostVer, item.min_host_version) < 0
  ) {
    return {
      ok: false,
      message: `This pack requires host v${item.min_host_version} or newer (you have ${hostVer}).`,
    };
  }
  return { ok: true };
}

function normalizePackage(raw: CepMarketPackage): CepMarketPackage {
  const price =
    typeof raw.custom_price === "number"
      ? raw.custom_price
      : Number(raw.custom_price) || 0;
  return {
    ...raw,
    id: raw.id,
    name: raw.name,
    pack_name: raw.pack_name || raw.name,
    primary_type: raw.primary_type,
    image_url: raw.image_url || "",
    custom_price: price,
    owned: Boolean(raw.owned),
    covered_by_subscription: Boolean(raw.covered_by_subscription),
    action: raw.action,
    install_url: raw.install_url ?? null,
    buy_url: raw.buy_url ?? null,
    details_url: raw.details_url ?? null,
    min_extension_version: raw.min_extension_version ?? null,
    min_host_version: raw.min_host_version ?? null,
  };
}

function normalizeHostApp(id: string): string {
  const u = id.trim().toUpperCase();
  if (!u) return "";
  if (u === "AE" || u === "AEFT" || u.includes("AFTER")) return "AE";
  if (u === "PR" || u === "PPRO" || u.includes("PREMIERE")) return "PR";
  return u;
}

/** Collapse "Wedding Pack" / "Wedding Package for Premiere Pro" → "wedding". */
function normalizePackLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/for\s+(premiere\s*pro|after\s*effects)/g, " ")
    .replace(/\b(packages?|packs?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Match a local install to a market catalog row (marketId, then name + host). */
export function installedPackMatchesMarketItem(
  meta: InstalledPackMeta,
  item: CepMarketPackage,
): boolean {
  if (meta.marketId != null && String(meta.marketId) === String(item.id)) {
    return true;
  }

  const metaApp = normalizeHostApp(meta.appID || meta.load || "");
  const itemApp = normalizeHostApp(item.primary_type || "");
  if (metaApp && itemApp && metaApp !== itemApp) return false;

  const installedName = (meta.name || "").trim().toLowerCase();
  if (!installedName) return false;
  const catalogNames = [item.pack_name, item.name]
    .map((n) => (n || "").trim().toLowerCase())
    .filter(Boolean);
  if (catalogNames.includes(installedName)) return true;

  const installedNorm = normalizePackLabel(meta.name || "");
  if (!installedNorm) return false;
  return catalogNames.some((n) => {
    const catalogNorm = normalizePackLabel(n);
    if (!catalogNorm) return false;
    return (
      catalogNorm === installedNorm ||
      catalogNorm.includes(installedNorm) ||
      installedNorm.includes(catalogNorm)
    );
  });
}

/** Persist market catalog id onto an installed prefs entry (and return updated meta). */
export function tagInstalledPackWithMarketId(
  meta: InstalledPackMeta,
  marketId: string | number,
): InstalledPackMeta {
  const id = String(marketId);
  const tagged: InstalledPackMeta = { ...meta, marketId: id };
  try {
    const prefs = loadPreferencesFile();
    const packages = Array.isArray(prefs.packages)
      ? [...(prefs.packages as InstalledPackMeta[])]
      : [];
    const idx = packages.findIndex((p) => p.path === meta.path);
    if (idx >= 0) {
      packages[idx] = { ...packages[idx], marketId: id };
      prefs.packages = packages;
      savePreferencesFile(prefs);
    }
  } catch {
    // best-effort — matching still works via fuzzy name for this session
  }
  return tagged;
}

function mockPackages(host: "AE" | "PR"): CepMarketPackage[] {
  return [
    {
      id: "mock-free",
      name: "Spunkram Free Starter",
      pack_name: "spunkram-free-starter",
      author: "Spunkram",
      version: "1.0.0",
      primary_type: host,
      image_url: "https://placehold.co/640x360/1a1a2e/eee?text=Free+Pack",
      custom_price: 0,
      owned: false,
      covered_by_subscription: true,
      action: "get_free",
      install_url: null,
      buy_url: null,
      details_url: null,
      min_extension_version: null,
      min_host_version: null,
    },
    {
      id: "mock-buy",
      name: "Spunkram Library",
      pack_name: "spunkram-library",
      author: "Spunkram",
      version: "4.0.0",
      primary_type: host,
      image_url: "https://placehold.co/640x360/0f3460/eee?text=Library",
      custom_price: host === "AE" ? 75 : 69,
      owned: false,
      covered_by_subscription: false,
      action: "buy",
      install_url: null,
      buy_url: defaultSubscribeUrl(),
      details_url: null,
      min_extension_version: null,
      min_host_version: null,
    },
  ];
}

/**
 * Load author packs from Motionflow `GET /api/cep/market?host=`.
 */
export async function fetchCepMarket(
  host: "AE" | "PR",
): Promise<{ data?: CepMarketPayload; error?: string }> {
  const token = getSessionToken();
  if (!token) {
    if (MOCK_ENABLED) {
      return {
        data: {
          subscription_active: false,
          subscribe_url: defaultSubscribeUrl(),
          Packages: mockPackages(host),
        },
      };
    }
    return { error: "UNAUTHORIZED" };
  }

  const url = apiUrl(`${CEP_MARKET_ENDPOINT}?host=${encodeURIComponent(host)}`);
  const result = await cepHttpRequest(url, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!result.ok) {
    if (result.status === 401) {
      handleUnauthorized();
      return { error: "UNAUTHORIZED" };
    }
    try {
      const errBody = JSON.parse(result.text) as { error?: string; message?: string };
      return { error: errBody.error || errBody.message || "NO_SUCCESS_LOAD" };
    } catch {
      return { error: result.error || "NO_SUCCESS_LOAD" };
    }
  }

  try {
    const data = JSON.parse(result.text) as CepMarketPayload;
    const packages = Array.isArray(data.Packages)
      ? data.Packages.map(normalizePackage)
      : [];
    return {
      data: {
        subscription_active: Boolean(data.subscription_active),
        subscribe_url: data.subscribe_url || defaultSubscribeUrl(),
        Packages: packages,
      },
    };
  } catch {
    return { error: "NO_SUCCESS_LOAD" };
  }
}

export type DownloadAndInstallResult =
  | { ok: true; meta: InstalledPackMeta }
  | {
      ok: false;
      code?: string;
      message: string;
      buy_url?: string | null;
      subscribe_url?: string | null;
      /** Zip kept on disk so install can be retried without re-download. */
      cachedZipPath?: string;
    };

function resolvePackCacheDir(): string {
  const prefPath = resolvePreferencesPath();
  const base = prefPath
    ? path.dirname(prefPath)
    : path.join(os.tmpdir(), "spunkram-library");
  const dir = path.join(base, "pack-cache");
  if (typeof fs?.existsSync === "function" && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Stable zip path per market pack id — overwritten on update/re-download. */
export function resolveCachedPackZipPath(item: CepMarketPackage): string {
  const safeId = String(item.id).replace(/[\\/:*?"<>|]/g, "_");
  return path.join(resolvePackCacheDir(), `${safeId}.zip`);
}

export function hasCachedPackZip(item: CepMarketPackage): boolean {
  try {
    const p = resolveCachedPackZipPath(item);
    if (typeof fs?.existsSync !== "function" || !fs.existsSync(p)) return false;
    // Ignore empty / truncated leftovers.
    if (typeof fs.statSync === "function") {
      const st = fs.statSync(p);
      if (!st || !st.size || st.size < 64) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function removeCachedPackZip(zipPath: string): void {
  try {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  } catch {
    /* ignore */
  }
}

async function installFromZipPath(
  zipPath: string,
  item?: CepMarketPackage,
): Promise<DownloadAndInstallResult> {
  const installed = await installPackFromFile(zipPath);
  if (!installed.ok) {
    return { ok: false, message: installed.message, cachedZipPath: zipPath };
  }
  const meta = item
    ? tagInstalledPackWithMarketId(installed.meta, item.id)
    : installed.meta;
  removeCachedPackZip(zipPath);
  return { ok: true, meta };
}

/**
 * Install from a previously downloaded zip (no network).
 * Does not fall back to download — caller decides whether to re-fetch.
 */
export async function installCachedPack(
  item: CepMarketPackage,
): Promise<DownloadAndInstallResult> {
  const zipPath = resolveCachedPackZipPath(item);
  if (!hasCachedPackZip(item)) {
    return { ok: false, code: "NO_CACHE", message: "Cached pack zip not found." };
  }
  return installFromZipPath(zipPath, item);
}

/**
 * Authenticated pack download: Bearer on first hop, follow redirects to CDN/R2
 * without re-sending Authorization, then install from the zip.
 *
 * The zip is written to a stable pack-cache path and kept until install
 * succeeds (or overwritten on the next download of the same pack).
 */
export async function downloadAndInstallPack(
  item: CepMarketPackage,
  opts?: {
    subscribeUrl?: string | null;
    onProgress?: (p: { bytesReceived: number; totalBytes: number | null }) => void;
    /** When true and a cached zip exists, skip download and install from cache. */
    preferCache?: boolean;
    onPhase?: (phase: "downloading" | "installing") => void;
    signal?: AbortSignal;
  },
): Promise<DownloadAndInstallResult> {
  const gate = checkPackVersionGates(item);
  if (!gate.ok) return { ok: false, message: gate.message };

  const destPath = resolveCachedPackZipPath(item);

  if (opts?.preferCache && hasCachedPackZip(item)) {
    opts.onPhase?.("installing");
    return installFromZipPath(destPath, item);
  }

  const token = getSessionToken();
  if (!token) {
    return { ok: false, code: "UNAUTHORIZED", message: "Sign in to install packs." };
  }

  const installUrl =
    item.install_url ||
    apiUrl(`/api/cep/market/download?pack_id=${encodeURIComponent(String(item.id))}`);

  opts?.onPhase?.("downloading");

  try {
    await downloadToFile(installUrl, destPath, {
      timeoutMs: 15 * 60 * 1000,
      headers: sessionAuthHeaders(),
      stripAuthOnRedirect: true,
      onProgress: opts?.onProgress,
      signal: opts?.signal,
      onErrorBody: (status, body) => {
        if (status === 401) {
          handleUnauthorized();
          throw Object.assign(new Error("Session expired — please sign in again."), {
            code: "UNAUTHORIZED",
            status,
          });
        }
        try {
          const parsed = JSON.parse(body) as { error?: string; message?: string };
          const code = parsed.error || `HTTP_${status}`;
          const message = parsed.message || code;
          throw Object.assign(new Error(message), { code, status });
        } catch (e) {
          if (e && typeof e === "object" && "code" in e) throw e;
          throw Object.assign(new Error(`Download failed (${status})`), {
            code: `HTTP_${status}`,
            status,
          });
        }
      },
    });
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : undefined;
    const message = e instanceof Error ? e.message : String(e);
    if (code === "ABORTED" || opts?.signal?.aborted) {
      return { ok: false, code: "ABORTED", message: "Download cancelled" };
    }
    if (code === "NOT_OWNED" || code === "SUBSCRIPTION_REQUIRED") {
      return {
        ok: false,
        code,
        message,
        buy_url: item.buy_url,
        subscribe_url: opts?.subscribeUrl ?? defaultSubscribeUrl(),
      };
    }
    if (code === "UNAUTHORIZED" || message.includes("(401)")) {
      handleUnauthorized();
      return { ok: false, code: "UNAUTHORIZED", message: "Session expired — please sign in again." };
    }
    return {
      ok: false,
      code,
      message,
      cachedZipPath: hasCachedPackZip(item) ? destPath : undefined,
    };
  }

  if (opts?.signal?.aborted) {
    return { ok: false, code: "ABORTED", message: "Download cancelled" };
  }

  opts?.onPhase?.("installing");
  return installFromZipPath(destPath, item);
}

export function openMarketUrl(url: string | null | undefined): void {
  if (!url) return;
  openLinkInBrowser(url);
}
