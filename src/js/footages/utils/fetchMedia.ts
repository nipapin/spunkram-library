import { FetchMediaParams, FetchMediaResult, MediaItem, PER_PAGE, VideoFile } from "../types";

const BASE_URL = "https://api.get-atomx.com/atomx/v1/external_lib_assets";

interface UnsplashRawUser {
    name?: string;
    username?: string;
    bio?: string;
    location?: string;
    portfolio_url?: string;
    instagram_username?: string;
    profile_image?: { small?: string; medium?: string; large?: string };
    links?: { html?: string };
    social?: { instagram_username?: string; portfolio_url?: string };
}

interface UnsplashRawPhoto {
    id: string | number;
    slug: string;
    width: number;
    height: number;
    alt_description?: string;
    color?: string;
    blur_hash?: string;
    urls: { raw: string; full: string; regular: string; small: string; thumb: string };
    user?: UnsplashRawUser;
    links?: { download_location?: string };
}

interface PexelsRawVideoFile {
    id: number;
    width: number;
    height: number;
    fps: number;
    link: string;
    size: number;
}

interface PexelsRawVideo {
    id: string | number;
    url: string;
    width: number;
    height: number;
    duration?: number;
    image?: string;
    avg_color?: string;
    video_files?: PexelsRawVideoFile[];
    video_pictures?: Array<{ picture?: string }>;
    user?: { name?: string; url?: string };
}

function mapUnsplashPhoto(raw: UnsplashRawPhoto): MediaItem {
    const u = raw.user;
    const profile = u?.profile_image;
    const avatarUrl = profile?.medium ?? profile?.small ?? profile?.large;
    const portfolioUrl = u?.portfolio_url ?? u?.social?.portfolio_url;
    const instagramUsername = u?.instagram_username ?? u?.social?.instagram_username;

    return {
        id: String(raw.id),
        name: raw.slug + '.jpg',
        type: "image",
        width: raw.width,
        height: raw.height,
        thumbnail: raw.urls.small,
        preview: raw.urls.regular,
        alt: raw.alt_description ?? "",
        color: raw.color ?? null,
        blurHash: raw.blur_hash ?? null,
        user: {
            name: u?.name ?? "",
            url: u?.links?.html ?? "",
            username: u?.username,
            bio: u?.bio,
            location: u?.location,
            avatarUrl,
            portfolioUrl,
            instagramUsername,
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
            download_location: raw.links?.download_location ?? "",
        },
    };
}

function shuffleInPlace<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

function mapPexelsVideo(raw: PexelsRawVideo): MediaItem {
    const files: VideoFile[] = (raw.video_files ?? [])
        .map((f) => ({
            id: f.id,
            width: f.width,
            height: f.height,
            fps: f.fps,
            link: f.link,
            size: f.size,
        }))
        .sort((a, b) => a.width - b.width);

    const previewPicture = raw.video_pictures?.[0]?.picture ?? raw.image ?? "";

    return {
        id: String(raw.id),
        name: (raw.url.split("/").filter(Boolean).pop() ?? `video-${String(raw.id)}`) + '.mp4',
        type: "video",
        width: raw.width,
        height: raw.height,
        thumbnail: raw.image ?? previewPicture,
        preview: previewPicture,
        downloadUrl: files[files.length - 1]?.link,
        alt: "",
        color: raw.avg_color ?? null,
        blurHash: null,
        user: {
            name: raw.user?.name ?? "",
            url: raw.user?.url ?? "",
        },
        duration: raw.duration,
        videoFiles: files,
        videoPreviewUrl: files[0]?.link,
    };
}

export const fetchMedia = async (params: FetchMediaParams): Promise<FetchMediaResult> => {
    const { type, query, orientation, page = 1, perPage = PER_PAGE } = params;

    const searchParams = new URLSearchParams({
        type: type.toUpperCase(),
        query,
        search: query,
        page: String(page),
        per_page: String(perPage),
        action: "search",
    });

    if (orientation) {
        searchParams.set("orientation", orientation);
    }

    const url = `${BASE_URL}?${searchParams.toString()}`;

    try {
        const response = await fetch(url, {
            mode: 'no-cors'
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`fetchMedia error: ${response.statusText} ${body}`);
        }

        const data = await response.json();
        const content = data.content;
        const rawItems = type === "image" ? content.results : content.videos;
        const total = content.total ?? content.total_results ?? 0;
        const totalPages = content.total_pages ?? Math.ceil(total / perPage);

        const mapped =
            type === "image"
                ? rawItems.map(mapUnsplashPhoto)
                : rawItems.map(mapPexelsVideo);

        return {
            results: shuffleInPlace(mapped),
            total,
            totalPages,
            error: false,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("fetchMedia error", message);
        return { results: [], total: 0, totalPages: 0, error: true };
    }
};
