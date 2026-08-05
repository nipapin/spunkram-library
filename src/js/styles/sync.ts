import {
  downloadCaptionProject,
  fetchCaptionsCatalog,
  flattenCatalog,
  hashArrayBuffer,
  pickProjectFile,
  resolveMediaUrl,
} from "./api";
import { fs, path } from "../lib/cep/node";
import {
  listLocalPackageIds,
  loadLocalPackage,
  loadLocalState,
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
import { defaultsFromDefinition, findControlByNames, isColorArray, rgbaToHex } from "../presets";
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
  fill: findControlByNames(definition, ["Text", "Base", "Fill"])?.id ?? "",
  highlight: findControlByNames(definition, ["Highlight", "Fill"])?.id ?? "",
  background: findControlByNames(definition, ["Background", "Fill"])?.id ?? "",
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
  files: item.files,
});

const hydrateFromPackage = (
  preset: StylePreset,
  definition: MogrtDefinition,
  version: string,
  favorite: boolean,
): StylePreset => {
  const values = defaultsFromDefinition(definition);
  return {
    ...preset,
    favorite,
    styleVersion: version,
    source: "downloaded",
    values,
    origin: makeOrigin(preset.name, values),
    updateAvailable: false,
    preview: previewFromValues(values, definition, preset.preview),
  };
};

export interface DownloadStyleOptions {
  /** Какой файл качать; по умолчанию — под активный хост. */
  file?: CaptionProjectFile;
  hostAppId?: string;
  /** Уже известные flags из каталога (чтобы не качать отсутствующий формат). */
  files?: CaptionCatalogEntry["files"];
  name?: string;
}

/**
 * Подтянуть definition.json для Styles UI (без обязательного aep/mogrt).
 * Нужен, чтобы контролы появились до Transcribe.
 */
export const ensureDefinitionForStyle = async (
  styleId: string,
  options?: { name?: string; files?: CaptionCatalogEntry["files"] },
): Promise<MogrtDefinition> => {
  const existing = loadLocalPackage(styleId);
  if (existing?.definition?.clientControls?.length) {
    return existing.definition;
  }

  // каталог говорит, что definition нет — не долбим API
  if (options?.files && options.files.definition === false) {
    return existing?.definition ?? EMPTY_DEFINITION;
  }

  try {
    const defDl = await downloadCaptionProject(styleId, "definition", undefined, getActiveBrand());
    const text = new TextDecoder("utf-8").decode(new Uint8Array(defDl.buffer));
    const parsed = JSON.parse(text) as MogrtDefinition;
    if (!parsed?.clientControls?.length) {
      return existing?.definition ?? EMPTY_DEFINITION;
    }

    const name = options?.name || existing?.manifest.name || styleId.split("/").pop() || styleId;
    const version = existing?.manifest.version || new Date().toISOString();
    const manifest: LocalStyleManifest = {
      id: styleId,
      name,
      version,
      downloadedAt: existing?.manifest.downloadedAt || version,
      files: {
        ...(existing?.manifest.files ?? {}),
        definition: "definitions.json",
      },
    };
    saveLocalPackage(manifest, parsed);
    return parsed;
  } catch {
    return existing?.definition ?? EMPTY_DEFINITION;
  }
};

/**
 * POST /api/captions → сохранить project.mogrt / project.aep (+ definition.json) в AppData.
 * Вызывать при активном действии (Transcribe), не при выборе карточки.
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
  if (!file) {
    throw new Error("No project file available for this caption (mogrt/aep)");
  }

  const downloaded = await downloadCaptionProject(styleId, file, undefined, getActiveBrand());
  const existing = loadLocalPackage(styleId);
  const name = options?.name || existing?.manifest.name || styleId.split("/").pop() || styleId;
  const version = new Date().toISOString();

  let definition: MogrtDefinition =
    existing?.definition?.clientControls?.length ? existing.definition : EMPTY_DEFINITION;

  if (fileFlags.definition) {
    try {
      const defDl = await downloadCaptionProject(styleId, "definition", undefined, getActiveBrand());
      const text = new TextDecoder("utf-8").decode(new Uint8Array(defDl.buffer));
      const parsed = JSON.parse(text) as MogrtDefinition;
      if (parsed?.clientControls) definition = parsed;
    } catch {
      // definition опционален — Styles UI просто будет без контролов
    }
  }

  const manifest: LocalStyleManifest = {
    id: styleId,
    name,
    version,
    downloadedAt: version,
    files: {
      definition: definition.clientControls?.length ? "definitions.json" : existing?.manifest.files.definition,
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

  const saved = saveLocalPackage(manifest, definition, assets);
  if (!saved) throw new Error("Failed to save caption project locally");

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
  const fileName =
    file === "aep"
      ? pkg.manifest.files.aep
      : file === "mogrt"
        ? pkg.manifest.files.mogrt
        : pkg.manifest.files.definition;
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
): Promise<{ updated: boolean; updateAvailable: boolean }> => {
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
        saveLocalPackage(
          {
            ...existing.manifest,
            remote: { file, ...remoteFp },
          },
          existing.definition,
        );
      }
      return { updated: false, updateAvailable: false };
    }

    if (!remote.buffer.byteLength) {
      return { updated: false, updateAvailable: false };
    }

    const name = options?.name || existing.manifest.name;
    const version = new Date().toISOString();
    let definition = existing.definition;
    if (fileFlags.definition) {
      try {
        const defDl = await downloadCaptionProject(styleId, "definition", undefined, getActiveBrand());
        const text = new TextDecoder("utf-8").decode(new Uint8Array(defDl.buffer));
        const parsed = JSON.parse(text) as MogrtDefinition;
        if (parsed?.clientControls) definition = parsed;
      } catch {
        // keep existing definition
      }
    }

    const manifest: LocalStyleManifest = {
      id: styleId,
      name,
      version,
      downloadedAt: version,
      files: {
        definition: definition.clientControls?.length
          ? "definitions.json"
          : existing.manifest.files.definition,
        aep: file === "aep" || existing.manifest.files.aep ? "project.aep" : undefined,
        mogrt: file === "mogrt" || existing.manifest.files.mogrt ? "project.mogrt" : undefined,
      },
      remote: { file, ...remoteFp },
    };
    const assets: { aep?: ArrayBuffer; mogrt?: ArrayBuffer } = {};
    if (file === "aep") assets.aep = remote.buffer;
    if (file === "mogrt") assets.mogrt = remote.buffer;
    saveLocalPackage(manifest, definition, assets);
    return { updated: true, updateAvailable: false };
  } catch {
    // Network / auth — keep local
    return { updated: false, updateAvailable: false };
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
 * 1) локальный стейт + скачанные пакеты
 * 2) GET /api/captions
 * 3) для скачанных — сравнить local vs R2 и обновить при расхождении
 * 4) список пресетов для UI
 */
export const syncCaptionStyles = async (options?: {
  checkRemoteUpdates?: boolean;
}): Promise<StylesSyncResult> => {
  const checkRemote = options?.checkRemoteUpdates !== false;
  const localState = loadLocalState();
  const definitions: Record<string, MogrtDefinition> = {};
  const localIds = listLocalPackageIds();

  // локальные пакеты индексируются по sanitized dir name — матчим через load по catalog id ниже
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
    if (pkg) {
      localById.set(item.id, pkg);
      definitions[item.id] = pkg.definition;
    }
  }

  // офлайн-пакеты без записи в каталоге — по dir name (sanitized id)
  for (const dirName of localIds) {
    // dirName может быть Base__Base Caption_01 — пробуем найти через reverse не надёжно;
    // если уже в localById — ок; иначе грузим если id === dirName (legacy)
    if ([...localById.keys()].some((id) => id.replace(/[<>:"|?*\\/]/g, "__") === dirName)) continue;
    const pkg = loadLocalPackage(dirName);
    if (pkg) {
      localById.set(pkg.manifest.id, pkg);
      definitions[pkg.manifest.id] = pkg.definition;
    }
  }

  // Compare local project files with R2 and replace when the remote copy changed.
  if (checkRemote && catalog.length > 0) {
    const hostAppId = csi.hostEnvironment?.appId;
    const toCheck = catalog.filter((item) => localById.has(item.id));
    await mapPool(toCheck, 2, async (item) => {
      try {
        const result = await refreshStylePackageIfRemoteChanged(item.id, {
          files: item.files,
          name: item.name,
          hostAppId,
        });
        if (result.updated) {
          const pkg = loadLocalPackage(item.id);
          if (pkg) {
            localById.set(item.id, pkg);
            definitions[item.id] = pkg.definition;
          }
        }
      } catch {
        // keep existing local package
      }
    });
  }

  const presets: StylePreset[] = [];
  const seenStyleIds = new Set<string>();

  for (const item of catalog) {
    seenStyleIds.add(item.id);
    const local = localById.get(item.id) ?? null;
    const favorite = !!localState.favorites[item.id];
    const base = catalogToPreset(item, favorite, !!local);

    if (local) {
      const hydrated = hydrateFromPackage(base, local.definition, local.manifest.version, favorite);
      const edit = localState.downloadedEdits[item.id];
      if (edit && edit.styleVersion === local.manifest.version) {
        presets.push({
          ...hydrated,
          name: edit.name,
          values: edit.values,
          origin: edit.origin,
          favorite,
          preview: edit.preview ?? hydrated.preview,
          categoryName: item.categoryName,
          tags: item.categoryName ? [item.categoryName] : [],
          previewImageUrl: base.previewImageUrl,
          previewVideoUrl: base.previewVideoUrl,
          files: item.files,
          updateAvailable: false,
        });
      } else {
        presets.push({
          ...hydrated,
          categoryName: item.categoryName,
          tags: item.categoryName ? [item.categoryName] : [],
          previewImageUrl: base.previewImageUrl,
          previewVideoUrl: base.previewVideoUrl,
          files: item.files,
          updateAvailable: false,
        });
      }
    } else {
      presets.push(base);
    }
  }

  for (const [id, local] of localById) {
    if (!local || seenStyleIds.has(id)) continue;
    const favorite = !!localState.favorites[id];
    presets.push(
      hydrateFromPackage(
        {
          id,
          name: local.manifest.name,
          favorite,
          styleId: id,
          styleVersion: local.manifest.version,
          source: "downloaded",
          values: {},
          origin: makeOrigin(local.manifest.name, {}),
        },
        local.definition,
        local.manifest.version,
        favorite,
      ),
    );
    definitions[id] = local.definition;
  }

  for (const user of localState.userPresets) {
    presets.push({
      ...user,
      favorite: localState.favorites[user.id] ?? user.favorite,
      source: "user",
    });
    if (!definitions[user.styleId]) {
      const parent = loadLocalPackage(user.styleId);
      if (parent) definitions[user.styleId] = parent.definition;
    }
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
