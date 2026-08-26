import { fs, path } from "../cep/node";
import { packItemIsAudio } from "./pack-apply-paths";
import { resolveItemAssetSegments } from "./pack-tree";
import type { PackSettings, PackTreeItem } from "./pack-types";

export type PreviewMotionKind = "webm" | "mp4" | "gif";

export type ItemPreviewMedia = {
  /** Absolute poster path — load via `loadPreviewObjectUrl` near viewport. */
  posterPath: string | null;
  /** Absolute motion path — blob URL created lazily on hover / play. */
  motion: {
    kind: PreviewMotionKind;
    path: string;
  } | null;
};

const POSTER_EXTS = [".png", ".jpg", ".jpeg"] as const;

/** Cap concurrent FS→blob reads so CEP main thread stays responsive. */
const MAX_CONCURRENT_READS = 3;

type ObjectUrlEntry = {
  url: string;
  refs: number;
  revokeTimer: ReturnType<typeof setTimeout> | null;
};

const objectUrlCache = new Map<string, ObjectUrlEntry>();

/** Let React unmount `<img>`/`<video>` before the blob is dropped (Strict Mode, filters). */
const REVOKE_DELAY_MS = 250;

type ReadJob = {
  path: string;
  resolve: (url: string | null) => void;
};

let activeReads = 0;
const readQueue: ReadJob[] = [];

function cepFsAvailable(): boolean {
  return (
    typeof fs?.existsSync === "function" &&
    typeof fs?.readFileSync === "function"
  );
}

function mimeFromExt(filePath: string): string {
  const ext =
    typeof path?.extname === "function"
      ? path.extname(filePath).toLowerCase()
      : filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webm":
      return "video/webm";
    case ".mp4":
      return "video/mp4";
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
    case ".aac":
      return "audio/mp4";
    case ".aif":
    case ".aiff":
      return "audio/aiff";
    case ".flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}

function cancelScheduledRevoke(entry: ObjectUrlEntry): void {
  if (!entry.revokeTimer) return;
  clearTimeout(entry.revokeTimer);
  entry.revokeTimer = null;
}

function retainEntry(entry: ObjectUrlEntry): string {
  entry.refs += 1;
  cancelScheduledRevoke(entry);
  return entry.url;
}

function dropEntry(path: string, entry: ObjectUrlEntry): void {
  cancelScheduledRevoke(entry);
  URL.revokeObjectURL(entry.url);
  objectUrlCache.delete(path);
}

/**
 * Read a local file via CEP Node and expose it as a blob: URL.
 * Native `C:\...` paths are parsed as scheme `c:` → ERR_UNKNOWN_URL_SCHEME.
 * `file://` is often blocked from the panel's http origin.
 * Does not retain — callers that display the URL must use `loadPreviewObjectUrl`.
 */
export function pathToObjectUrl(absolutePath: string): string | null {
  if (!absolutePath || !cepFsAvailable()) return null;

  const cached = objectUrlCache.get(absolutePath);
  if (cached) return cached.url;

  try {
    const data = fs.readFileSync(absolutePath) as Buffer;
    // Copy into a standalone Uint8Array — CEP Blob rejects pooled Buffer views.
    const bytes = new Uint8Array(data);
    const blob = new Blob([bytes], { type: mimeFromExt(absolutePath) });
    const url = URL.createObjectURL(blob);
    objectUrlCache.set(absolutePath, { url, refs: 0, revokeTimer: null });
    return url;
  } catch {
    return null;
  }
}

function pumpReadQueue(): void {
  while (activeReads < MAX_CONCURRENT_READS && readQueue.length > 0) {
    const job = readQueue.shift();
    if (!job) break;
    activeReads += 1;
    // Yield between reads so CEF can paint / handle input.
    setTimeout(() => {
      try {
        job.resolve(pathToObjectUrl(job.path));
      } catch {
        job.resolve(null);
      } finally {
        activeReads -= 1;
        pumpReadQueue();
      }
    }, 0);
  }
}

/**
 * Resolve a file to a blob URL with a concurrency-limited queue.
 * Each successful call retains the URL — pair with `releasePreviewObjectUrl`.
 */
export function loadPreviewObjectUrl(absolutePath: string): Promise<string | null> {
  if (!absolutePath) return Promise.resolve(null);
  const cached = objectUrlCache.get(absolutePath);
  if (cached) return Promise.resolve(retainEntry(cached));

  return new Promise((resolve) => {
    readQueue.push({
      path: absolutePath,
      resolve: (url) => {
        if (!url) {
          resolve(null);
          return;
        }
        const entry = objectUrlCache.get(absolutePath);
        resolve(entry ? retainEntry(entry) : url);
      },
    });
    pumpReadQueue();
  });
}

/**
 * Drop one retain from `loadPreviewObjectUrl`. The blob is revoked after a short
 * delay once no retainers remain, so Strict Mode remounts can reuse the same URL.
 */
export function releasePreviewObjectUrl(absolutePath: string): void {
  if (!absolutePath) return;
  const entry = objectUrlCache.get(absolutePath);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0 || entry.revokeTimer) return;
  entry.revokeTimer = setTimeout(() => {
    const current = objectUrlCache.get(absolutePath);
    if (!current || current.refs > 0) return;
    dropEntry(absolutePath, current);
  }, REVOKE_DELAY_MS);
}

/** Drop cached blob URLs that are not currently retained (pack unload). */
export function revokePreviewObjectUrls(paths?: string[]): void {
  const keys = paths ?? [...objectUrlCache.keys()];
  for (const p of keys) {
    const entry = objectUrlCache.get(p);
    if (!entry || entry.refs > 0) continue;
    dropEntry(p, entry);
  }
}

function firstExisting(
  baseWithoutExt: string,
  exts: readonly string[],
): string | null {
  if (!cepFsAvailable()) return null;
  for (const ext of exts) {
    const candidate = baseWithoutExt + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Whether pack prefers webm/mp4 motion previews (modern Spunkram packs).
 * `inside_option_sets.use_webm_preview` may be `true` or `"mp4"`.
 */
export function packPrefersWebmPreview(settings?: PackSettings | null): boolean {
  const flag = settings?.inside_option_sets?.use_webm_preview;
  return flag === true || flag === "mp4" || flag === "webm";
}

function preferredMotionExts(
  preferWebm: boolean,
  useMp4: boolean,
): readonly string[] {
  if (preferWebm) {
    return useMp4 ? [".mp4", ".webm", ".gif"] : [".webm", ".mp4", ".gif"];
  }
  return [".gif", ".webm", ".mp4"];
}

function motionKindFromExt(filePath: string): PreviewMotionKind {
  const ext =
    typeof path?.extname === "function"
      ? path.extname(filePath).toLowerCase()
      : filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (ext === ".mp4") return "mp4";
  if (ext === ".gif") return "gif";
  return "webm";
}

/**
 * Resolve poster + hover motion media for a pack item.
 * Paths only (existsSync); poster blob is created lazily via `loadPreviewObjectUrl`.
 */
export function resolveItemPreviewMedia(
  item: PackTreeItem,
  assetsPath: string,
  options?: {
    preferWebm?: boolean;
    useMp4?: boolean;
  },
): ItemPreviewMedia {
  if (!assetsPath || typeof path?.join !== "function") {
    return { posterPath: null, motion: null };
  }

  const disableWebm = !!item.group.disable_webm_preview;
  const isStaticFootage =
    item.group.is_footage === "JPG" || item.group.is_footage === "PNG";

  const segments = resolveItemAssetSegments(item);
  const baseWithoutExt = path.join(assetsPath, ...segments);

  const posterPath = firstExisting(baseWithoutExt, POSTER_EXTS);

  if (isStaticFootage || packItemIsAudio(item)) {
    return { posterPath, motion: null };
  }

  const preferWebm = !disableWebm && options?.preferWebm !== false;
  const motionExts = disableWebm
    ? ([".gif"] as const)
    : preferredMotionExts(preferWebm, !!options?.useMp4);

  const motionPath = firstExisting(baseWithoutExt, motionExts);
  const motion = motionPath
    ? { kind: motionKindFromExt(motionPath), path: motionPath }
    : null;

  return { posterPath, motion };
}

let sfxAudio: HTMLAudioElement | null = null;
let sfxOwnerId: string | null = null;

/** Play one SFX preview at a time (hover). Replaces any currently playing card. */
export function playSfxPreview(ownerId: string, objectUrl: string): void {
  if (!ownerId || !objectUrl || typeof Audio === "undefined") return;
  if (!sfxAudio) {
    sfxAudio = new Audio();
    sfxAudio.loop = true;
    sfxAudio.preload = "auto";
  }
  sfxOwnerId = ownerId;
  if (sfxAudio.src !== objectUrl) sfxAudio.src = objectUrl;
  try {
    sfxAudio.currentTime = 0;
  } catch {
    // ignore seek errors before metadata
  }
  void sfxAudio.play().catch(() => {});
}

/** Stop hover SFX. Pass `ownerId` to only stop if that card still owns playback. */
export function stopSfxPreview(ownerId?: string): void {
  if (ownerId && sfxOwnerId !== ownerId) return;
  if (!sfxAudio) return;
  sfxAudio.pause();
  sfxAudio.removeAttribute("src");
  try {
    sfxAudio.load();
  } catch {
    // ignore
  }
  try {
    sfxAudio.currentTime = 0;
  } catch {
    // ignore
  }
  sfxOwnerId = null;
}

export function resolveItemsPreviewMedia(
  items: PackTreeItem[],
  assetsPath: string,
  settings?: PackSettings | null,
): Map<string, ItemPreviewMedia> {
  const preferWebm = packPrefersWebmPreview(settings);
  const useMp4 = settings?.inside_option_sets?.use_webm_preview === "mp4";
  const map = new Map<string, ItemPreviewMedia>();
  for (const item of items) {
    map.set(
      item.id,
      resolveItemPreviewMedia(item, assetsPath, { preferWebm, useMp4 }),
    );
  }
  return map;
}
