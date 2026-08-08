/**
 * Motionflow stock media (Unsplash / Pexels) for CEP footages.
 * Search + download require CEP Bearer (budget protection).
 */
import { apiUrl } from "@/api/config";
import { cepHttpRequest } from "@/lib/api/cep-http";
import {
  getSessionToken,
  handleUnauthorized,
  sessionAuthHeaders,
} from "@/lib/api/session";
import { downloadToFile } from "@/utils/download-file";
import { fs, os, path } from "@/lib/cep/node";

export const STOCK_UNSPLASH_ENDPOINT = "/api/stock/unsplash";
export const STOCK_PEXELS_VIDEOS_ENDPOINT = "/api/stock/pexels/videos";
export const STOCK_DOWNLOAD_ENDPOINT = "/api/stock/download";

export type StockProvider = "unsplash" | "pexels";

export type FootagePhoto = {
  id: string;
  width: number;
  height: number;
  color: string | null;
  blurHash: string | null;
  description: string | null;
  altDescription: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  htmlLink: string;
  downloadLocation: string | null;
  author: {
    name: string;
    username: string;
    profileUrl: string;
    avatar: string | null;
  };
  tags?: string[];
  likes?: number;
};

export type FootageVideo = {
  id: string;
  width: number;
  height: number;
  duration: number;
  image: string;
  videoUrl: string;
  htmlLink: string;
  description: string | null;
  tags?: string[];
  author: {
    name: string;
    url: string;
  };
};

export type FootagePhotoSearchResult = {
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
  results: FootagePhoto[];
};

export type FootageVideoSearchResult = {
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
  results: FootageVideo[];
};

async function stockGet(
  pathWithQuery: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const token = getSessionToken();
  if (!token) return { ok: false, error: "UNAUTHORIZED" };
  const result = await cepHttpRequest(apiUrl(pathWithQuery), {
    method: "GET",
    headers: sessionAuthHeaders(),
  });
  if (result.status === 401) {
    handleUnauthorized();
    return { ok: false, error: "UNAUTHORIZED" };
  }
  if (!result.ok) return { ok: false, error: result.error || "NO_SUCCESS_LOAD" };
  return { ok: true, text: result.text };
}

export async function searchUnsplash(params: {
  query: string;
  orientation?: string;
  page?: number;
  perPage?: number;
}): Promise<{ data?: FootagePhotoSearchResult; error?: string }> {
  const search = new URLSearchParams();
  if (params.query) search.set("query", params.query);
  if (params.orientation) {
    const o =
      params.orientation === "square" ? "squarish" : params.orientation;
    search.set("orientation", o);
  }
  search.set("page", String(params.page ?? 1));
  search.set("perPage", String(params.perPage ?? 30));

  const res = await stockGet(`${STOCK_UNSPLASH_ENDPOINT}?${search.toString()}`);
  if (!res.ok) return { error: res.error };
  try {
    return { data: JSON.parse(res.text) as FootagePhotoSearchResult };
  } catch {
    return { error: "NO_SUCCESS_LOAD" };
  }
}

export async function searchPexelsVideos(params: {
  query: string;
  orientation?: string;
  page?: number;
  perPage?: number;
}): Promise<{ data?: FootageVideoSearchResult; error?: string }> {
  const search = new URLSearchParams();
  if (params.query) search.set("query", params.query);
  if (params.orientation) {
    const o =
      params.orientation === "squarish" ? "square" : params.orientation;
    search.set("orientation", o);
  }
  search.set("page", String(params.page ?? 1));
  search.set("perPage", String(params.perPage ?? 30));

  const res = await stockGet(
    `${STOCK_PEXELS_VIDEOS_ENDPOINT}?${search.toString()}`,
  );
  if (!res.ok) return { error: res.error };
  try {
    return { data: JSON.parse(res.text) as FootageVideoSearchResult };
  } catch {
    return { error: "NO_SUCCESS_LOAD" };
  }
}

export function stockDownloadUrl(opts: {
  provider: StockProvider;
  kind: "image" | "video";
  id: string;
}): string {
  const search = new URLSearchParams({
    provider: opts.provider,
    kind: opts.kind,
    id: opts.id,
  });
  return apiUrl(`${STOCK_DOWNLOAD_ENDPOINT}?${search.toString()}`);
}

export async function downloadStockAsset(opts: {
  provider: StockProvider;
  kind: "image" | "video";
  id: string;
  fileName: string;
  destDir?: string;
  onProgress?: (p: {
    bytesReceived: number;
    totalBytes: number | null;
  }) => void;
}): Promise<{ ok: true; filePath: string } | { ok: false; message: string }> {
  const token = getSessionToken();
  if (!token) {
    return { ok: false, message: "Sign in to download stock media." };
  }

  const destDir = opts.destDir || os.tmpdir();
  const filePath = path.join(destDir, opts.fileName);
  const url = stockDownloadUrl({
    provider: opts.provider,
    kind: opts.kind,
    id: opts.id,
  });

  try {
    await downloadToFile(url, filePath, {
      timeoutMs: 10 * 60 * 1000,
      headers: sessionAuthHeaders(),
      stripAuthOnRedirect: true,
      onProgress: opts.onProgress,
      onErrorBody: (status, body) => {
        if (status === 401) handleUnauthorized();
        try {
          const parsed = JSON.parse(body) as { error?: string };
          throw Object.assign(
            new Error(parsed.error || `Download failed (${status})`),
            { status },
          );
        } catch (e) {
          if (e instanceof Error && (e as { status?: number }).status) throw e;
          throw new Error(`Download failed (${status})`);
        }
      },
    });
    if (!fs.existsSync(filePath)) {
      return { ok: false, message: "Download completed but file is missing." };
    }
    return { ok: true, filePath };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
