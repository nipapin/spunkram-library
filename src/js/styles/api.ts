import { CAPTIONS_ENDPOINTS, apiUrl, getUserIdentity, type UserIdentity } from "../api";
import type { BrandId } from "../../../brands.config";
import type {
  CaptionCatalogCategory,
  CaptionCatalogEntry,
  CaptionCatalogResponse,
  CaptionProjectFile,
} from "./types";

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
  return url.startsWith("http") ? url : apiUrl(url);
};

/** GET /api/captions — публичный каталог. `brand` — явная фиксация (по умолчанию сервер отдаёт "gal"). */
export const fetchCaptionsCatalog = async (brand?: BrandId): Promise<CaptionCatalogResponse> => {
  const url = brand
    ? `${CAPTIONS_ENDPOINTS.catalog}?brand=${encodeURIComponent(brand)}`
    : CAPTIONS_ENDPOINTS.catalog;
  const response = await fetchWithTimeout(
    apiUrl(url),
    {
      method: "GET",
      headers: { Accept: "application/json" },
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
 * POST /api/captions — скачать project.mogrt / project.aep (binary).
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
  const identity = user ?? getUserIdentity();
  const headers: Record<string, string> = {
    Accept: "application/octet-stream, application/json",
    "Content-Type": "application/json",
  };
  if (identity.token) headers.Authorization = `Bearer ${identity.token}`;
  if (onlyIfChanged?.etag) {
    headers["If-None-Match"] = `"${onlyIfChanged.etag}"`;
  }

  const response = await fetch(apiUrl(CAPTIONS_ENDPOINTS.download), {
    method: "POST",
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
