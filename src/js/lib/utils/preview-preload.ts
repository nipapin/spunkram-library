/**
 * Eager poster preload for a root category before the grid mounts.
 * Warms disk cache (HTTPS) + blob object URLs so cards can sync-retain on paint.
 */
import {
  loadPreviewObjectUrl,
  releasePreviewObjectUrl,
} from "@/lib/utils/pack-preview";
import { ensurePreviewCached } from "@/lib/utils/preview-disk-cache";

/** Max posters held warm before showing the grid (rest load lazily). */
export const PRELOAD_CAP = 500;

const HTTPS_URL_RE = /^https?:\/\//i;

export type PreloadSignal = { cancelled: boolean };

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
          if (url) retainedLocalPaths.push(local);
        }
        // Cache miss / CEP FS unavailable — card will paint remote HTTPS directly.
      } else {
        const url = await loadPreviewObjectUrl(path);
        if (signal.cancelled) {
          if (url) releasePreviewObjectUrl(path);
          break;
        }
        if (url) retainedLocalPaths.push(path);
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
