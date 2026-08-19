import { fs } from "../cep/node";
import { preferencesJsonPath } from "../config/brand";
import { resolvePackPreviewsPath } from "./pack-folders";
import type {
  InstalledPackMeta,
  PackContent,
  PackInitError,
  PackInitResult,
  PackageFiletype,
} from "./pack-types";
import { PACKAGE_FILETYPES } from "./pack-types";
import {
  currentPackHost,
  normalizePackHost,
  resolveInstalledPackHost,
  packMetaMatchesHost,
  type PackHostId,
} from "./pack-host";

export type InitPackageCallback = (
  result: PackInitResult | false,
  error?: PackInitError,
) => void;

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function" && typeof fs?.readFile === "function";
}

/**
 * Check whether filename matches a Motionflow pack extension (`.motionflow` / legacy `.spunkram`).
 */
export function parsePackageFileFormat(
  filename: string,
  customFileType?: PackageFiletype | string,
): boolean {
  const match = /(?:\.([^.]+))?$/.exec(filename.toString());
  const format = match?.[1]?.toLowerCase();
  if (!format) return false;
  if (customFileType) return format === customFileType.toLowerCase();
  return (PACKAGE_FILETYPES as readonly string[]).includes(format);
}

/**
 * Normalize plaintext pack JSON. Market packs use `contents` (composer) or
 * `content` for the tree; older exports used `structure`. All map to the
 * in-memory `structure` field used by the panel.
 */
function parseJsonPackContent(raw: string): PackContent {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  const parsed = JSON.parse(cleaned) as {
    settings?: PackContent["settings"];
    structure?: PackContent["structure"];
    content?: PackContent["structure"];
    contents?: PackContent["structure"];
  };
  const structure = parsed.structure ?? parsed.contents ?? parsed.content;
  if (!parsed?.settings || !structure || typeof structure !== "object") {
    throw new Error("Missing settings or content");
  }
  return { settings: parsed.settings, structure };
}

function looksLikeJsonPack(raw: string): boolean {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  return cleaned.startsWith("{");
}

function toInitResult(content: PackContent): PackInitResult {
  return {
    method: "JSON",
    full_content: content,
    settings: content.settings,
    structure: content.structure,
    header_bytes: "",
    pack_hash: "",
  };
}

function readPackUtf8(data: string | Buffer): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  return String(data);
}

/**
 * Read and parse a plaintext Motionflow pack file (JSON).
 */
export function initPackage(
  packPath: string,
  initCallback: InitPackageCallback,
  options?: { testMode?: boolean },
): void {
  if (!cepFsAvailable()) {
    initCallback(false, "CANT_OPEN");
    return;
  }

  if (!fs.existsSync(packPath)) {
    initCallback(false, "PACK_NOT_FOUND");
    return;
  }

  fs.readFile(packPath, (err, data) => {
    if (err || data == null) {
      initCallback(false, "CANT_OPEN");
      return;
    }

    const asUtf8 = readPackUtf8(data);

    if (!looksLikeJsonPack(asUtf8)) {
      initCallback(false, "CORRUPTED_PACK");
      return;
    }

    try {
      initCallback(toInitResult(parseJsonPackContent(asUtf8)));
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : String(ex);
      if (options?.testMode) {
        initCallback(false, `CORRUPTED_TEST_PACK|${message}`);
      } else {
        initCallback(false, "CORRUPTED_PACK");
      }
    }
  });
}

/** Promise wrapper around {@link initPackage}. */
export function initPackageAsync(
  packPath: string,
  options?: { testMode?: boolean },
): Promise<PackInitResult> {
  return new Promise((resolve, reject) => {
    initPackage(
      packPath,
      (result, error) => {
        if (result) resolve(result);
        else reject(new Error(error ?? "UNKNOWN_ERROR"));
      },
      options,
    );
  });
}

/** Synchronous read — useful when already on the CEP Node thread. */
export function initPackageSync(
  packPath: string,
  options?: { testMode?: boolean },
): PackInitResult {
  if (!cepFsAvailable() || typeof fs.readFileSync !== "function") {
    throw new Error("CANT_OPEN");
  }
  if (!fs.existsSync(packPath)) {
    throw new Error("PACK_NOT_FOUND");
  }

  const asUtf8 = readPackUtf8(fs.readFileSync(packPath));

  if (!looksLikeJsonPack(asUtf8)) {
    throw new Error("CORRUPTED_PACK");
  }

  try {
    return toInitResult(parseJsonPackContent(asUtf8));
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : String(ex);
    if (options?.testMode) {
      throw new Error(`CORRUPTED_TEST_PACK|${message}`);
    }
    throw new Error("CORRUPTED_PACK");
  }
}

/** Human-friendly message for a {@link PackInitError} code. */
export function packInitErrorMessage(error: string): string {
  const [code, detail] = error.split("|");
  switch (code) {
    case "PACK_NOT_FOUND":
      return "The pack file is missing on disk.";
    case "CANT_OPEN":
      return "Couldn't open the pack file.";
    case "CORRUPTED_PACK":
      return "This pack file looks corrupted. Remove it and Install again from Market if needed.";
    case "CORRUPTED_TEST_PACK":
      return detail || "This test pack looks corrupted.";
    default:
      return detail || code || "Unknown error loading pack.";
  }
}

/** Resolve preview-media folder next to the pack file (`Previews`). */
export function resolvePackAssetsPath(packFilePath: string): string {
  return resolvePackPreviewsPath(packFilePath);
}

/** Default `preferences.json` location for Motionflow CEP. */
export function getPreferencesCandidates(): string[] {
  const prefPath = preferencesJsonPath();
  return prefPath ? [prefPath] : [];
}

export function readInstalledPackagesFromPreferences(
  preferencesPath?: string,
): InstalledPackMeta[] {
  if (!cepFsAvailable() || typeof fs.readFileSync !== "function") return [];

  const candidates = preferencesPath
    ? [preferencesPath]
    : getPreferencesCandidates();

  for (const prefPath of candidates) {
    if (!fs.existsSync(prefPath)) continue;
    try {
      const raw = fs.readFileSync(prefPath, { encoding: "utf8" }).toString();
      if (!raw.trim()) return [];
      const json = JSON.parse(raw) as { packages?: InstalledPackMeta[] };
      // First existing prefs file wins — even when packages is [].
      if (Array.isArray(json.packages)) {
        return json.packages;
      }
      return [];
    } catch {
      // unreadable / empty wipe → treat as no packages for this path
      return [];
    }
  }
  return [];
}

/** All installed pack files (any host). Prefer {@link readInstallablePackages}. */
export function readAllInstallablePackages(): InstalledPackMeta[] {
  return readInstalledPackagesFromPreferences().filter(
    (p) => p.path && parsePackageFileFormat(p.path),
  );
}

/**
 * Installed packs for a host. Defaults to the current CEP host.
 * Packs with unknown/mismatched `appID` are excluded.
 */
export function readInstallablePackages(
  host: PackHostId | null = currentPackHost(),
): InstalledPackMeta[] {
  const all = readAllInstallablePackages();
  if (!host) return [];
  return all.filter((p) => packMetaMatchesHost(p, host));
}

/** Load one specific installed pack (used by the multi-pack switcher). */
export async function loadInstalledPack(meta: InstalledPackMeta): Promise<{
  meta: InstalledPackMeta;
  pack: PackInitResult;
  assetsPath: string;
}> {
  const host = currentPackHost();
  const pack = await initPackageAsync(meta.path);
  const resolvedHost =
    resolveInstalledPackHost(meta) ||
    normalizePackHost(pack.settings.main.software_id);
  if (host && (!resolvedHost || resolvedHost !== host)) {
    const other = host === "AE" ? "Premiere Pro" : "After Effects";
    throw new Error(
      resolvedHost
        ? `This pack is for ${other}. Open it there.`
        : "This pack has no host app id and can't be opened here.",
    );
  }
  return {
    meta,
    pack,
    assetsPath: resolvePackAssetsPath(meta.path),
  };
}

/**
 * Load the first installed pack for the current host (if any).
 */
export async function loadFirstInstalledPack(): Promise<{
  meta: InstalledPackMeta;
  pack: PackInitResult;
  assetsPath: string;
} | null> {
  const meta = readInstallablePackages()[0];
  if (!meta) return null;
  return loadInstalledPack(meta);
}
