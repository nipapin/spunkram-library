let sessionCache = null;
/**
 * Tutorials catalog. Returns an empty list until Motionflow ships an endpoint.
 */
export async function fetchVideoTutorials(_serverIndex = 0) {
    if (sessionCache)
        return { groups: sessionCache };
    sessionCache = [];
    return { groups: sessionCache };
}
export function youtubeThumbnailUrl(videoId) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
export function youtubeEmbedUrl(videoId) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
}
