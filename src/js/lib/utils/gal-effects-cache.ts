/**
 * Gal Toolkit Max — on-disk cache for R2 Projects / _Assets.
 *
 * R2 (bucket gal-toolkit-max):
 *   {premiere-pro|after-effects}/Projects/…          — .prproj / .mogrt / footage
 *   {host}/Projects/_Assets/…                        — offline media for FULL_PROJECT
 *   {host}/Assets/…                                  — preview media only (public proxy)
 *
 * Host-root `manifest.json` may still list legacy zip paths
 * (`Gal Toolkit Max Premiere Pro/_Assets/…`); CEP rewrites those to
 * `Projects/_Assets/…` before download.
 *
 * Local virtual pack root (apply still uses `Assets/` via resolvePackTemplatesPath):
 *   {installRoot}/
 *     Gal Toolkit MAX.gal
 *     Assets/          ← Projects/* written here (R2 Projects/X → local Assets/X)
 *       _Assets/…
 *       Transitions/…
 *     gal-file-index.json
 */
import { fs, path } from "@/lib/cep/node";
import { readPrefSettings } from "@/lib/api/preferences";
import { getStylesRoot } from "@/styles/paths";
import {
  fetchGalAssetsManifest,
  fetchGalEffectsFileLink,
  type GalEffectsHost,
} from "@/api/gal-effects";
import { downloadToFile } from "@/utils/download-file";
import { getSessionToken } from "@/lib/api/session";
import {
  normalizePackManifest,
  type PackManifestMap,
} from "@/lib/utils/pack-manifest";
import {
  resolveItemSourceFile,
  type HostAppId,
} from "@/lib/utils/pack-apply-paths";
import type { PackSettings, PackTreeItem } from "@/lib/utils/pack-types";
import { currentPackHost } from "@/lib/utils/pack-host";
import { BRAND } from "@brands";

const STUB_PACK_NAME = "Gal Toolkit MAX.gal";
const FILE_INDEX_NAME = "gal-file-index.json";
const DOWNLOAD_CONCURRENCY = 3;
/** R2 folder under host prefix that holds projects + `_Assets` (not UI previews). */
const R2_PROJECTS_PREFIX = "Projects";

export type GalFileIndexEntry = {
  etag?: string;
  hash?: string;
  size?: number;
};

export type GalFileIndex = {
  host: GalEffectsHost;
  pack_version?: string;
  pack_etag?: string;
  manifest_etag?: string;
  files: Record<string, GalFileIndexEntry>;
};

export type GalAssetsSyncProgress = {
  phase: "checking" | "downloading" | "done" | "error";
  total: number;
  done: number;
  current?: string;
  error?: string;
};

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function" && typeof path?.join === "function";
}

function hostFromPackHost(): GalEffectsHost {
  return currentPackHost() === "AE" ? "AE" : "PR";
}

function hostAppIdFromGal(host: GalEffectsHost): HostAppId {
  return host === "AE" ? "AEFT" : "PPRO";
}

/**
 * Install root: Settings packages path if set, else AppData/gal-toolkit.
 * Files land under `{root}/{AE|PR}/` when a packages path is configured
 * (same host split as Market packs); AppData fallback is flat per host folder.
 */
export function resolveGalInstallRoot(
  host: GalEffectsHost = hostFromPackHost(),
): string | null {
  if (!cepFsAvailable()) return null;
  try {
    const custom = (readPrefSettings().absCustomAbsolutePath || "").trim();
    if (custom) {
      return path.join(path.normalize(custom), host);
    }
  } catch {
    /* fall through */
  }
  const appData = getStylesRoot();
  if (!appData) return null;
  return path.join(appData, "effects", host);
}

export function resolveGalPackStubPath(installRoot: string): string {
  return path.join(installRoot, STUB_PACK_NAME);
}

export function resolveGalAssetsPath(installRoot: string): string {
  return path.join(installRoot, "Assets");
}

export function resolveGalFileIndexPath(installRoot: string): string {
  return path.join(installRoot, FILE_INDEX_NAME);
}

/** Ensure stub pack file + Assets dir so resolvePackTemplatesPath works. */
export function ensureGalVirtualPackLayout(installRoot: string): {
  packFilePath: string;
  assetsPath: string;
} {
  const assetsPath = resolveGalAssetsPath(installRoot);
  const packFilePath = resolveGalPackStubPath(installRoot);
  try {
    if (!fs.existsSync(installRoot)) fs.mkdirSync(installRoot, { recursive: true });
    if (!fs.existsSync(assetsPath)) fs.mkdirSync(assetsPath, { recursive: true });
    if (!fs.existsSync(packFilePath)) {
      fs.writeFileSync(
        packFilePath,
        JSON.stringify(
          {
            settings: {
              main: {
                name: BRAND.panelDisplayName,
                version: "0",
                software_id: currentPackHost() === "AE" ? "AE" : "PR",
              },
            },
            content: {},
          },
          null,
          2,
        ),
        "utf8",
      );
    }
  } catch {
    /* best-effort */
  }
  return { packFilePath, assetsPath };
}

export function readGalFileIndex(installRoot: string): GalFileIndex {
  const empty: GalFileIndex = {
    host: hostFromPackHost(),
    files: {},
  };
  if (!cepFsAvailable()) return empty;
  const file = resolveGalFileIndexPath(installRoot);
  try {
    if (!fs.existsSync(file)) return empty;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as GalFileIndex;
    if (!raw || typeof raw !== "object") return empty;
    return {
      host: raw.host === "AE" ? "AE" : "PR",
      pack_version: raw.pack_version,
      pack_etag: raw.pack_etag,
      manifest_etag: raw.manifest_etag,
      files:
        raw.files && typeof raw.files === "object" && !Array.isArray(raw.files)
          ? raw.files
          : {},
    };
  } catch {
    return empty;
  }
}

export function writeGalFileIndex(
  installRoot: string,
  index: GalFileIndex,
): void {
  if (!cepFsAvailable()) return;
  try {
    if (!fs.existsSync(installRoot)) fs.mkdirSync(installRoot, { recursive: true });
    fs.writeFileSync(
      resolveGalFileIndexPath(installRoot),
      JSON.stringify(index, null, 2),
      "utf8",
    );
  } catch {
    /* ignore */
  }
}

function normalizeRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

/** Strip known R2 / local roots → path under the templates (`Assets`) folder. */
function stripToTemplatesRel(rel: string): string {
  let p = normalizeRel(rel);
  if (p === R2_PROJECTS_PREFIX) return "";
  if (p.startsWith(`${R2_PROJECTS_PREFIX}/`)) {
    p = p.slice(R2_PROJECTS_PREFIX.length + 1);
  } else if (p === "Assets") {
    return "";
  } else if (p.startsWith("Assets/")) {
    p = p.slice("Assets/".length);
  }
  return p;
}

/**
 * Canonical R2 key for offline media under the private Projects tree.
 *
 * Manifest historically lists zip-style paths like
 * `Gal Toolkit Max Premiere Pro/_Assets/FilmBurn…/file.mp4`, while files on R2
 * live at `Projects/_Assets/…`. Rewrite so sync downloads the real keys.
 */
export function canonicalizeGalAssetsRelPath(rel: string): string | null {
  const p = normalizeRel(rel);
  if (!p) return null;

  const lower = p.toLowerCase();
  const marker = "/_assets/";
  const idx = lower.indexOf(marker);
  if (idx >= 0) {
    const rest = p.slice(idx + marker.length);
    return rest ? `${R2_PROJECTS_PREFIX}/_Assets/${rest}` : null;
  }

  if (lower === "_assets") return null;
  if (lower === `${R2_PROJECTS_PREFIX.toLowerCase()}/_assets`) return null;
  if (lower.startsWith("_assets/")) {
    return `${R2_PROJECTS_PREFIX}/_Assets/${p.slice("_Assets/".length)}`;
  }
  if (lower.startsWith(`${R2_PROJECTS_PREFIX.toLowerCase()}/_assets/`)) {
    return `${R2_PROJECTS_PREFIX}/_Assets/${p.slice(`${R2_PROJECTS_PREFIX}/_Assets/`.length)}`;
  }
  if (lower.startsWith("assets/_assets/")) {
    return `${R2_PROJECTS_PREFIX}/_Assets/${p.slice("Assets/_Assets/".length)}`;
  }
  return null;
}

/** Paths under host prefix that belong to project `_Assets` (offline media). */
export function isGalAssetsMediaPath(rel: string): boolean {
  return canonicalizeGalAssetsRelPath(rel) != null;
}

/**
 * Map R2 path (relative to host prefix) → absolute disk path under installRoot.
 * `Projects/…` → `{root}/Assets/…` (apply expects the `Assets` sibling folder).
 */
export function galRelPathToDisk(installRoot: string, rel: string): string {
  const rest = stripToTemplatesRel(rel);
  if (!rest) return resolveGalAssetsPath(installRoot);
  return path.join(installRoot, "Assets", ...rest.split("/"));
}

/**
 * Absolute disk file under local Assets → R2 path under `Projects/`.
 */
export function galDiskToRelPath(
  installRoot: string,
  absoluteFile: string,
): string | null {
  const assets = resolveGalAssetsPath(installRoot);
  const normRoot = path.normalize(assets);
  const normFile = path.normalize(absoluteFile);
  if (!normFile.toLowerCase().startsWith(normRoot.toLowerCase())) return null;
  let rel = normFile.slice(normRoot.length).replace(/^[/\\]+/, "");
  rel = normalizeRel(rel);
  if (!rel) return null;
  return `${R2_PROJECTS_PREFIX}/${rel}`;
}

/** Build candidate R2 paths for a project file (Projects first, then legacy). */
function galProjectPathCandidates(rel: string): string[] {
  const n = normalizeRel(rel);
  const rest = stripToTemplatesRel(n);
  const out: string[] = [];
  const push = (p: string) => {
    const v = normalizeRel(p);
    if (v && !out.includes(v)) out.push(v);
  };
  if (rest) {
    push(`${R2_PROJECTS_PREFIX}/${rest}`);
    push(`Assets/${rest}`);
    push(rest);
  } else if (n) {
    push(n);
  }
  return out;
}

function indexEntryFor(
  index: GalFileIndex,
  rel: string,
): GalFileIndexEntry | undefined {
  const n = normalizeRel(rel);
  const rest = stripToTemplatesRel(n);
  const keys = [
    n,
    rest ? `${R2_PROJECTS_PREFIX}/${rest}` : "",
    rest ? `Assets/${rest}` : "",
    rest,
  ].filter(Boolean);
  for (const key of keys) {
    if (index.files[key]) return index.files[key];
  }
  return undefined;
}

function filterAssetsManifest(map: PackManifestMap): PackManifestMap {
  const out: PackManifestMap = new Map();
  for (const [rel, hash] of map) {
    const canonical = canonicalizeGalAssetsRelPath(rel);
    if (!canonical) continue;
    // Prefer first hash; later duplicate legacy paths share the same canonical key.
    if (!out.has(canonical)) out.set(canonical, hash);
  }
  return out;
}

function localFileLooksCurrent(
  diskPath: string,
  entry: GalFileIndexEntry | undefined,
  expectedHash?: string,
): boolean {
  if (!cepFsAvailable() || !fs.existsSync(diskPath)) return false;
  if (expectedHash && entry?.hash && entry.hash === expectedHash) return true;
  if (!expectedHash && entry?.etag) {
    try {
      const st = fs.statSync(diskPath);
      if (entry.size != null && st.size !== entry.size) return false;
      return true;
    } catch {
      return false;
    }
  }
  if (expectedHash && entry?.hash && entry.hash !== expectedHash) return false;
  // Hash known remotely but no local fingerprint — treat as stale.
  if (expectedHash && !entry?.hash) return false;
  return Boolean(entry);
}

async function downloadGalRelFile(opts: {
  host: GalEffectsHost;
  installRoot: string;
  relPath: string;
  signal?: AbortSignal;
  onProgress?: (bytesReceived: number, totalBytes: number | null) => void;
}): Promise<{ ok: true; etag: string; size: number | null; path: string } | { ok: false; error: string }> {
  const candidates = galProjectPathCandidates(opts.relPath);

  let lastError = "NOT_FOUND";
  for (const candidate of candidates) {
    const link = await fetchGalEffectsFileLink(opts.host, candidate);
    if (!link.data) {
      lastError = link.error || "NOT_FOUND";
      continue;
    }
    const dest = galRelPathToDisk(opts.installRoot, link.data.path);
    const destDir = path.dirname(dest);
    try {
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    try {
      await downloadToFile(link.data.url, dest, {
        signal: opts.signal,
        stripAuthOnRedirect: true,
        onProgress: (p) => opts.onProgress?.(p.bytesReceived, p.totalBytes),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }

    return {
      ok: true,
      etag: link.data.etag,
      size: link.data.size,
      path: link.data.path,
    };
  }

  return { ok: false, error: lastError };
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx]!);
      }
    },
  );
  await Promise.all(runners);
}

/**
 * Sync `_Assets/**` from R2 manifest into the virtual pack root.
 * Does not download .prproj / mogrt / previews.
 */
export async function syncGalAssetsFromManifest(opts: {
  host?: GalEffectsHost;
  packVersion?: string;
  packEtag?: string;
  signal?: AbortSignal;
  onProgress?: (p: GalAssetsSyncProgress) => void;
}): Promise<{ ok: boolean; error?: string; downloaded: number }> {
  const host = opts.host ?? hostFromPackHost();
  if (!getSessionToken()) {
    return { ok: false, error: "UNAUTHORIZED", downloaded: 0 };
  }

  const installRoot = resolveGalInstallRoot(host);
  if (!installRoot) {
    return { ok: false, error: "NO_INSTALL_ROOT", downloaded: 0 };
  }

  ensureGalVirtualPackLayout(installRoot);
  opts.onProgress?.({ phase: "checking", total: 0, done: 0 });

  const remote = await fetchGalAssetsManifest(host);
  if (!remote.data) {
    opts.onProgress?.({
      phase: "error",
      total: 0,
      done: 0,
      error: remote.error || "NO_MANIFEST",
    });
    return { ok: false, error: remote.error || "NO_MANIFEST", downloaded: 0 };
  }

  const index = readGalFileIndex(installRoot);
  // Same manifest etag and pack etag — nothing to do (still verify files exist).
  const remoteMap = filterAssetsManifest(
    normalizePackManifest(remote.data.manifest),
  );
  const toDownload: Array<{ rel: string; hash: string }> = [];
  for (const [rel, hash] of remoteMap) {
    const disk = galRelPathToDisk(installRoot, rel);
    const entry = indexEntryFor(index, rel);
    if (localFileLooksCurrent(disk, entry, hash)) continue;
    toDownload.push({ rel, hash });
  }

  // Delete stale _Assets paths that left the manifest.
  const staleKeys = Object.keys(index.files).filter((rel) => {
    if (!isGalAssetsMediaPath(rel)) return false;
    const n = normalizeRel(rel);
    if (remoteMap.has(n)) return false;
    const rest = stripToTemplatesRel(n);
    for (const r of remoteMap.keys()) {
      if (normalizeRel(r) === n) return false;
      if (stripToTemplatesRel(r) === rest) return false;
    }
    return true;
  });
  for (const rel of staleKeys) {
    try {
      const disk = galRelPathToDisk(installRoot, rel);
      if (fs.existsSync(disk)) fs.unlinkSync(disk);
    } catch {
      /* ignore */
    }
    delete index.files[rel];
  }

  if (toDownload.length === 0) {
    index.host = host;
    index.manifest_etag = remote.data.etag;
    if (opts.packVersion) index.pack_version = opts.packVersion;
    if (opts.packEtag) index.pack_etag = opts.packEtag;
    writeGalFileIndex(installRoot, index);
    opts.onProgress?.({ phase: "done", total: 0, done: 0 });
    return { ok: true, downloaded: 0 };
  }

  let done = 0;
  let firstError: string | undefined;
  opts.onProgress?.({
    phase: "downloading",
    total: toDownload.length,
    done: 0,
  });

  await runPool(toDownload, DOWNLOAD_CONCURRENCY, async ({ rel, hash }) => {
    if (opts.signal?.aborted) return;
    opts.onProgress?.({
      phase: "downloading",
      total: toDownload.length,
      done,
      current: rel,
    });
    // Prefer path as listed in manifest; BE resolves under host prefix.
    const result = await downloadGalRelFile({
      host,
      installRoot,
      relPath: rel,
      signal: opts.signal,
    });
    done += 1;
    if (result.ok) {
      const storedRel = normalizeRel(result.path);
      index.files[storedRel] = {
        etag: result.etag,
        hash,
        size: result.size ?? undefined,
      };
    } else if (!firstError) {
      firstError = result.error;
    }
    opts.onProgress?.({
      phase: "downloading",
      total: toDownload.length,
      done,
      current: rel,
    });
  });

  index.host = host;
  index.manifest_etag = remote.data.etag;
  if (opts.packVersion) index.pack_version = opts.packVersion;
  if (opts.packEtag) index.pack_etag = opts.packEtag;
  writeGalFileIndex(installRoot, index);

  if (opts.signal?.aborted) {
    opts.onProgress?.({
      phase: "error",
      total: toDownload.length,
      done,
      error: "ABORTED",
    });
    return { ok: false, error: "ABORTED", downloaded: done };
  }

  if (firstError) {
    opts.onProgress?.({
      phase: "error",
      total: toDownload.length,
      done,
      error: firstError,
    });
    return { ok: false, error: firstError, downloaded: done };
  }

  opts.onProgress?.({
    phase: "done",
    total: toDownload.length,
    done: toDownload.length,
  });
  return { ok: true, downloaded: toDownload.length };
}

/**
 * Ensure the source file for a pack item is on disk (version-check via /file etag).
 * FULL_PROJECT → group `.prproj`; MOGRT/footage/audio/AE → 1:1 source.
 */
export async function ensureGalItemOnDisk(opts: {
  item: PackTreeItem;
  settings: PackSettings | null;
  host?: GalEffectsHost;
  signal?: AbortSignal;
  onProgress?: (bytesReceived: number, totalBytes: number | null) => void;
}): Promise<
  | {
      ok: true;
      packFilePath: string;
      assetsPath: string;
      filePath: string;
      skipped: boolean;
    }
  | { ok: false; error: string }
> {
  const host = opts.host ?? hostFromPackHost();
  const installRoot = resolveGalInstallRoot(host);
  if (!installRoot) return { ok: false, error: "NO_INSTALL_ROOT" };

  const { packFilePath, assetsPath } = ensureGalVirtualPackLayout(installRoot);
  const appId = hostAppIdFromGal(host);

  let resolved;
  try {
    resolved = resolveItemSourceFile(
      opts.item,
      packFilePath,
      appId,
      opts.settings,
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (!resolved || resolved.ctype === "UNSUPPORTED") {
    return { ok: false, error: "UNSUPPORTED_ITEM" };
  }

  const rel = galDiskToRelPath(installRoot, resolved.file);
  if (!rel) {
    return { ok: false, error: "BAD_LOCAL_PATH" };
  }

  const index = readGalFileIndex(installRoot);
  const indexEntry = indexEntryFor(index, rel);

  // Ask BE for current etag under Projects/ (legacy Assets/ still tried).
  const pathCandidates = galProjectPathCandidates(rel);

  let linkData: Awaited<ReturnType<typeof fetchGalEffectsFileLink>>["data"];
  let linkError = "NOT_FOUND";
  for (const candidate of pathCandidates) {
    const link = await fetchGalEffectsFileLink(host, candidate);
    if (link.data) {
      linkData = link.data;
      break;
    }
    linkError = link.error || "NOT_FOUND";
  }

  if (!linkData) {
    // Fall back: maybe file already on disk from zip install.
    if (fs.existsSync(resolved.file)) {
      return {
        ok: true,
        packFilePath,
        assetsPath,
        filePath: resolved.file,
        skipped: true,
      };
    }
    return { ok: false, error: linkError };
  }

  const remoteEtag = (linkData.etag || "").replace(/^W\//, "").replace(/"/g, "");
  const localEtag = (indexEntry?.etag || "").replace(/^W\//, "").replace(/"/g, "");
  const exists = fs.existsSync(resolved.file);
  const sizeOk =
    linkData.size == null ||
    !exists ||
    (() => {
      try {
        return fs.statSync(resolved.file).size === linkData!.size;
      } catch {
        return false;
      }
    })();

  if (exists && remoteEtag && localEtag && remoteEtag === localEtag && sizeOk) {
    return {
      ok: true,
      packFilePath,
      assetsPath,
      filePath: resolved.file,
      skipped: true,
    };
  }

  const dest = galRelPathToDisk(installRoot, linkData.path);
  const destDir = path.dirname(dest);
  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    await downloadToFile(linkData.url, dest, {
      signal: opts.signal,
      stripAuthOnRedirect: true,
      onProgress: (p) => opts.onProgress?.(p.bytesReceived, p.totalBytes),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const storedRel = normalizeRel(linkData.path);
  index.files[storedRel] = {
    etag: linkData.etag,
    size: linkData.size ?? undefined,
    hash: indexEntry?.hash,
  };
  index.host = host;
  writeGalFileIndex(installRoot, index);

  return {
    ok: true,
    packFilePath,
    assetsPath,
    filePath: dest,
    skipped: false,
  };
}

/** Whether `_Assets` folder has at least one file (FULL_PROJECT relink). */
export function galOfflineAssetsPresent(installRoot: string | null): boolean {
  if (!installRoot || !cepFsAvailable()) return false;
  const root = path.join(resolveGalAssetsPath(installRoot), "_Assets");
  try {
    if (!fs.existsSync(root)) return false;
    const walk = (dir: string): boolean => {
      const entries = fs.readdirSync(dir) as string[];
      for (const name of entries) {
        const full = path.join(dir, name);
        try {
          const st = fs.statSync(full);
          if (st.isFile()) return true;
          if (st.isDirectory() && walk(full)) return true;
        } catch {
          /* skip */
        }
      }
      return false;
    };
    return walk(root);
  } catch {
    return false;
  }
}

export function galItemLocallyCached(
  item: PackTreeItem,
  settings: PackSettings | null,
  host: GalEffectsHost = hostFromPackHost(),
): boolean {
  const installRoot = resolveGalInstallRoot(host);
  if (!installRoot) return false;
  const packFilePath = resolveGalPackStubPath(installRoot);
  if (!fs.existsSync(packFilePath)) return false;
  try {
    const resolved = resolveItemSourceFile(
      item,
      packFilePath,
      hostAppIdFromGal(host),
      settings,
    );
    if (!resolved || resolved.ctype === "UNSUPPORTED") return false;
    return fs.existsSync(resolved.file);
  } catch {
    return false;
  }
}
