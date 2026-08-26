import { CAPTIONS_ENDPOINTS, apiUrl, getUserIdentity, type UserIdentity } from "../api";
import { getBrand, type BrandId } from "@brands";
import { CONTROLS_FILE, normalizeDefinition } from "../presets/controlsSchema";
import { cepHttpRequest } from "../lib/api/cep-http";
import type { MogrtDefinition } from "../presets/types";
import type {
  CaptionCatalogCategory,
  CaptionCatalogEntry,
  CaptionCatalogResponse,
  CaptionProjectFile,
  CaptionsCdnBaseManifest,
} from "./types";
import {
  captionsLocalFile,
  isCaptionsLocalOverrideActive,
  isLocalFsPath,
  readLocalBaseManifest,
  readLocalControlsFile,
  readLocalProjectFile,
  scanLocalCaptionsCatalog,
} from "./localSource";

export class CaptionApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CaptionApiError";
    this.status = status;
    this.code = code;
  }
}

/** Сообщение для UI только после активного действия (Transcribe). */
export const authErrorMessage = (err: unknown): string | null => {
  if (!(err instanceof CaptionApiError)) return null;
  if (err.status === 401 || err.code === "UNAUTHORIZED") return "Please sign in to continue";
  if (err.code === "SUBSCRIPTION_REQUIRED") return "An active subscription is required";
  if (err.code === "GENERATION_LIMIT_REACHED") return "No generations left. Upgrade or buy extra credits.";
  return null;
};

const CATALOG_TIMEOUT_MS = 12000;

const NO_CACHE_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
};

/** Bypass CEF + Cloudflare URL cache — query string is part of the CDN cache key. */
const withCacheBust = (url: string): string => {
  const join = url.indexOf("?") >= 0 ? "&" : "?";
  return `${url}${join}_=${Date.now()}`;
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> => {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = 0;
  try {
    const request = fetch(url, ctrl ? { ...init, signal: ctrl.signal } : init);
    const timeout = new Promise<Response>((_, reject) => {
      timer = setTimeout(() => {
        ctrl?.abort();
        reject(new CaptionApiError("Captions server timed out", 0, "TIMEOUT"));
      }, timeoutMs) as unknown as number;
    });
    return await Promise.race([request, timeout]);
  } catch (err) {
    if (err instanceof CaptionApiError) throw err;
    if (ctrl?.signal.aborted) {
      throw new CaptionApiError("Captions server timed out", 0, "TIMEOUT");
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const asCaption = (
  raw: unknown,
  categoryName: string,
  categorySlug: string,
): CaptionCatalogEntry | null => {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  const files = (o.files && typeof o.files === "object" ? o.files : {}) as Record<string, unknown>;
  return {
    id: o.id,
    name: o.name,
    slug: typeof o.slug === "string" ? o.slug : o.id,
    categoryName,
    categorySlug,
    previewImageUrl: typeof o.previewImageUrl === "string" ? o.previewImageUrl : null,
    previewVideoUrl: typeof o.previewVideoUrl === "string" ? o.previewVideoUrl : null,
    controlsUrl: typeof o.controlsUrl === "string" ? o.controlsUrl : null,
    files: {
      mogrt: !!files.mogrt,
      aep: !!files.aep,
      definition: !!files.definition,
    },
  };
};

const asCategory = (raw: unknown): CaptionCatalogCategory | null => {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string") return null;
  const slug = typeof o.slug === "string" ? o.slug : o.name;
  const list = Array.isArray(o.captions) ? o.captions : [];
  return {
    name: o.name,
    slug,
    captions: list
      .map((c) => asCaption(c, o.name as string, slug))
      .filter((x): x is CaptionCatalogEntry => !!x),
  };
};

/** Абсолютный URL для `<img>` / `<video>` (previewImageUrl / previewVideoUrl). */
export const resolveMediaUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("blob:") || url.startsWith("data:")) return url;
  // Absolute FS paths stay as-is for controls; previews should already be blob: from scan
  if (isLocalFsPath(url)) return url;
  return apiUrl(url);
};

const CAPTIONS_CDN_BASE = "https://cdn.motionflow.pro";
const captionsCdnPrefix = (brand: BrandId): string => getBrand(brand).captionsCdnPrefix;
/** Folder that holds the catalog version file (`manifest.json`) on CDN. */
export const CAPTIONS_CDN_VERSION_FOLDER = "Base";

/** Sibling file next to a CDN thumb/preview URL (`thumb.png` → `controls.json`). */
export const siblingPublicUrl = (
  url: string | null | undefined,
  fileName: string,
): string | null => {
  if (!url) return null;
  const clean = url.split("#")[0].split("?")[0];
  const slash = clean.lastIndexOf("/");
  if (slash < 0) return null;
  return `${clean.slice(0, slash + 1)}${encodeURIComponent(fileName)}`;
};

export const publicCaptionFileUrl = (
  styleId: string,
  fileName: string,
  brand: BrandId,
): string => {
  const segs = [
    captionsCdnPrefix(brand),
    ...styleId.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== ".."),
    fileName,
  ];
  return `${CAPTIONS_CDN_BASE}/${segs.map(encodeURIComponent).join("/")}`;
};

/** Public CDN URL for `{Brand} Captions/Base/manifest.json`. */
export const captionsCdnBaseManifestUrl = (brand: BrandId): string =>
  publicCaptionFileUrl(CAPTIONS_CDN_VERSION_FOLDER, "manifest.json", brand);

/** GET CDN catalog version. Returns null on network / parse / CORS errors. */
export const fetchCaptionsCdnBaseManifest = async (
  brand: BrandId,
): Promise<CaptionsCdnBaseManifest | null> => {
  if (isCaptionsLocalOverrideActive(brand)) {
    return readLocalBaseManifest(brand);
  }

  const url = withCacheBust(captionsCdnBaseManifestUrl(brand));
  const parse = (text: string): CaptionsCdnBaseManifest | null => {
    try {
      const data = JSON.parse(text) as { version?: unknown };
      if (typeof data.version !== "string") return null;
      const version = data.version.trim();
      return version ? { version } : null;
    } catch {
      return null;
    }
  };

  try {
    // Node https — CEP Chromium keeps a disk HTTP cache that ignores Cache-Control
    // on GET cdn.motionflow.pro, so window.fetch() can keep returning 1.0.2 forever.
    const result = await cepHttpRequest(url, {
      method: "GET",
      headers: NO_CACHE_HEADERS,
      timeoutMs: CATALOG_TIMEOUT_MS,
    });
    if (result.ok) {
      const parsed = parse(result.text);
      if (parsed) return parsed;
    }
  } catch {
    // fall through to fetch
  }

  try {
    const response = await fetchWithTimeout(
      url,
      { method: "GET", cache: "no-store", headers: { ...NO_CACHE_HEADERS } },
      CATALOG_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    return parse(await response.text());
  } catch {
    return null;
  }
};

/** Public CDN URL for Styles `controls.json` — same host as thumb/preview. */
export const resolveControlsUrl = (
  item: {
    id: string;
    controlsUrl?: string | null;
    previewImageUrl?: string | null;
    previewVideoUrl?: string | null;
  },
  brand: BrandId,
): string => {
  if (isCaptionsLocalOverrideActive(brand)) {
    if (item.controlsUrl && isLocalFsPath(item.controlsUrl)) return item.controlsUrl;
    const local = captionsLocalFile(item.id, CONTROLS_FILE, brand);
    if (local) return local;
  }
  const explicit = resolveMediaUrl(item.controlsUrl);
  if (explicit && !isLocalFsPath(explicit)) return explicit;
  if (item.controlsUrl && isLocalFsPath(item.controlsUrl)) return item.controlsUrl;
  return (
    siblingPublicUrl(item.previewImageUrl, CONTROLS_FILE) ||
    siblingPublicUrl(item.previewVideoUrl, CONTROLS_FILE) ||
    publicCaptionFileUrl(item.id, CONTROLS_FILE, brand)
  );
};

const controlsApiFallbackUrl = (cdnUrl: string, brand: BrandId): string | null => {
  try {
    const pathname = decodeURIComponent(new URL(cdnUrl).pathname).replace(/^\//, "");
    const prefix = `${captionsCdnPrefix(brand)}/`;
    if (!pathname.startsWith(prefix)) return null;
    const rest = pathname
      .slice(prefix.length)
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    return `${apiUrl(`/api/captions/media/${rest}`)}?brand=${encodeURIComponent(brand)}`;
  } catch {
    return null;
  }
};

/** GET public `controls.json` (CDN, then API proxy if CORS/CDN fails). */
export const fetchCaptionControls = async (
  url: string,
  brand: BrandId,
): Promise<MogrtDefinition> => {
  const parse = (text: string): MogrtDefinition | null => {
    try {
      const parsed = normalizeDefinition(JSON.parse(text));
      return parsed.clientControls?.length ? parsed : null;
    } catch {
      return null;
    }
  };

  if (isLocalFsPath(url)) {
    const text = readLocalControlsFile(url);
    if (text) {
      const parsed = parse(text);
      if (parsed) return parsed;
    }
    return { clientControls: [] };
  }

  const load = async (target: string): Promise<MogrtDefinition | null> => {
    try {
      // Node https — CEP Chromium caches GET cdn.motionflow.pro past Cache-Control.
      const result = await cepHttpRequest(withCacheBust(target), {
        method: "GET",
        headers: NO_CACHE_HEADERS,
        timeoutMs: CATALOG_TIMEOUT_MS,
      });
      if (result.ok) {
        const parsed = parse(result.text);
        if (parsed) return parsed;
      }
    } catch {
      // fall through to fetch
    }

    try {
      const response = await fetch(withCacheBust(target), {
        method: "GET",
        cache: "no-store",
        headers: NO_CACHE_HEADERS,
      });
      if (!response.ok) return null;
      return parse(await response.text());
    } catch {
      return null;
    }
  };

  const fromCdn = await load(url);
  if (fromCdn) return fromCdn;

  const fallback = controlsApiFallbackUrl(url, brand);
  if (fallback && fallback !== url) {
    const fromApi = await load(fallback);
    if (fromApi) return fromApi;
  }

  return { clientControls: [] };
};

/** GET /api/captions — публичный каталог. `brand` — явная фиксация (по умолчанию сервер отдаёт "gal"). */
export const fetchCaptionsCatalog = async (brand?: BrandId): Promise<CaptionCatalogResponse> => {
  if (brand ? isCaptionsLocalOverrideActive(brand) : isCaptionsLocalOverrideActive()) {
    return scanLocalCaptionsCatalog(brand);
  }

  const url = brand
    ? `${CAPTIONS_ENDPOINTS.catalog}?brand=${encodeURIComponent(brand)}`
    : CAPTIONS_ENDPOINTS.catalog;
  const response = await fetchWithTimeout(
    apiUrl(url),
    {
      method: "GET",
      cache: "no-store",
      headers: { ...NO_CACHE_HEADERS },
    },
    CATALOG_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new CaptionApiError(`Could not load captions (${response.status})`, response.status);
  }
  const data = (await response.json()) as Partial<CaptionCatalogResponse>;
  const categories = Array.isArray(data.categories)
    ? data.categories.map(asCategory).filter((x): x is CaptionCatalogCategory => !!x)
    : [];
  return {
    rootConfigured: data.rootConfigured !== false,
    categories,
  };
};

/** Плоский список captions из дерева категорий. */
export const flattenCatalog = (res: CaptionCatalogResponse): CaptionCatalogEntry[] =>
  res.categories.flatMap((c) => c.captions);

export interface CaptionDownloadResult {
  buffer: ArrayBuffer;
  filename: string;
  file: CaptionProjectFile;
  etag?: string;
  byteLength?: number;
  contentHash?: string;
}

/** Fast non-crypto fingerprint for comparing local vs remote project bytes. */
export const hashArrayBuffer = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}:${bytes.length}`;
};

const parseFilename = (disposition: string | null, id: string, file: CaptionProjectFile): string => {
  if (disposition) {
    const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/.exec(disposition);
    const raw = match?.[1] ?? match?.[2];
    if (raw) {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  const base = id.split("/").pop() || id;
  return `${base}.${file}`;
};

const userPayload = (user?: UserIdentity) => {
  const u = user ?? getUserIdentity();
  const out: { id?: string; email?: string } = {};
  if (u.id) out.id = u.id;
  if (u.email) out.email = u.email;
  return out;
};

/**
 * POST /api/captions — скачать `{Pack}.mogrt` / `{Pack}.aep` (binary).
 * `id` is the pack name (`Base`, `Bounce`, …), not a per-style folder.
 * Auth: Bearer Motionflow CEP token (preferred); user id/email also in body.
 *
 * Pass `onlyIfChanged` to skip buffering when remote etag matches (or after
 * hash compare). Returns `{ unchanged: true }` when local is already current.
 */
export const downloadCaptionProject = async (
  id: string,
  file: CaptionProjectFile = "mogrt",
  user?: UserIdentity,
  brand?: BrandId,
  onlyIfChanged?: { etag?: string; byteLength?: number; contentHash?: string },
): Promise<CaptionDownloadResult & { unchanged?: boolean }> => {
  if (isCaptionsLocalOverrideActive(brand)) {
    const local = readLocalProjectFile(id, file, brand);
    if (!local) {
      throw new CaptionApiError("Project file not found.", 404, "PROJECT_NOT_READY");
    }
    if (
      onlyIfChanged?.contentHash &&
      local.contentHash &&
      onlyIfChanged.contentHash === local.contentHash
    ) {
      return { ...local, unchanged: true };
    }
    return local;
  }

  const identity = user ?? getUserIdentity();
  const headers: Record<string, string> = {
    Accept: "application/octet-stream, application/json",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };
  if (identity.token) headers.Authorization = `Bearer ${identity.token}`;
  if (onlyIfChanged?.etag) {
    headers["If-None-Match"] = `"${onlyIfChanged.etag}"`;
  }

  const response = await fetch(apiUrl(CAPTIONS_ENDPOINTS.download), {
    method: "POST",
    cache: "no-store",
    credentials: "include",
    headers,
    body: JSON.stringify({ id, file, user: userPayload(identity), ...(brand ? { brand } : {}) }),
  });

  if (response.status === 401) {
    throw new CaptionApiError("Unauthorized", 401, "UNAUTHORIZED");
  }

  if (response.status === 304) {
    try {
      await response.body?.cancel();
    } catch {
      /* ignore */
    }
    return {
      buffer: new ArrayBuffer(0),
      filename: "",
      file,
      etag: onlyIfChanged?.etag,
      byteLength: onlyIfChanged?.byteLength,
      contentHash: onlyIfChanged?.contentHash,
      unchanged: true,
    };
  }

  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    let code: string | undefined;
    try {
      const err = (await response.json()) as { error?: string; code?: string };
      message = err.error || message;
      code = err.code;
    } catch {
      // binary / empty body
    }
    throw new CaptionApiError(message, response.status, code);
  }

  const etag = response.headers.get("ETag")?.replace(/^W\//, "").replace(/"/g, "") || undefined;
  const lenHeader = response.headers.get("Content-Length");
  const headerLength =
    typeof lenHeader === "string" && /^\d+$/.test(lenHeader) ? Number(lenHeader) : undefined;

  // Matching ETag — cancel body, keep local file.
  if (onlyIfChanged?.etag && etag && onlyIfChanged.etag === etag) {
    try {
      await response.body?.cancel();
    } catch {
      /* ignore */
    }
    return {
      buffer: new ArrayBuffer(0),
      filename: "",
      file,
      etag,
      byteLength: headerLength ?? onlyIfChanged.byteLength,
      contentHash: onlyIfChanged.contentHash,
      unchanged: true,
    };
  }

  const buffer = await response.arrayBuffer();
  const filename = parseFilename(response.headers.get("Content-Disposition"), id, file);
  const byteLength = headerLength ?? buffer.byteLength;
  const contentHash = hashArrayBuffer(buffer);

  if (onlyIfChanged?.contentHash && onlyIfChanged.contentHash === contentHash) {
    return {
      buffer,
      filename,
      file,
      etag,
      byteLength,
      contentHash,
      unchanged: true,
    };
  }

  return { buffer, filename, file, etag, byteLength, contentHash };
};

/** Какой файл качать под текущий хост. */
export const pickProjectFile = (
  files: CaptionCatalogEntry["files"],
  hostAppId?: string,
): CaptionProjectFile | null => {
  if (hostAppId === "AEFT") {
    if (files.aep) return "aep";
    if (files.mogrt) return "mogrt";
    return null;
  }
  if (hostAppId === "PPRO") {
    if (files.mogrt) return "mogrt";
    if (files.aep) return "aep";
    return null;
  }
  if (files.mogrt) return "mogrt";
  if (files.aep) return "aep";
  return null;
};

/** @deprecated use fetchCaptionsCatalog + flattenCatalog */
export const fetchCaptionStylesCatalog = async (): Promise<CaptionCatalogEntry[]> => {
  const res = await fetchCaptionsCatalog();
  return flattenCatalog(res);
};
