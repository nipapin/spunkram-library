import {
  FetchMediaParams,
  FetchMediaResult,
  MediaItem,
  PER_PAGE,
  VideoFile,
} from "../types";
import {
  searchPexelsVideos,
  searchUnsplash,
  type FootagePhoto,
  type FootageVideo,
} from "@/lib/api/stock-api";

function mapUnsplashPhoto(raw: FootagePhoto): MediaItem {
  return {
    id: String(raw.id),
    name: `${raw.id}.jpg`,
    type: "image",
    width: raw.width,
    height: raw.height,
    thumbnail: raw.urls.small,
    preview: raw.urls.regular,
    alt: raw.altDescription ?? raw.description ?? "",
    color: raw.color ?? null,
    blurHash: raw.blurHash ?? null,
    provider: "unsplash",
    user: {
      name: raw.author?.name ?? "",
      url: raw.author?.profileUrl ?? "",
      username: raw.author?.username,
      avatarUrl: raw.author?.avatar ?? undefined,
    },
    imageUrls: {
      raw: raw.urls.raw,
      full: raw.urls.full,
      regular: raw.urls.regular,
      small: raw.urls.small,
      thumb: raw.urls.thumb,
    },
    downloadUrl: raw.urls.full,
    links: {
      download_location: raw.downloadLocation ?? "",
    },
  };
}

function mapPexelsVideo(raw: FootageVideo): MediaItem {
  const files: VideoFile[] = raw.videoUrl
    ? [
        {
          id: 0,
          width: raw.width,
          height: raw.height,
          fps: 0,
          link: raw.videoUrl,
          size: 0,
        },
      ]
    : [];

  return {
    id: String(raw.id),
    name: `video-${raw.id}.mp4`,
    type: "video",
    width: raw.width,
    height: raw.height,
    thumbnail: raw.image,
    preview: raw.image,
    downloadUrl: raw.videoUrl,
    alt: raw.description ?? "",
    color: null,
    blurHash: null,
    provider: "pexels",
    user: {
      name: raw.author?.name ?? "",
      url: raw.author?.url ?? "",
    },
    duration: raw.duration,
    videoFiles: files,
    videoPreviewUrl: raw.videoUrl,
  };
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export const fetchMedia = async (
  params: FetchMediaParams,
): Promise<FetchMediaResult> => {
  const { type, query, orientation, page = 1, perPage = PER_PAGE } = params;

  try {
    if (type === "image") {
      const res = await searchUnsplash({ query, orientation, page, perPage });
      if (!res.data) {
        return { results: [], total: 0, totalPages: 0, error: true };
      }
      return {
        results: shuffleInPlace(res.data.results.map(mapUnsplashPhoto)),
        total: res.data.total,
        totalPages: res.data.totalPages,
        error: false,
      };
    }

    const res = await searchPexelsVideos({ query, orientation, page, perPage });
    if (!res.data) {
      return { results: [], total: 0, totalPages: 0, error: true };
    }
    return {
      results: shuffleInPlace(res.data.results.map(mapPexelsVideo)),
      total: res.data.total,
      totalPages: res.data.totalPages,
      error: false,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("fetchMedia error", message);
    return { results: [], total: 0, totalPages: 0, error: true };
  }
};
