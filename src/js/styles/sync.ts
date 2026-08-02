import { csi } from "../lib/utils/bolt";
import { getActiveBrand } from "../lib/utils/brandTheme";
import { defaultsFromDefinition, findControlByNames, isColorArray, rgbaToHex } from "../presets";
import type { ControlValues, MogrtDefinition } from "../presets/types";
import {
  downloadCaptionProject,
  fetchCaptionsCatalog,
  flattenCatalog,
  pickProjectFile,
  resolveMediaUrl,
} from "./api";
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

/**
 * При загрузке расширения:
 * 1) локальный стейт + скачанные пакеты
 * 2) GET /api/captions
 * 3) список пресетов для UI
 */
export const syncCaptionStyles = async (): Promise<StylesSyncResult> => {
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
        });
      } else {
        presets.push({
          ...hydrated,
          categoryName: item.categoryName,
          tags: item.categoryName ? [item.categoryName] : [],
          previewImageUrl: base.previewImageUrl,
          previewVideoUrl: base.previewVideoUrl,
          files: item.files,
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
