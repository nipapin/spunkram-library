/**
 * Persist remote preview media (Gal HTTPS proxy) under AppData so category
 * switches / scroll do not re-hit the network for the same poster/motion.
 *
 * Layout: `{appData}/preview-cache/Assets/…/file.png`
 */
import { fs, path } from "@/lib/cep/node";
import { getStylesRoot } from "@/styles/paths";
import { getSessionToken } from "@/lib/api/session";
import { downloadToFile } from "@/utils/download-file";
const MEDIA_MARKER = "/effects/media/";
const HTTPS_URL_RE = /^https?:\/\//i;
/** Cap parallel disk downloads so CEP stays responsive. */
const MAX_CONCURRENT = 4;
/** dest path → absolute local path (hit) or null (confirmed miss). Avoids double existsSync/statSync. */
const peekCache = new Map();
function cepFsAvailable() {
    return (typeof fs?.existsSync === "function" &&
        typeof fs?.mkdirSync === "function" &&
        typeof path?.join === "function");
}
function previewCacheRoot() {
    if (!cepFsAvailable())
        return null;
    const root = getStylesRoot();
    return root ? path.join(root, "preview-cache") : null;
}
/**
 * Map a media-proxy URL to a stable local path.
 * `…/effects/media/Assets/Foo/bar.png?host=PR` → `{cache}/Assets/Foo/bar.png`
 */
export function previewCachePathForUrl(remoteUrl) {
    const root = previewCacheRoot();
    if (!root || !remoteUrl)
        return null;
    let pathname = remoteUrl;
    try {
        pathname = new URL(remoteUrl).pathname;
    }
    catch {
        /* keep raw */
    }
    const lower = pathname.toLowerCase();
    const idx = lower.indexOf(MEDIA_MARKER);
    const relRaw = idx >= 0 ? pathname.slice(idx + MEDIA_MARKER.length) : pathname.replace(/^\//, "");
    const parts = relRaw
        .split("/")
        .map((p) => {
        try {
            return decodeURIComponent(p);
        }
        catch {
            return p;
        }
    })
        .filter((p) => p && p !== "." && p !== "..");
    if (parts.length === 0)
        return null;
    return path.join(root, ...parts);
}
function probeDisk(dest) {
    if (!fs.existsSync(dest))
        return null;
    try {
        const st = fs.statSync(dest);
        if (!st.isFile() || st.size <= 0)
            return null;
        return dest;
    }
    catch {
        return null;
    }
}
/** Sync hit — file already on disk. Memoizes hit/miss per dest path. */
export function peekCachedPreviewPath(remoteUrl) {
    const dest = previewCachePathForUrl(remoteUrl);
    if (!dest)
        return null;
    if (peekCache.has(dest)) {
        return peekCache.get(dest) ?? null;
    }
    const hit = probeDisk(dest);
    peekCache.set(dest, hit);
    return hit;
}
function rememberPeek(dest, localPath) {
    peekCache.set(dest, localPath);
}
let activeDownloads = 0;
const downloadQueue = [];
const inflight = new Map();
function pumpDownloadQueue() {
    while (activeDownloads < MAX_CONCURRENT && downloadQueue.length > 0) {
        const job = downloadQueue.shift();
        if (!job)
            break;
        activeDownloads += 1;
        void (async () => {
            try {
                job.resolve(await downloadPreviewToDisk(job.remoteUrl));
            }
            catch {
                job.resolve(null);
            }
            finally {
                activeDownloads -= 1;
                pumpDownloadQueue();
            }
        })();
    }
}
async function downloadPreviewToDisk(remoteUrl) {
    const dest = previewCachePathForUrl(remoteUrl);
    if (!dest)
        return null;
    const existing = peekCachedPreviewPath(remoteUrl);
    if (existing)
        return existing;
    const destDir = path.dirname(dest);
    try {
        if (!fs.existsSync(destDir))
            fs.mkdirSync(destDir, { recursive: true });
    }
    catch {
        rememberPeek(dest, null);
        return null;
    }
    const token = getSessionToken();
    const headers = {};
    if (token)
        headers.Authorization = `Bearer ${token}`;
    try {
        await downloadToFile(remoteUrl, dest, {
            headers,
            stripAuthOnRedirect: true,
            timeoutMs: 60_000,
        });
        // Re-probe after write (bypass stale miss).
        peekCache.delete(dest);
        const hit = peekCachedPreviewPath(remoteUrl);
        return hit;
    }
    catch {
        try {
            if (fs.existsSync(dest))
                fs.unlinkSync(dest);
        }
        catch {
            /* ignore */
        }
        rememberPeek(dest, null);
        return null;
    }
}
/**
 * Ensure a remote preview URL is on disk. Returns the local absolute path,
 * or `null` if caching is unavailable / download failed (caller may use HTTPS).
 */
export function ensurePreviewCached(remoteUrl) {
    if (!remoteUrl || !HTTPS_URL_RE.test(remoteUrl)) {
        return Promise.resolve(null);
    }
    const hit = peekCachedPreviewPath(remoteUrl);
    if (hit)
        return Promise.resolve(hit);
    const existing = inflight.get(remoteUrl);
    if (existing)
        return existing;
    const promise = new Promise((resolve) => {
        downloadQueue.push({ remoteUrl, resolve });
        pumpDownloadQueue();
    }).finally(() => {
        inflight.delete(remoteUrl);
    });
    inflight.set(remoteUrl, promise);
    return promise;
}
/** Fire-and-forget disk warm — never blocks first paint. */
export function warmPreviewCache(remoteUrl) {
    if (!remoteUrl || !HTTPS_URL_RE.test(remoteUrl))
        return;
    if (peekCachedPreviewPath(remoteUrl))
        return;
    void ensurePreviewCached(remoteUrl);
}
