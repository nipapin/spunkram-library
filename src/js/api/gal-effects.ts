/**
 * Gal Toolkit Effects catalog + file download — private R2 via next-app.
 *
 * `GET /api/cep/gal/effects?host=PR|AE`
 * `GET /api/cep/gal/effects/assets-manifest?host=`
 * `GET /api/cep/gal/effects/file?host=&path=`
 * media proxy under `/api/cep/gal/effects/media/…`
 * @see next-app/CEP_API.md §3d
 */
import { API_BASE, apiUrl } from "./config";
import { cepHttpRequest } from "@/lib/api/cep-http";
import {
  getSessionToken,
  handleUnauthorized,
  sessionAuthHeaders,
} from "@/lib/api/session";
import type { PackSettings, PackStructureMap } from "@/lib/utils/pack-types";

export const CEP_GAL_EFFECTS_ENDPOINT = "/api/cep/gal/effects";
export const CEP_GAL_EFFECTS_MANIFEST_ENDPOINT =
  "/api/cep/gal/effects/assets-manifest";
export const CEP_GAL_EFFECTS_FILE_ENDPOINT = "/api/cep/gal/effects/file";

export type GalEffectsHost = "AE" | "PR";

export type GalEffectsPayload = {
  host: GalEffectsHost;
  pack_name: string;
  version: string;
  etag?: string;
  settings: PackSettings;
  content: PackStructureMap;
  /** Absolute base: https://motionflow.pro/api/cep/gal/effects/media */
  assets_base_url: string;
};

export type GalAssetsManifestPayload = {
  host: GalEffectsHost;
  etag: string;
  /** Array `[{path,hash}]` or `{ files: { rel: { hash } } }`. */
  manifest: unknown;
};

export type GalEffectsFileLink = {
  url: string;
  key: string;
  path: string;
  etag: string;
  size: number | null;
  expires_in: number;
};

type CacheEntry = { etag: string; data: GalEffectsPayload };
const cache = new Map<string, CacheEntry>();

type ManifestCacheEntry = { etag: string; data: GalAssetsManifestPayload };
const manifestCache = new Map<string, ManifestCacheEntry>();

function authHeaders(): Record<string, string> {
  return sessionAuthHeaders();
}

/**
 * Load Gal Toolkit pack tree + assets_base_url from R2 (gal-toolkit-max).
 */
export async function fetchGalEffects(
  host: GalEffectsHost = "PR",
): Promise<{
  data?: GalEffectsPayload;
  error?: string;
  notModified?: boolean;
}> {
  const token = getSessionToken();
  if (!token) return { error: "UNAUTHORIZED" };

  const key = host;
  const cached = cache.get(key);
  const headers = authHeaders();
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  const url = apiUrl(
    `${CEP_GAL_EFFECTS_ENDPOINT}?host=${encodeURIComponent(host)}`,
  );
  const result = await cepHttpRequest(url, { method: "GET", headers });

  if (result.status === 304 && cached) {
    return { data: cached.data, notModified: true };
  }

  if (!result.ok) {
    if (result.status === 401) {
      handleUnauthorized();
      return { error: "UNAUTHORIZED" };
    }
    try {
      const errBody = JSON.parse(result.text) as {
        error?: string;
        message?: string;
      };
      return { error: errBody.error || errBody.message || "NO_SUCCESS_LOAD" };
    } catch {
      return { error: result.error || "NO_SUCCESS_LOAD" };
    }
  }

  try {
    const raw = JSON.parse(result.text) as GalEffectsPayload & {
      contents?: PackStructureMap;
      structure?: PackStructureMap;
    };
    const content = raw.content ?? raw.contents ?? raw.structure;
    if (!raw.settings || !content || typeof content !== "object") {
      return { error: "BAD_PACK" };
    }
    const assetsBase =
      (raw.assets_base_url || "").trim() ||
      `${API_BASE}/api/cep/gal/effects/media`;
    const data: GalEffectsPayload = {
      host: raw.host === "AE" ? "AE" : "PR",
      pack_name: String(raw.pack_name || "Gal Toolkit MAX"),
      version: String(raw.version || ""),
      etag: raw.etag,
      settings: raw.settings,
      content,
      assets_base_url: assetsBase.replace(/\/+$/, ""),
    };
    if (data.etag) cache.set(key, { etag: data.etag, data });
    return { data };
  } catch {
    return { error: "NO_SUCCESS_LOAD" };
  }
}

/**
 * Load `{hostPrefix}/manifest.json` (file list + hashes) for _Assets sync.
 */
export async function fetchGalAssetsManifest(
  host: GalEffectsHost = "PR",
): Promise<{
  data?: GalAssetsManifestPayload;
  error?: string;
  notModified?: boolean;
}> {
  const token = getSessionToken();
  if (!token) return { error: "UNAUTHORIZED" };

  const key = host;
  const cached = manifestCache.get(key);
  const headers = authHeaders();
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  const url = apiUrl(
    `${CEP_GAL_EFFECTS_MANIFEST_ENDPOINT}?host=${encodeURIComponent(host)}`,
  );
  const result = await cepHttpRequest(url, { method: "GET", headers });

  if (result.status === 304 && cached) {
    return { data: cached.data, notModified: true };
  }

  if (!result.ok) {
    if (result.status === 401) {
      handleUnauthorized();
      return { error: "UNAUTHORIZED" };
    }
    try {
      const errBody = JSON.parse(result.text) as {
        error?: string;
        message?: string;
      };
      return { error: errBody.error || errBody.message || "NO_MANIFEST" };
    } catch {
      return { error: result.error || "NO_MANIFEST" };
    }
  }

  try {
    const raw = JSON.parse(result.text) as GalAssetsManifestPayload;
    if (raw.manifest == null) return { error: "BAD_MANIFEST" };
    const data: GalAssetsManifestPayload = {
      host: raw.host === "AE" ? "AE" : "PR",
      etag: String(raw.etag || ""),
      manifest: raw.manifest,
    };
    if (data.etag) manifestCache.set(key, { etag: data.etag, data });
    return { data };
  } catch {
    return { error: "NO_MANIFEST" };
  }
}

/**
 * Short-lived R2 presigned URL for a file under `{hostPrefix}/`.
 * `path` is relative to host prefix (e.g. `Projects/Transitions/Bokeh/Bokeh.prproj`).
 */
export async function fetchGalEffectsFileLink(
  host: GalEffectsHost,
  relPath: string,
): Promise<{ data?: GalEffectsFileLink; error?: string }> {
  const token = getSessionToken();
  if (!token) return { error: "UNAUTHORIZED" };

  const path = (relPath || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path) return { error: "MISSING_PARAMS" };

  const url = apiUrl(
    `${CEP_GAL_EFFECTS_FILE_ENDPOINT}?host=${encodeURIComponent(host)}&path=${encodeURIComponent(path)}`,
  );
  const result = await cepHttpRequest(url, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!result.ok) {
    if (result.status === 401) {
      handleUnauthorized();
      return { error: "UNAUTHORIZED" };
    }
    try {
      const errBody = JSON.parse(result.text) as {
        error?: string;
        message?: string;
      };
      return { error: errBody.error || errBody.message || "NOT_FOUND" };
    } catch {
      return { error: result.error || "NOT_FOUND" };
    }
  }

  try {
    const raw = JSON.parse(result.text) as GalEffectsFileLink;
    if (!raw.url || !raw.path) return { error: "BAD_RESPONSE" };
    return {
      data: {
        url: String(raw.url),
        key: String(raw.key || ""),
        path: String(raw.path).replace(/\\/g, "/"),
        etag: String(raw.etag || ""),
        size: typeof raw.size === "number" ? raw.size : null,
        expires_in:
          typeof raw.expires_in === "number" ? raw.expires_in : 600,
      },
    };
  } catch {
    return { error: "BAD_RESPONSE" };
  }
}

/** Build absolute media URL under Assets proxy. */
export function galEffectsAssetUrl(
  assetsBaseUrl: string,
  segments: string[],
  ext: string,
  host: GalEffectsHost = "PR",
): string {
  const base = assetsBaseUrl.replace(/\/+$/, "");
  const path = segments
    .map((s) => encodeURIComponent(s))
    .join("/");
  const withExt = ext.startsWith(".") ? ext : `.${ext}`;
  const url = `${base}/${path}${withExt}`;
  if (host === "AE") {
    return `${url}${url.includes("?") ? "&" : "?"}host=AE`;
  }
  return url;
}
