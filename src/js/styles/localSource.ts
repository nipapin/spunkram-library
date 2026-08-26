/**
 * Admin-only Captions source override: read the same R2 layout from a local folder.
 *
 * `{root}/` ≡ `{Brand} Captions/` on CDN:
 *   {Pack}/{Pack}.aep | {Pack}/{Pack}.mogrt   — one template per pack
 *   {Pack}/{Style}/controls.json|thumb.png|preview.mp4
 *   Base/manifest.json                        — catalog version bump
 *   flat {Caption}/… catalogued under Base
 *
 * POST /api/captions id = pack name (first segment of styleId). Styles in one
 * pack share that pack's template.
 */
import { getBrand, storageKey, type BrandId } from "@brands";
import { isReleaseAdminEmail } from "@/api/update";
import { getUserIdentity } from "@/api/user";
import { fs, path } from "@/lib/cep/node";
import * as panelStore from "@/lib/userdata-store";
import { pathToObjectUrl } from "@/lib/utils/pack-preview";
import { getActiveBrand } from "@/lib/utils/brandTheme";
import { packIdFromStyleId, packProjectFileName } from "./paths";
import type {
  CaptionCatalogCategory,
  CaptionCatalogEntry,
  CaptionCatalogResponse,
  CaptionProjectFile,
  CaptionsCdnBaseManifest,
} from "./types";

export type LocalCaptionDownloadResult = {
  buffer: ArrayBuffer;
  filename: string;
  file: CaptionProjectFile;
  byteLength?: number;
  contentHash?: string;
};

const hashBuffer = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}:${bytes.length}`;
};

const STORE_KEY = storageKey("captionsLocalSourceRoot");
const FLAT_CATEGORY = "Base";
const SKIP_DIRS = new Set(["(Footage)", "Footage"]);

const cepFsOk = (): boolean =>
  typeof fs?.existsSync === "function" &&
  typeof fs?.readdirSync === "function" &&
  typeof fs?.readFileSync === "function" &&
  typeof path?.join === "function";

const isAbsPath = (p: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\\\");

/** Raw stored folder (may be parent of brand prefix). Empty when unset. */
export const getStoredCaptionsLocalRoot = (): string => {
  try {
    return (panelStore.getItem(STORE_KEY) || "").trim();
  } catch {
    return "";
  }
};

export const setCaptionsLocalRoot = (folder: string | null): void => {
  const next = (folder || "").trim();
  if (!next) {
    panelStore.removeItem(STORE_KEY);
    return;
  }
  panelStore.setItem(STORE_KEY, next);
};

const isAdminNow = (): boolean => isReleaseAdminEmail(getUserIdentity().email);

/**
 * Resolve the brand-root directory used as `{Brand} Captions/`.
 * If the pick contains a `Spunkram Captions` / `Gal Captions` child, use that.
 * Returns null when unset, not admin, or folder missing.
 */
export const getCaptionsLocalRoot = (brand?: BrandId): string | null => {
  if (!isAdminNow() || !cepFsOk()) return null;
  const stored = getStoredCaptionsLocalRoot();
  if (!stored || !fs.existsSync(stored)) return null;

  const b = brand ?? getActiveBrand();
  const prefix = getBrand(b).captionsCdnPrefix;
  const nested = path.join(stored, prefix);
  try {
    if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
      return nested;
    }
  } catch {
    // ignore
  }
  const base = path.basename(stored);
  if (base === prefix || fs.existsSync(path.join(stored, "Base"))) {
    return stored;
  }
  return stored;
};

/** True only when Settings has a real folder. Empty / missing path is always false. */
export const isCaptionsLocalOverrideActive = (brand?: BrandId): boolean => {
  if (!getStoredCaptionsLocalRoot()) return false;
  return !!getCaptionsLocalRoot(brand);
};

/** Same segment rules as `publicCaptionFileUrl` — styleId + fileName under local root. */
export const captionsLocalFile = (
  styleId: string,
  fileName: string,
  brand?: BrandId,
): string | null => {
  const root = getCaptionsLocalRoot(brand);
  if (!root) return null;
  const segs = styleId
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..");
  return path.join(root, ...segs, fileName);
};

/**
 * Pack template on disk: `{root}/{Pack}/{Pack}.aep|mogrt`.
 * `packId` is the POST download id (first segment of styleId).
 */
export const resolveLocalPackPath = (
  packId: string,
  file: "aep" | "mogrt",
  brand?: BrandId,
): string | null => {
  const root = getCaptionsLocalRoot(brand);
  if (!root || !cepFsOk() || !packId) return null;
  const fileName = packProjectFileName(packId, file);
  const candidate = path.join(root, packId, fileName);
  return fs.existsSync(candidate) ? candidate : null;
};

/** Live pack paths for host apply (no AppData copy while override is on). */
export const getLocalOverrideAssetPaths = (
  packIdOrStyleId: string,
  brand?: BrandId,
): { dir: string; aep?: string; mogrt?: string } | null => {
  const root = getCaptionsLocalRoot(brand);
  if (!root || !packIdOrStyleId) return null;
  const packId = packIdFromStyleId(packIdOrStyleId);
  if (!packId) return null;
  const aep = resolveLocalPackPath(packId, "aep", brand) ?? undefined;
  const mogrt = resolveLocalPackPath(packId, "mogrt", brand) ?? undefined;
  if (!aep && !mogrt) return null;
  return { dir: path.join(root, packId), aep, mogrt };
};

const packHasFile = (root: string, packId: string, file: "aep" | "mogrt"): boolean => {
  const fileName = packProjectFileName(packId, file);
  return fs.existsSync(path.join(root, packId, fileName));
};

const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

const listDirs = (dir: string): string[] => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true }) as Array<{
      name: string;
      isDirectory: () => boolean;
    }>;
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

const listFiles = (dir: string): string[] => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true }) as Array<{
      name: string;
      isFile: () => boolean;
    }>;
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
};

const mediaUrl = (absolutePath: string | null): string | null => {
  if (!absolutePath || !fs.existsSync(absolutePath)) return null;
  return pathToObjectUrl(absolutePath);
};

type CaptionFlags = {
  thumb: boolean;
  preview: boolean;
  controls: boolean;
  definition: boolean;
};

const emptyFlags = (): CaptionFlags => ({
  thumb: false,
  preview: false,
  controls: false,
  definition: false,
});

const applyFileFlag = (flags: CaptionFlags, file: string): void => {
  if (file === "thumb.png") flags.thumb = true;
  else if (file === "preview.mp4") flags.preview = true;
  else if (file === "controls.json") flags.controls = true;
  else if (file === "definition.json") flags.definition = true;
};

/**
 * Walk local brand root → same tree shape as GET /api/captions.
 * Per-pack `files.mogrt/aep` reflect `{Pack}/{Pack}.*` on disk (not a shared master).
 */
export const scanLocalCaptionsCatalog = (brand?: BrandId): CaptionCatalogResponse => {
  const root = getCaptionsLocalRoot(brand);
  if (!root || !cepFsOk()) {
    return { rootConfigured: false, categories: [] };
  }

  const categoryOrder: string[] = [];
  const categoryMap = new Map<string, Map<string, CaptionFlags>>();

  const ensure = (category: string, caption: string): CaptionFlags => {
    if (!categoryMap.has(category)) {
      categoryMap.set(category, new Map());
      categoryOrder.push(category);
    }
    const captions = categoryMap.get(category)!;
    if (!captions.has(caption)) captions.set(caption, emptyFlags());
    return captions.get(caption)!;
  };

  const topDirs = listDirs(root);
  for (const top of topDirs) {
    if (SKIP_DIRS.has(top)) continue;
    const topDir = path.join(root, top);
    const topFiles = listFiles(topDir);
    const hasControls = topFiles.includes("controls.json");
    const hasThumb = topFiles.includes("thumb.png");
    const hasPreview = topFiles.includes("preview.mp4");

    if (hasControls || hasThumb || hasPreview) {
      // Flat: {Caption}/{file} → catalogue under Base (pack = Base)
      const flags = ensure(FLAT_CATEGORY, top);
      for (const file of topFiles) applyFileFlag(flags, file);
      continue;
    }

    // Nested: {Pack}/{Style}/{file} — pack templates {Pack}.{aep|mogrt} sit beside style dirs
    for (const caption of listDirs(topDir)) {
      if (SKIP_DIRS.has(caption)) continue;
      const captionDir = path.join(topDir, caption);
      const flags = ensure(top, caption);
      for (const file of listFiles(captionDir)) applyFileFlag(flags, file);
    }
  }

  categoryOrder.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const categories: CaptionCatalogCategory[] = [];
  for (const categoryName of categoryOrder) {
    const captionsMap = categoryMap.get(categoryName)!;
    const captionNames = Array.from(captionsMap.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    const packId = categoryName;
    const hasAep = packHasFile(root, packId, "aep");
    const hasMogrt = packHasFile(root, packId, "mogrt");

    const captions: CaptionCatalogEntry[] = [];
    for (const captionName of captionNames) {
      const flags = captionsMap.get(captionName)!;
      if (!flags.controls && !flags.thumb && !flags.preview) continue;
      const id = `${categoryName}/${captionName}`;
      const dir = path.join(root, categoryName, captionName);
      // Flat layout stores files under {root}/{caption} but id is Base/{caption}
      const flatDir = path.join(root, captionName);
      const styleDir =
        categoryName === FLAT_CATEGORY && !fs.existsSync(dir) && fs.existsSync(flatDir)
          ? flatDir
          : dir;

      captions.push({
        id,
        name: captionName,
        slug: slugify(captionName),
        categoryName,
        categorySlug: slugify(categoryName),
        previewImageUrl: flags.thumb ? mediaUrl(path.join(styleDir, "thumb.png")) : null,
        previewVideoUrl: flags.preview ? mediaUrl(path.join(styleDir, "preview.mp4")) : null,
        controlsUrl: flags.controls ? path.join(styleDir, "controls.json") : null,
        files: {
          mogrt: hasMogrt,
          aep: hasAep,
          definition: flags.definition,
        },
      });
    }
    if (captions.length > 0) {
      categories.push({
        name: categoryName,
        slug: slugify(categoryName),
        captions,
      });
    }
  }

  return { rootConfigured: true, categories };
};

export const readLocalBaseManifest = (brand?: BrandId): CaptionsCdnBaseManifest | null => {
  const root = getCaptionsLocalRoot(brand);
  if (!root || !cepFsOk()) return null;
  const filePath = path.join(root, FLAT_CATEGORY, "manifest.json");
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, { encoding: "utf8" }).toString();
    const data = JSON.parse(text) as { version?: unknown };
    if (typeof data.version !== "string") return null;
    const version = data.version.trim();
    return version ? { version } : null;
  } catch {
    return null;
  }
};

export const readLocalControlsFile = (filePath: string): string | null => {
  if (!cepFsOk() || !filePath || !fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, { encoding: "utf8" }).toString();
  } catch {
    return null;
  }
};

/** True when `url` is an absolute filesystem path (local controls). */
export const isLocalFsPath = (url: string): boolean => isAbsPath(url) && !url.startsWith("http");

/**
 * Read pack template or per-style definition.
 * For mogrt/aep, `id` is the pack name (POST body), e.g. `"Bounce"`.
 */
export const readLocalProjectFile = (
  id: string,
  file: CaptionProjectFile,
  brand?: BrandId,
): LocalCaptionDownloadResult | null => {
  if (file === "definition") {
    const defPath = captionsLocalFile(id, "definition.json", brand);
    if (!defPath || !fs.existsSync(defPath)) return null;
    try {
      const data = fs.readFileSync(defPath) as Buffer;
      const bytes = new Uint8Array(data);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return {
        buffer,
        filename: "definition.json",
        file,
        byteLength: bytes.length,
        contentHash: hashBuffer(buffer),
      };
    } catch {
      return null;
    }
  }

  if (file !== "aep" && file !== "mogrt") return null;

  const packId = packIdFromStyleId(id) || id.trim();
  const packPath = resolveLocalPackPath(packId, file, brand);
  if (!packPath) return null;
  try {
    const data = fs.readFileSync(packPath) as Buffer;
    const bytes = new Uint8Array(data);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const filename = packProjectFileName(packId, file);
    return {
      buffer,
      filename,
      file,
      byteLength: bytes.length,
      contentHash: hashBuffer(buffer),
    };
  } catch {
    return null;
  }
};
