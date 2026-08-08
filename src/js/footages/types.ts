export const PER_PAGE = 30;

export type MediaType = "image" | "video";

export type FilterOption = {
    label: string;
    value: string;
};

export type ImageUrls = {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
};

export type VideoFile = {
    id: number;
    width: number;
    height: number;
    fps: number;
    link: string;
    size: number;
};

export type MediaAuthor = {
    name: string;
    url: string;
    username?: string;
    bio?: string;
    location?: string;
    avatarUrl?: string;
    portfolioUrl?: string;
    instagramUsername?: string;
};

export type MediaItem = {
    id: string;
    name: string;
    type: MediaType;
    width: number;
    height: number;
    thumbnail: string;
    preview: string;
    alt: string;
    color: string | null;
    blurHash: string | null;
    user: MediaAuthor;
    /** Motionflow stock provider — used for authenticated download. */
    provider?: "unsplash" | "pexels";

    imageUrls?: ImageUrls;
    downloadUrl?: string;

    duration?: number;
    videoFiles?: VideoFile[];
    videoPreviewUrl?: string;
    links?: {
        download_location?: string;
    };
};

export type FetchMediaParams = {
    type: MediaType;
    query: string;
    orientation?: string;
    page?: number;
    perPage?: number;
};

export type FetchMediaResult = {
    results: MediaItem[];
    total: number;
    totalPages: number;
    error: boolean;
};