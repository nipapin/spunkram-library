/**
 * Eager poster preload for a root category before the grid mounts.
 * Warms disk cache (HTTPS) + blob object URLs so cards can sync-retain on paint.
 */
import { packItemIsAudio } from "@/lib/utils/pack-apply-paths";
import {
  loadPreviewObjectUrl,
  packPrefersWebmPreview,
  peekPreviewObjectUrlSync,
  releasePreviewObjectUrl,
  resolveItemPreviewMedia,
  resolveItemRemotePreviewMedia,
} from "@/lib/utils/pack-preview";
import type { PackHostId } from "@/lib/utils/pack-host";
import type { PackContentSection } from "@/lib/utils/pack-tree";
import type { PackSettings } from "@/lib/utils/pack-types";
import {
  ensurePreviewCached,
  peekCachedPreviewPath,
} from "@/lib/utils/preview-disk-cache";

/** Boot must not wait for media. Cards load through the viewport poster queue. */
export const PRELOAD_CAP = 0;

const HTTPS_URL_RE = /^https?:\/\//i;
const SOUND_FX_LABEL_RE = /sound\s*fx/i;

export type PreloadSignal = { cancelled: boolean };

export type CollectPosterPathsOpts = {
  assetsPath: string;
  assetsBaseUrl?: string;
  assetsHost?: PackHostId | null;
  settings?: PackSettings | null;
};

/** Skip Sound FX / audio cards — they use a local icon, not a poster. */
export function collectPosterPathsForPreload(
  sections: PackContentSection[],
  opts: CollectPosterPathsOpts,
): string[] {
  const preferWebm = packPrefersWebmPreview(opts.settings);
  const useMp4 = opts.settings?.inside_option_sets?.use_webm_preview === "mp4";
  const host = opts.assetsHost === "AE" ? "AE" : "PR";
  const paths: string[] = [];

  for (const section of sections) {
    const skipSection = SOUND_FX_LABEL_RE.test(section.title);
    for (const item of section.items) {
      if (paths.length >= PRELOAD_CAP) return paths;
      if (
        skipSection ||
        packItemIsAudio(item) ||
        item.pathSegments.some((seg) => SOUND_FX_LABEL_RE.test(seg))
      ) {
        continue;
      }

      let posterPath: string | null = null;
      if (opts.assetsBaseUrl) {
        posterPath = resolveItemRemotePreviewMedia(item, opts.assetsBaseUrl, {
          preferWebm,
          useMp4,
          host,
        }).posterPath;
      } else if (opts.assetsPath) {
        posterPath = resolveItemPreviewMedia(item, opts.assetsPath, {
          preferWebm,
          useMp4,
        }).posterPath;
      }
      if (posterPath) paths.push(posterPath);
    }
  }
  return paths;
}

export function posterWarmupIdentity(
  rootId: string,
  assetsPath: string,
  assetsBaseUrl: string,
): string {
  return `${rootId}|${assetsPath}|${assetsBaseUrl}`;
}

let heldWarmup: { identity: string; cleanup: () => void } | null = null;

/** Keep boot-warmed blob retains for the session so the grid can paint from cache. */
export function holdPosterWarmup(identity: string, cleanup: () => void): void {
  if (heldWarmup && heldWarmup.identity !== identity) {
    heldWarmup.cleanup();
  }
  heldWarmup = { identity, cleanup };
}

export function takePosterWarmup(identity: string): (() => void) | null {
  if (!heldWarmup || heldWarmup.identity !== identity) return null;
  const cleanup = heldWarmup.cleanup;
  heldWarmup = null;
  return cleanup;
}

/** Boot warmup still holds blobs — grid must not take/release them. */
export function peekPosterWarmup(identity: string): boolean {
  return Boolean(heldWarmup && heldWarmup.identity === identity);
}

export function releasePosterWarmup(): void {
  if (!heldWarmup) return;
  heldWarmup.cleanup();
  heldWarmup = null;
}

/**
 * Blob URL already created by boot warmup / a previous retain.
 * HTTPS paths resolve through the disk cache first. Safe during render (no retain).
 */
export function peekWarmPosterUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (HTTPS_URL_RE.test(path)) {
    const local = peekCachedPreviewPath(path);
    return local ? peekPreviewObjectUrlSync(local) : null;
  }
  return peekPreviewObjectUrlSync(path);
}

function decodePreviewUrl(url: string): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Warm posters until they are sync-retainable blob URLs.
 * Returns a cleanup that releases retains for every successfully loaded local path.
 * HTTPS URLs that cannot be disk-cached still count as done (cards use remote URL).
 */
export async function preloadPosters(
  paths: string[],
  onProgress: (done: number, total: number) => void,
  signal: PreloadSignal,
): Promise<() => void> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    unique.push(p);
  }

  const total = unique.length;
  const retainedLocalPaths: string[] = [];
  let done = 0;

  const report = () => {
    if (!signal.cancelled) onProgress(done, total);
  };
  report();

  if (total === 0) {
    return () => {};
  }

  for (const path of unique) {
    if (signal.cancelled) break;

    try {
      if (HTTPS_URL_RE.test(path)) {
        const local = await ensurePreviewCached(path);
        if (signal.cancelled) break;
        if (local) {
          const url = await loadPreviewObjectUrl(local);
          if (signal.cancelled) {
            if (url) releasePreviewObjectUrl(local);
            break;
          }
          if (url) {
            retainedLocalPaths.push(local);
            await decodePreviewUrl(url);
          }
        }
        // Cache miss / CEP FS unavailable — card will paint remote HTTPS directly.
      } else {
        const url = await loadPreviewObjectUrl(path);
        if (signal.cancelled) {
          if (url) releasePreviewObjectUrl(path);
          break;
        }
        if (url) {
          retainedLocalPaths.push(path);
          await decodePreviewUrl(url);
        }
      }
    } catch {
      // Count as done so one bad file does not block the gate forever.
    }

    done += 1;
    report();
  }

  return () => {
    for (const local of retainedLocalPaths) {
      releasePreviewObjectUrl(local);
    }
    retainedLocalPaths.length = 0;
  };
}
