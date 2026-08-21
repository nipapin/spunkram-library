import {
  downloadCaptionProject,
  fetchCaptionControls,
  fetchCaptionsCatalog,
  fetchCaptionsCdnBaseManifest,
  flattenCatalog,
  hashArrayBuffer,
  pickProjectFile,
  resolveControlsUrl,
  resolveMediaUrl,
} from "./api";
import { fs, path } from "../lib/cep/node";
import {
  loadCdnBaseManifest,
  loadLocalPackage,
  loadLocalState,
  saveCdnBaseManifest,
  saveLocalPackage,
  saveLocalState,
} from "./localStore";
import type {
  CaptionCatalogCategory,
  CaptionCatalogEntry,
  CaptionProjectFile,
  LocalStyleManifest,
  StylePreset,
  StylePreviewColors,
  StylesSyncResult,
} from "./types";
import { EMPTY_DEFINITION } from "./types";
import { csi } from "../lib/utils/bolt";
import { getActiveBrand } from "../lib/utils/brandTheme";
import { defaultsFromDefinition, findControlByAnyNames, isColorArray, rgbaToHex } from "../presets";
import type { ControlValues, MogrtDefinition } from "../presets/types";

const cloneValues = (values: ControlValues): ControlValues =>
  JSON.parse(JSON.stringify(values)) as ControlValues;

export const makeOrigin = (name: string, values: ControlValues) => ({
  name,
  values: cloneValues(values),
});

const normalizeForCompare = (value: unknown): unknown => {
  if (typeof value === "number") return Math.round(value * 1e5) / 1e5;
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = normalizeForCompare(obj[key]);
    }
    return out;
  }
  return value;
};

export const valuesEqual = (a: ControlValues, b: ControlValues) =>
  JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));

export const isPresetDirty = (p: StylePreset): boolean => {
  if (!p.origin) return false;
  if (p.name !== p.origin.name) return true;
  return !valuesEqual(p.values, p.origin.values);
};

export const isPresetValuesDirty = (p: StylePreset): boolean => {
  if (!p.origin) return false;
  return !valuesEqual(p.values, p.origin.values);
};

export const colorIdsFromDefinition = (definition: MogrtDefinition) => ({
  fill: findControlByAnyNames(definition, [["Static", "Fill"]])?.id ?? "",
  highlight: findControlByAnyNames(definition, [["Animated Text", "Fill"]])?.id ?? "",
  background: findControlByAnyNames(definition, [
    ["Segment Settings", "Background", "Fill"],
    ["Follow", "Background", "Fill"],
  ])?.id ?? "",
});

export const previewFromValues = (
  values: ControlValues,
  definition?: MogrtDefinition,
  fallback?: StylePreviewColors,
): Required<StylePreviewColors> => {
  const ids = definition ? colorIdsFromDefinition(definition) : { fill: "", highlight: "", background: "" };
  const fill = values[ids.fill];
  const highlight = values[ids.highlight];
  const background = values[ids.background];
  return {
    text: isColorArray(fill) ? rgbaToHex(fill) : fallback?.text || "#ffffff",
    highlight: isColorArray(highlight) ? rgbaToHex(highlight) : fallback?.highlight || "#ffe14d",
    background: isColorArray(background) ? rgbaToHex(background) : fallback?.background || "#000000",
  };
};

export const presetSwatchColors = (p: StylePreset, definition?: MogrtDefinition) =>
  previewFromValues(p.values, definition, p.preview);

const catalogToPreset = (item: CaptionCatalogEntry, favorite: boolean, downloaded: boolean): StylePreset => ({
  id: item.id,
  name: item.name,
  favorite,
  styleId: item.id,
  styleVersion: downloaded ? "local" : "",
  source: downloaded ? "downloaded" : "catalog",
  values: {},
  origin: makeOrigin(item.name, {}),
  categoryName: item.categoryName,
  tags: item.categoryName ? [item.categoryName] : [],
  previewImageUrl: resolveMediaUrl(item.previewImageUrl),
  previewVideoUrl: resolveMediaUrl(item.previewVideoUrl),
  controlsUrl: resolveControlsUrl(item, getActiveBrand()),
  files: item.files,
});

export interface DownloadStyleOptions {
  /** Какой файл качать; по умолчанию — под активный хост. */
  file?: CaptionProjectFile;
  hostAppId?: string;
  /** Уже известные flags из каталога (чтобы не качать отсутствующий формат). */
  files?: CaptionCatalogEntry["files"];
  name?: string;
  controlsUrl?: string | null;
  previewImageUrl?: string | null;
  previewVideoUrl?: string | null;
}

const controlsCache = new Map<string, MogrtDefinition>();

/**
 * GET public controls.json for Styles UI (CDN URL, not AppData).
 */
export const ensureDefinitionForStyle = async (
  styleId: string,
  options?: {
    name?: string;
    files?: CaptionCatalogEntry["files"];
    controlsUrl?: string | null;
    previewImageUrl?: string | null;
    previewVideoUrl?: string | null;
  },
): Promise<MogrtDefinition> => {
  const cached = controlsCache.get(styleId);
  if (cached) return cached;

  const brand = getActiveBrand();
  const url = resolveControlsUrl(
    {
      id: styleId,
      controlsUrl: options?.controlsUrl,
      previewImageUrl: options?.previewImageUrl,
      previewVideoUrl: options?.previewVideoUrl,
    },
    brand,
  );

  try {
    const parsed = await fetchCaptionControls(url, brand);
    controlsCache.set(styleId, parsed);
    return parsed;
  } catch {
    const empty = EMPTY_DEFINITION;
    controlsCache.set(styleId, empty);
    return empty;
  }
};

/**
 * POST /api/captions → сохранить только project.mogrt / project.aep в AppData.
 * controls.json / thumb / preview — публичные CDN URL, на диск не пишем.
 */
export const downloadStylePackage = async (
  styleId: string,
  options?: DownloadStyleOptions,
): Promise<{
  preset: StylePreset;
  definition: MogrtDefinition;
}> => {
  const hostAppId = options?.hostAppId ?? csi.hostEnvironment?.appId;
  const fileFlags = options?.files ?? { mogrt: true, aep: true, definition: true };
  const file = options?.file ?? pickProjectFile(fileFlags, hostAppId);
  if (!file || file === "definition") {
    throw new Error("No project file available for this caption (mogrt/aep)");
  }

  const downloaded = await downloadCaptionProject(styleId, file, undefined, getActiveBrand());
  const existing = loadLocalPackage(styleId);
  const name = options?.name || existing?.manifest.name || styleId.split("/").pop() || styleId;
  const version = new Date().toISOString();

  const manifest: LocalStyleManifest = {
    id: styleId,
    name,
    version,
    downloadedAt: version,
    files: {
      aep: file === "aep" || existing?.manifest.files.aep ? "project.aep" : undefined,
      mogrt: file === "mogrt" || existing?.manifest.files.mogrt ? "project.mogrt" : undefined,
    },
    remote: {
      file,
      etag: downloaded.etag,
      byteLength: downloaded.byteLength ?? downloaded.buffer.byteLength,
      contentHash: downloaded.contentHash ?? hashArrayBuffer(downloaded.buffer),
    },
  };

  const assets: { aep?: ArrayBuffer; mogrt?: ArrayBuffer } = {};
  if (file === "aep") assets.aep = downloaded.buffer;
  if (file === "mogrt") assets.mogrt = downloaded.buffer;

  const saved = saveLocalPackage(manifest, assets);
  if (!saved) throw new Error("Failed to save caption project locally");

  const definition = await ensureDefinitionForStyle(styleId, {
    name,
    files: fileFlags,
    controlsUrl: options?.controlsUrl,
    previewImageUrl: options?.previewImageUrl,
    previewVideoUrl: options?.previewVideoUrl,
  });
  const values = defaultsFromDefinition(definition);
  const preset: StylePreset = {
    id: styleId,
    name,
    favorite: false,
    styleId,
    styleVersion: version,
    source: "downloaded",
    values,
    origin: makeOrigin(name, values),
    updateAvailable: false,
    files: fileFlags,
    controlsUrl: options?.controlsUrl,
    previewImageUrl: options?.previewImageUrl,
    previewVideoUrl: options?.previewVideoUrl,
  };

  return { preset, definition };
};

const localProjectFingerprint = (
  pkg: NonNullable<ReturnType<typeof loadLocalPackage>>,
  file: CaptionProjectFile,
): { etag?: string; byteLength?: number; contentHash?: string } | null => {
  if (pkg.manifest.remote?.file === file) {
    return {
      etag: pkg.manifest.remote.etag,
      byteLength: pkg.manifest.remote.byteLength,
      contentHash: pkg.manifest.remote.contentHash,
    };
  }
  if (pkg.dir.startsWith("memory://") || typeof fs?.readFileSync !== "function") return null;
  const fileName = file === "aep" ? pkg.manifest.files.aep : file === "mogrt" ? pkg.manifest.files.mogrt : null;
  if (!fileName) return null;
  const full = path.join(pkg.dir, fileName);
  try {
    if (!fs.existsSync(full)) return null;
    const data = fs.readFileSync(full) as Buffer;
    const bytes = new Uint8Array(data);
    // Copy into a standalone buffer for hashing
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return {
      byteLength: bytes.length,
      contentHash: hashArrayBuffer(ab as ArrayBuffer),
    };
  } catch {
    return null;
  }
};

const fingerprintsMatch = (
  local: { etag?: string; byteLength?: number; contentHash?: string } | null,
  remote: { etag?: string; byteLength?: number; contentHash?: string },
): boolean => {
  if (!local) return false;
  if (local.etag && remote.etag && local.etag === remote.etag) return true;
  if (local.contentHash && remote.contentHash && local.contentHash === remote.contentHash) {
    return true;
  }
  if (
    local.byteLength != null &&
    remote.byteLength != null &&
    local.byteLength === remote.byteLength &&
    local.contentHash &&
    remote.contentHash &&
    local.contentHash === remote.contentHash
  ) {
    return true;
  }
  return false;
};

/**
 * Compare local project file with R2 via POST /api/captions.
 * If remote differs, replace the local package with the downloaded bytes.
 */
export const refreshStylePackageIfRemoteChanged = async (
  styleId: string,
  options?: DownloadStyleOptions,
): Promise<{ updated: boolean; updateAvailable: boolean; error?: boolean }> => {
  const existing = loadLocalPackage(styleId);
  if (!existing) return { updated: false, updateAvailable: false };

  const hostAppId = options?.hostAppId ?? csi.hostEnvironment?.appId;
  const fileFlags = options?.files ?? { mogrt: true, aep: true, definition: true };
  const file = options?.file ?? pickProjectFile(fileFlags, hostAppId);
  if (!file || file === "definition") return { updated: false, updateAvailable: false };

  try {
    const localFp = localProjectFingerprint(existing, file);
    const remote = await downloadCaptionProject(
      styleId,
      file,
      undefined,
      getActiveBrand(),
      localFp ?? undefined,
    );
    const remoteFp = {
      etag: remote.etag,
      byteLength: remote.byteLength ?? (remote.unchanged ? localFp?.byteLength : remote.buffer.byteLength),
      contentHash:
        remote.contentHash ??
        (remote.unchanged ? localFp?.contentHash : hashArrayBuffer(remote.buffer)),
    };

    if (remote.unchanged || fingerprintsMatch(localFp, remoteFp)) {
      // Backfill fingerprint on older packages that never stored remote meta.
      if (!existing.manifest.remote?.contentHash && (remoteFp.contentHash || remoteFp.etag)) {
        saveLocalPackage({
          ...existing.manifest,
          remote: { file, ...remoteFp },
        });
      }
      return { updated: false, updateAvailable: false };
    }

    if (!remote.buffer.byteLength) {
      return { updated: false, updateAvailable: false };
    }

    const name = options?.name || existing.manifest.name;
    const version = new Date().toISOString();
    const manifest: LocalStyleManifest = {
      id: styleId,
      name,
      version,
      downloadedAt: version,
      files: {
        aep: file === "aep" || existing.manifest.files.aep ? "project.aep" : undefined,
        mogrt: file === "mogrt" || existing.manifest.files.mogrt ? "project.mogrt" : undefined,
      },
      remote: { file, ...remoteFp },
    };
    const assets: { aep?: ArrayBuffer; mogrt?: ArrayBuffer } = {};
    if (file === "aep") assets.aep = remote.buffer;
    if (file === "mogrt") assets.mogrt = remote.buffer;
    saveLocalPackage(manifest, assets);
    return { updated: true, updateAvailable: false };
  } catch {
    // Network / auth — keep local
    return { updated: false, updateAvailable: false, error: true };
  }
};

const mapPool = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  };
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
};

/**
 * При загрузке расширения / Refresh:
 * 1) GET /api/captions — сетка только из каталога
 * 2) локальные пакеты — кэш mogrt/aep для стилей, которые ещё есть на сервере
 * 3) user presets (Save as New) — отдельная секция Users
 * 4) CDN `{Brand} Captions/Base/manifest.json` — если version изменилась, перекачать локальные проекты
 */
export const syncCaptionStyles = async (options?: {
  checkRemoteUpdates?: boolean;
}): Promise<StylesSyncResult> => {
  // Default off: catalog first so the grid isn't blocked by mogrt re-downloads.
  const checkRemote = options?.checkRemoteUpdates === true;
  const localState = loadLocalState();
  const definitions: Record<string, MogrtDefinition> = {};

  const localById = new Map<string, ReturnType<typeof loadLocalPackage>>();

  let catalog: CaptionCatalogEntry[] = [];
  let categories: CaptionCatalogCategory[] = [];
  let catalogError: string | undefined;

  try {
    const res = await fetchCaptionsCatalog(getActiveBrand());
    categories = res.categories;
    catalog = flattenCatalog(res);
  } catch (err) {
    catalogError = err instanceof Error ? err.message : String(err);
  }

  for (const item of catalog) {
    const pkg = loadLocalPackage(item.id);
    if (pkg) localById.set(item.id, pkg);
  }

  // Cheap gate: only re-download projects when CDN Base/manifest.json version changed.
  if (checkRemote && catalog.length > 0) {
    const brand = getActiveBrand();
    const remoteManifest = await fetchCaptionsCdnBaseManifest(brand);
    const localManifest = loadCdnBaseManifest();
    const versionChanged =
      !!remoteManifest &&
      !(localManifest?.brand === brand && localManifest.version === remoteManifest.version);

    if (versionChanged && remoteManifest) {
      const hadLocalSnapshot = !!localManifest?.version;
      let persistRemote = true;

      // First seen version: remember it, don't mass-redownload existing files.
      // Later bumps: refresh every local project that is still in the catalog.
      if (hadLocalSnapshot) {
        const hostAppId = csi.hostEnvironment?.appId;
        const toCheck = catalog.filter((item) => localById.has(item.id));
        const results = await mapPool(toCheck, 2, async (item) => {
          try {
            const result = await refreshStylePackageIfRemoteChanged(item.id, {
              files: item.files,
              name: item.name,
              hostAppId,
              controlsUrl: item.controlsUrl,
              previewImageUrl: item.previewImageUrl,
              previewVideoUrl: item.previewVideoUrl,
            });
            if (result.updated) {
              const pkg = loadLocalPackage(item.id);
              if (pkg) localById.set(item.id, pkg);
            }
            return result;
          } catch {
            return { updated: false, updateAvailable: false, error: true };
          }
        });
        // Keep the old local version so the next launch retries the bump.
        persistRemote = !results.some((r) => r.error);
      }

      if (persistRemote) {
        saveCdnBaseManifest({
          version: remoteManifest.version,
          fetchedAt: new Date().toISOString(),
          brand,
        });
      }
    }
  }

  const presets: StylePreset[] = [];

  for (const item of catalog) {
    const local = localById.get(item.id) ?? null;
    const favorite = !!localState.favorites[item.id];
    const base = catalogToPreset(item, favorite, !!local);

    if (local) {
      const edit = localState.downloadedEdits[item.id];
      if (edit && edit.styleVersion === local.manifest.version) {
        presets.push({
          ...base,
          name: edit.name,
          values: edit.values,
          origin: edit.origin,
          favorite,
          preview: edit.preview ?? base.preview,
          styleVersion: local.manifest.version,
          source: "downloaded",
          updateAvailable: false,
        });
      } else {
        presets.push({
          ...base,
          styleVersion: local.manifest.version,
          source: "downloaded",
          updateAvailable: false,
        });
      }
    } else {
      presets.push(base);
    }
  }

  for (const user of localState.userPresets) {
    const parent = catalog.find((c) => c.id === user.styleId);
    presets.push({
      ...user,
      favorite: localState.favorites[user.id] ?? user.favorite,
      source: "user",
      controlsUrl: user.controlsUrl ?? parent?.controlsUrl ?? null,
      previewImageUrl: user.previewImageUrl ?? parent?.previewImageUrl ?? null,
      previewVideoUrl: user.previewVideoUrl ?? parent?.previewVideoUrl ?? null,
    });
  }

  presets.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );

  let selectedPresetId = localState.selectedPresetId;
  if (!presets.some((p) => p.id === selectedPresetId)) {
    selectedPresetId = presets[0]?.id ?? "";
  }

  saveLocalState({
    ...localState,
    selectedPresetId,
  });

  return {
    presets,
    definitions,
    catalog,
    categories,
    selectedPresetId,
    error: catalogError,
  };
};

/** Catalog style whose name matches the selected MOGRT projectItem. */
export const matchPresetByStyleName = (
  presets: StylePreset[],
  rawName: string,
): StylePreset | undefined => {
  const name = rawName.replace(/\.mogrt$/i, "").replace(/\s+copy$/i, "").trim();
  if (!name) return undefined;
  const catalog = presets.filter((p) => p.source !== "user");
  const lower = name.toLowerCase();
  return (
    catalog.find((p) => p.name === name) ||
    catalog.find((p) => p.name.toLowerCase() === lower) ||
    catalog.find((p) => p.styleId === name) ||
    catalog.find((p) => p.styleId.toLowerCase().endsWith("/" + lower))
  );
};
