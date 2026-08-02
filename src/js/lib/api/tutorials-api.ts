import { MASKED } from "@/lib/config/masked";
import { cepHttpRequest } from "./cep-http";
import { getApiBase, type ApiErrorCode } from "./market-api";

/** One tutorials group from the server (port of vtuts payload from Spunkram Beta). */
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

/** Merge groups that share the same name (same behavior as generateVideoTutorials). */
function mergeSameNameGroups(groups: VideoTutorialGroup[]): VideoTutorialGroup[] {
  const byName = new Map<string, VideoTutorialGroup>();
  for (const group of groups) {
    const existing = byName.get(group.name);
    if (existing) {
      existing.videos = existing.videos.concat(group.videos ?? []);
      if (!existing.mark && group.mark) existing.mark = group.mark;
      if (!existing.bind && group.bind) existing.bind = group.bind;
    } else {
      byName.set(group.name, {
        name: group.name,
        mark: group.mark ?? null,
        bind: group.bind ?? null,
        videos: [...(group.videos ?? [])],
      });
    }
  }
  return [...byName.values()].filter((g) => g.videos.length > 0);
}

export async function fetchVideoTutorials(
  serverIndex = 0,
): Promise<{ groups?: VideoTutorialGroup[]; error?: ApiErrorCode }> {
  if (sessionCache) return { groups: sessionCache };

  const base = getApiBase(serverIndex);
  const params = new URLSearchParams({ king: MASKED.author });
  const { ok, text, error } = await cepHttpRequest(`${base}vtuts?${params.toString()}`);
  if (!ok) return { error: error ?? "NO_SUCCESS_LOAD" };

  try {
    const raw = JSON.parse(text) as VideoTutorialGroup[] | Record<string, VideoTutorialGroup>;
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    sessionCache = mergeSameNameGroups(list);
    return { groups: sessionCache };
  } catch {
    return { error: "NO_SUCCESS_LOAD" };
  }
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
}
