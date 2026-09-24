/**
 * CEP market catalog — Motionflow only.
 *
 * `GET /api/cep/market?host=` with Bearer; install via authenticated download.
 * @see next-app/CEP_API.md
 */
import { API_BASE, apiUrl } from "./config";
import { cepHttpRequest } from "@/lib/api/cep-http";
import { getSessionToken, handleUnauthorized, sessionAuthHeaders, } from "@/lib/api/session";
import { openLinkInBrowser } from "@/lib/utils/bolt";
import { fs, os, path } from "@/lib/cep/node";
import { loadPreferencesFile, resolvePreferencesPath, savePreferencesFile, } from "@/lib/api/preferences";
import { downloadToFile } from "@/utils/download-file";
import { isAbortLikeError } from "@/utils/user-error";
import { installPackFromFile } from "@/lib/utils/pack-install";
import { installPackFonts } from "@/lib/utils/pack-fonts";
import { extractZipToFolder, ExtractAbortedError } from "@/lib/utils/pack-zip";
import { readLocalPackManifest, removeFilesNotInManifest, resolvePackBundleDir, writeLocalPackManifest, } from "@/lib/utils/pack-manifest";
import { version as EXTENSION_VERSION } from "../../shared/shared";
import { BRAND } from "@brands";
import { buildPackEntitlementContext, installedPackMatchesMarketItem, } from "@/lib/utils/pack-entitlement";
export { installedPackMatchesMarketItem };
export const CEP_MARKET_ENDPOINT = "/api/cep/market";
export const CEP_MARKET_DIFF_ENDPOINT = "/api/cep/market/diff";
export const CEP_MARKET_STRUCTURE_ENDPOINT = "/api/cep/market/structure";
const SITE_ORIGIN = API_BASE;
const structureCache = new Map();
function authHeaders() {
    return sessionAuthHeaders();
}
function defaultSubscribeUrl() {
    return `${SITE_ORIGIN}/pricing?client=${BRAND.apiClient}`;
}
/** Trim + drop a leading `v` so catalog `1.0.0` matches pack-file `v1.0.0`. */
export function normalizePackVersion(raw) {
    return String(raw ?? "")
        .trim()
        .replace(/^v/i, "");
}
/** Compare dotted versions; returns negative if a < b, 0 if equal, positive if a > b. */
export function compareDottedVersions(a, b) {
    const pa = normalizePackVersion(a)
        .split(".")
        .map((n) => parseInt(n, 10) || 0);
    const pb = normalizePackVersion(b)
        .split(".")
        .map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0)
            return d;
    }
    return 0;
}
export function checkPackVersionGates(item, opts) {
    const extVer = opts?.extensionVersion ?? EXTENSION_VERSION;
    if (item.min_extension_version &&
        compareDottedVersions(extVer, item.min_extension_version) < 0) {
        return {
            ok: false,
            message: `This pack requires panel v${item.min_extension_version} or newer (you have ${extVer}).`,
        };
    }
    const hostVer = opts?.hostVersion;
    if (item.min_host_version &&
        hostVer &&
        compareDottedVersions(hostVer, item.min_host_version) < 0) {
        return {
            ok: false,
            message: `This pack requires host v${item.min_host_version} or newer (you have ${hostVer}).`,
        };
    }
    return { ok: true };
}
function normalizePackage(raw) {
    const price = typeof raw.custom_price === "number"
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
        version: raw.version != null ? String(raw.version) : undefined,
        min_extension_version: raw.min_extension_version ?? null,
        min_host_version: raw.min_host_version ?? null,
    };
}
/** Load AE + PR catalog rows for disk scan entitlement checks. */
export async function fetchCombinedMarketCatalog() {
    const token = getSessionToken();
    if (!token) {
        return { catalog: [], subscriptionActive: false, error: "UNAUTHORIZED" };
    }
    const [ae, pr] = await Promise.all([fetchCepMarket("AE"), fetchCepMarket("PR")]);
    if (ae.error === "UNAUTHORIZED" || pr.error === "UNAUTHORIZED") {
        return { catalog: [], subscriptionActive: false, error: "UNAUTHORIZED" };
    }
    const catalog = [...(ae.data?.Packages ?? []), ...(pr.data?.Packages ?? [])];
    const subscriptionActive = Boolean(ae.data?.subscription_active || pr.data?.subscription_active);
    return { catalog, subscriptionActive };
}
/** Entitlement snapshot for disk scan (AE + PR catalog, subscription, purchases). */
export async function resolvePackEntitlementContextForScan(opts) {
    const { catalog, subscriptionActive, error } = await fetchCombinedMarketCatalog();
    return buildPackEntitlementContext({
        signedIn: opts.signedIn && error !== "UNAUTHORIZED",
        subscriptionActive,
        purchases: opts.purchases,
        catalog,
    });
}
export function tagInstalledPackWithMarketId(meta, marketId, version) {
    const id = String(marketId);
    const catalogVersion = normalizePackVersion(version);
    const tagged = {
        ...meta,
        marketId: id,
        ...(catalogVersion ? { version: catalogVersion } : {}),
    };
    try {
        const prefs = loadPreferencesFile();
        const packages = Array.isArray(prefs.packages)
            ? [...prefs.packages]
            : [];
        const idx = packages.findIndex((p) => p.path === meta.path);
        if (idx >= 0) {
            packages[idx] = {
                ...packages[idx],
                marketId: id,
                ...(catalogVersion ? { version: catalogVersion } : {}),
            };
            prefs.packages = packages;
            savePreferencesFile(prefs);
        }
    }
    catch {
        // best-effort — matching still works via fuzzy name for this session
    }
    return tagged;
}
/**
 * Load author packs from Motionflow `GET /api/cep/market?host=`.
 */
export async function fetchCepMarket(host) {
    const token = getSessionToken();
    if (!token) {
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
            const errBody = JSON.parse(result.text);
            return { error: errBody.error || errBody.message || "NO_SUCCESS_LOAD" };
        }
        catch {
            return { error: result.error || "NO_SUCCESS_LOAD" };
        }
    }
    try {
        const data = JSON.parse(result.text);
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
    }
    catch {
        return { error: "NO_SUCCESS_LOAD" };
    }
}
/**
 * Load pack settings + category tree from R2 via next-app.
 * Uses If-None-Match / in-memory cache so sidebar can refresh cheaply.
 */
export async function fetchCepMarketStructure(packId) {
    const token = getSessionToken();
    if (!token) {
        return { error: "UNAUTHORIZED" };
    }
    const id = String(packId).trim();
    if (!id)
        return { error: "MISSING_PARAMS" };
    const cached = structureCache.get(id);
    const headers = authHeaders();
    if (cached?.etag)
        headers["If-None-Match"] = cached.etag;
    const url = apiUrl(`${CEP_MARKET_STRUCTURE_ENDPOINT}?pack_id=${encodeURIComponent(id)}`);
    const result = await cepHttpRequest(url, {
        method: "GET",
        headers,
    });
    if (result.status === 304 && cached) {
        return { data: cached.data, notModified: true };
    }
    if (!result.ok) {
        if (result.status === 401) {
            handleUnauthorized();
            return { error: "UNAUTHORIZED" };
        }
        try {
            const errBody = JSON.parse(result.text);
            return { error: errBody.error || errBody.message || "NO_SUCCESS_LOAD" };
        }
        catch {
            return { error: result.error || "NO_SUCCESS_LOAD" };
        }
    }
    try {
        const raw = JSON.parse(result.text);
        const content = raw.content ?? raw.contents ?? raw.structure;
        if (!raw.settings || !content || typeof content !== "object") {
            return { error: "NO_STRUCTURE" };
        }
        const data = {
            pack_id: String(raw.pack_id ?? id),
            pack_name: String(raw.pack_name || ""),
            version: String(raw.version || ""),
            etag: raw.etag,
            settings: raw.settings,
            content,
        };
        if (data.etag) {
            structureCache.set(id, { etag: data.etag, data });
        }
        return { data };
    }
    catch {
        return { error: "NO_SUCCESS_LOAD" };
    }
}
function resolvePackCacheDir() {
    const prefPath = resolvePreferencesPath();
    const base = prefPath
        ? path.dirname(prefPath)
        : path.join(os.tmpdir(), BRAND.appDataFolder);
    const dir = path.join(base, "pack-cache");
    if (typeof fs?.existsSync === "function" && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
/** Stable zip path per market pack id — overwritten on update/re-download. */
export function resolveCachedPackZipPath(item) {
    const safeId = String(item.id).replace(/[\\/:*?"<>|]/g, "_");
    return path.join(resolvePackCacheDir(), `${safeId}.zip`);
}
export function hasCachedPackZip(item) {
    try {
        const p = resolveCachedPackZipPath(item);
        if (typeof fs?.existsSync !== "function" || !fs.existsSync(p))
            return false;
        // Ignore empty / truncated leftovers.
        if (typeof fs.statSync === "function") {
            const st = fs.statSync(p);
            if (!st || !st.size || st.size < 64)
                return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
function removeCachedPackZip(zipPath) {
    try {
        if (fs.existsSync(zipPath))
            fs.unlinkSync(zipPath);
    }
    catch {
        /* ignore */
    }
}
async function installFromZipPath(zipPath, item, opts) {
    const installed = await installPackFromFile(zipPath, { signal: opts?.signal });
    if (!installed.ok) {
        const isCancelled = opts?.signal?.aborted || installed.message === "Installation cancelled";
        if (isCancelled) {
            return { ok: false, code: "ABORTED", message: "Installation cancelled" };
        }
        return { ok: false, message: installed.message, cachedZipPath: zipPath };
    }
    const meta = item
        ? tagInstalledPackWithMarketId(installed.meta, item.id, item.version)
        : installed.meta;
    removeCachedPackZip(zipPath);
    return { ok: true, meta };
}
/**
 * Install from a previously downloaded zip (no network).
 * Does not fall back to download — caller decides whether to re-fetch.
 */
export async function installCachedPack(item, opts) {
    const zipPath = resolveCachedPackZipPath(item);
    if (!hasCachedPackZip(item)) {
        return { ok: false, code: "NO_CACHE", message: "Cached pack zip not found." };
    }
    return installFromZipPath(zipPath, item, opts);
}
/**
 * Authenticated pack download: Bearer on first hop, follow redirects to CDN/R2
 * without re-sending Authorization, then install from the zip.
 *
 * The zip is written to a stable pack-cache path and kept until install
 * succeeds (or overwritten on the next download of the same pack).
 */
export async function downloadAndInstallPack(item, opts) {
    const gate = checkPackVersionGates(item);
    if (!gate.ok)
        return { ok: false, message: gate.message };
    const destPath = resolveCachedPackZipPath(item);
    if (opts?.preferCache && hasCachedPackZip(item)) {
        opts.onPhase?.("installing");
        return installFromZipPath(destPath, item, { signal: opts.signal });
    }
    const token = getSessionToken();
    if (!token) {
        return { ok: false, code: "UNAUTHORIZED", message: "Sign in to install packs." };
    }
    const installUrl = item.install_url ||
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
                    const parsed = JSON.parse(body);
                    const code = parsed.error || `HTTP_${status}`;
                    const message = parsed.message || code;
                    throw Object.assign(new Error(message), { code, status });
                }
                catch (e) {
                    if (e && typeof e === "object" && "code" in e)
                        throw e;
                    throw Object.assign(new Error(`Download failed (${status})`), {
                        code: `HTTP_${status}`,
                        status,
                    });
                }
            },
        });
    }
    catch (e) {
        const code = e && typeof e === "object" && "code" in e
            ? String(e.code)
            : undefined;
        const message = e instanceof Error ? e.message : String(e);
        if (code === "ABORTED" || opts?.signal?.aborted || isAbortLikeError(e)) {
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
    return installFromZipPath(destPath, item, { signal: opts?.signal });
}
/** True when the catalog version is newer than the installed prefs entry. */
export function installedPackNeedsUpdate(meta, item) {
    const remote = normalizePackVersion(item.version);
    const local = normalizePackVersion(meta.version);
    if (!remote)
        return false;
    if (!local)
        return true;
    return compareDottedVersions(local, remote) < 0;
}
function updateInstalledPackVersion(meta, version, marketId) {
    const next = {
        ...meta,
        version,
        ...(marketId != null ? { marketId: String(marketId) } : {}),
    };
    try {
        const prefs = loadPreferencesFile();
        const packages = Array.isArray(prefs.packages)
            ? [...prefs.packages]
            : [];
        const idx = packages.findIndex((p) => p.path === meta.path);
        if (idx >= 0) {
            packages[idx] = { ...packages[idx], ...next };
            prefs.packages = packages;
            savePreferencesFile(prefs);
        }
    }
    catch {
        /* best-effort */
    }
    return next;
}
/**
 * Incremental pack update: POST local manifest → diff zip → extract over pack folder.
 * Falls back to full zip when the server has no R2 content prefix (`NO_DIFF_SOURCE`).
 */
export async function downloadAndApplyPackDiff(item, meta, opts) {
    const gate = checkPackVersionGates(item);
    if (!gate.ok)
        return { ok: false, message: gate.message };
    const token = getSessionToken();
    if (!token) {
        return { ok: false, code: "UNAUTHORIZED", message: "Sign in to update packs." };
    }
    const packDir = resolvePackBundleDir(meta.path);
    const localManifest = readLocalPackManifest(packDir);
    if (localManifest == null) {
        return downloadAndInstallPack(item, opts);
    }
    const destPath = path.join(resolvePackCacheDir(), `${String(item.id).replace(/[\\/:*?"<>|]/g, "_")}-diff.zip`);
    opts?.onPhase?.("downloading");
    try {
        await downloadToFile(apiUrl(CEP_MARKET_DIFF_ENDPOINT), destPath, {
            method: "POST",
            timeoutMs: 15 * 60 * 1000,
            headers: {
                ...sessionAuthHeaders(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                pack_id: Number(item.id) || item.id,
                manifest: localManifest,
            }),
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
                    const parsed = JSON.parse(body);
                    const code = parsed.error || `HTTP_${status}`;
                    const message = parsed.message || code;
                    throw Object.assign(new Error(message), { code, status });
                }
                catch (e) {
                    if (e && typeof e === "object" && "code" in e)
                        throw e;
                    throw Object.assign(new Error(`Diff download failed (${status})`), {
                        code: `HTTP_${status}`,
                        status,
                    });
                }
            },
        });
    }
    catch (e) {
        const code = e && typeof e === "object" && "code" in e
            ? String(e.code)
            : undefined;
        const message = e instanceof Error ? e.message : String(e);
        if (code === "ABORTED" || opts?.signal?.aborted || isAbortLikeError(e)) {
            return { ok: false, code: "ABORTED", message: "Download cancelled" };
        }
        if (code === "NO_DIFF_SOURCE" ||
            code === "NO_DOWNLOAD_KEY" ||
            code === "NO_BUCKET") {
            return downloadAndInstallPack(item, opts);
        }
        if (code === "NOT_OWNED" || code === "SUBSCRIPTION_REQUIRED") {
            return {
                ok: false,
                code,
                message,
                buy_url: item.buy_url,
                subscribe_url: defaultSubscribeUrl(),
            };
        }
        if (code === "UNAUTHORIZED" || message.includes("(401)")) {
            handleUnauthorized();
            return {
                ok: false,
                code: "UNAUTHORIZED",
                message: "Session expired — please sign in again.",
            };
        }
        // Network / server errors: try full zip as last resort
        return downloadAndInstallPack(item, opts);
    }
    if (opts?.signal?.aborted) {
        return { ok: false, code: "ABORTED", message: "Download cancelled" };
    }
    opts?.onPhase?.("installing");
    try {
        const oldManifest = localManifest;
        extractZipToFolder(destPath, packDir, { signal: opts?.signal });
        const newManifest = readLocalPackManifest(packDir) ?? oldManifest;
        removeFilesNotInManifest(packDir, oldManifest, newManifest);
        if (newManifest != null)
            writeLocalPackManifest(packDir, newManifest);
        try {
            await installPackFonts(meta.path);
        }
        catch {
            /* fonts best-effort */
        }
        const version = normalizePackVersion(item.version) ||
            normalizePackVersion(meta.version) ||
            "1.0";
        const updated = updateInstalledPackVersion(meta, version, item.id);
        try {
            if (fs.existsSync(destPath))
                fs.unlinkSync(destPath);
        }
        catch {
            /* ignore */
        }
        return { ok: true, meta: updated };
    }
    catch (e) {
        if (e instanceof ExtractAbortedError || opts?.signal?.aborted) {
            return { ok: false, code: "ABORTED", message: "Installation cancelled" };
        }
        return {
            ok: false,
            message: e instanceof Error ? e.message : String(e),
        };
    }
}
/**
 * Install or update a market pack. Uses file-diff when an install with
 * `manifest.json` already exists; otherwise full zip.
 */
export async function downloadAndInstallOrUpdatePack(item, installed, opts) {
    if (installed &&
        installedPackNeedsUpdate(installed, item) &&
        readLocalPackManifest(resolvePackBundleDir(installed.path)) != null) {
        return downloadAndApplyPackDiff(item, installed, opts);
    }
    return downloadAndInstallPack(item, opts);
}
export function openMarketUrl(url) {
    if (!url)
        return;
    openLinkInBrowser(url);
}
