import { fs, path } from "../cep/node";
import { resolveItemAssetSegments } from "./pack-tree";
import type { PackSettings, PackTreeItem } from "./pack-types";

export type PreviewMotionKind = "webm" | "mp4" | "gif";

export type ItemPreviewMedia = {
  /** Static poster src (blob: URL) if already cached; otherwise null until lazy load. */
  posterUrl: string | null;
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

const objectUrlCache = new Map<string, string>();

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
    default:
      return "application/octet-stream";
  }
}

/**
 * Read a local file via CEP Node and expose it as a blob: URL.
 * Native `C:\...` paths are parsed as scheme `c:` → ERR_UNKNOWN_URL_SCHEME.
 * `file://` is often blocked from http://localhost Vite panels.
 */
export function pathToObjectUrl(absolutePath: string): string | null {
  if (!absolutePath || !cepFsAvailable()) return null;

  const cached = objectUrlCache.get(absolutePath);
  if (cached) return cached;

  try {
    const data = fs.readFileSync(absolutePath) as Buffer;
    // Copy into a standalone Uint8Array — CEP Blob rejects pooled Buffer views.
    const bytes = new Uint8Array(data);
    const blob = new Blob([bytes], { type: mimeFromExt(absolutePath) });
    const url = URL.createObjectURL(blob);
    objectUrlCache.set(absolutePath, url);
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
 * Prefer this over sync `pathToObjectUrl` from React render/effects for posters.
 */
export function loadPreviewObjectUrl(absolutePath: string): Promise<string | null> {
  if (!absolutePath) return Promise.resolve(null);
  const cached = objectUrlCache.get(absolutePath);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    readQueue.push({ path: absolutePath, resolve });
    pumpReadQueue();
  });
}

/** Drop cached blob URLs (call when leaving a category / unloading pack). */
export function revokePreviewObjectUrls(paths?: string[]): void {
  if (!paths) {
    for (const url of objectUrlCache.values()) URL.revokeObjectURL(url);
    objectUrlCache.clear();
    return;
  }
  for (const p of paths) {
    const url = objectUrlCache.get(p);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrlCache.delete(p);
    }
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
 * Whether pack prefers webm/mp4 motion previews (Atom 3+ / modern Spunkram).
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
    return { posterUrl: null, posterPath: null, motion: null };
  }

  const disableWebm = !!item.group.disable_webm_preview;
  const isStaticFootage =
    item.group.is_footage === "JPG" || item.group.is_footage === "PNG";

  const segments = resolveItemAssetSegments(item);
  const baseWithoutExt = path.join(assetsPath, ...segments);

  const posterPath = firstExisting(baseWithoutExt, POSTER_EXTS);
  const posterUrl = posterPath
    ? (objectUrlCache.get(posterPath) ?? null)
    : null;

  if (isStaticFootage || item.group.is_audio) {
    return { posterUrl, posterPath, motion: null };
  }

  const preferWebm = !disableWebm && options?.preferWebm !== false;
  const motionExts = disableWebm
    ? ([".gif"] as const)
    : preferredMotionExts(preferWebm, !!options?.useMp4);

  const motionPath = firstExisting(baseWithoutExt, motionExts);
  const motion = motionPath
    ? { kind: motionKindFromExt(motionPath), path: motionPath }
    : null;

  return { posterUrl, posterPath, motion };
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
