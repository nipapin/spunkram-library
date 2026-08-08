/** Video tutorials — Motionflow-only (AtomX vtuts removed). */
import type { ApiErrorCode } from "./market-api";

/** One tutorials group from the server. */
export type VideoTutorialGroup = {
  name: string;
  /** [title, colorClass] badge, e.g. ["New Tutorial", "yellow"]. */
  mark?: [string, string] | null;
  /** Package name this group is bound to (shown on top when the pack is active). */
  bind?: string | null;
  /** YouTube video ids. */
  videos: string[];
};

let sessionCache: VideoTutorialGroup[] | null = null;

/**
 * Tutorials catalog. AtomX `vtuts` was removed; until Motionflow ships an
 * equivalent endpoint this returns an empty list (no network call).
 */
export async function fetchVideoTutorials(
  _serverIndex = 0,
): Promise<{ groups?: VideoTutorialGroup[]; error?: ApiErrorCode }> {
  if (sessionCache) return { groups: sessionCache };
  sessionCache = [];
  return { groups: sessionCache };
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
}
