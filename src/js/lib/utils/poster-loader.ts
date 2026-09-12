import { loadPreviewObjectUrl, releasePreviewObjectUrl } from "./pack-preview";
import { ensurePreviewCached } from "./preview-disk-cache";
import { PosterQueue } from "./poster-queue";

/** Hold the queue slot until the image is decoded, with a timeout for broken media. */
function decodePoster(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (!ok) img.src = "";
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 15000);
    img.onerror = () => finish(false);
    img.onload = () => {
      if (typeof img.decode === "function") {
        void img.decode().then(() => finish(true), () => finish(false));
      } else finish(true);
    };
    img.src = url;
  });
}

export const posterQueue = new PosterQueue(async (source) => {
  const remote = /^https?:\/\//i.test(source);
  const local = remote ? await ensurePreviewCached(source) : source;
  const url = local ? await loadPreviewObjectUrl(local) : remote ? source : null;
  if (!url) return null;
  const release = () => { if (local) releasePreviewObjectUrl(local); };
  if (!(await decodePoster(url))) {
    release();
    return null;
  }
  return { url, release };
});
