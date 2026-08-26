import type { ControlValues, MogrtDefinition } from "../presets/types";

export type CaptionProjectFile = "mogrt" | "aep" | "definition";

/** Caption из GET /api/captions (плоская запись с категорией). */
export interface CaptionCatalogEntry {
  id: string;
  name: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
  /** Public CDN URL for `controls.json` (Styles UI). */
  controlsUrl: string | null;
  files: {
    mogrt: boolean;
    aep: boolean;
    definition: boolean;
  };
}

export interface CaptionCatalogCategory {
  name: string;
  slug: string;
  captions: CaptionCatalogEntry[];
}

export interface CaptionCatalogResponse {
  rootConfigured: boolean;
  categories: CaptionCatalogCategory[];
}

/** @deprecated alias — раньше был flat style catalog */
export type CaptionStyleCatalogItem = CaptionCatalogEntry;

export interface StylePreviewColors {
  text?: string;
  highlight?: string;
  background?: string;
}

/**
 * Источник пресета в UI:
 * - catalog — есть в каталоге, пакет ещё не скачан
 * - downloaded — серверный пакет лежит в AppData
 * - user — локальная пользовательская копия / Save as New
 */
export type PresetSource = "catalog" | "downloaded" | "user";

export type PresetOrigin = { name: string; values: ControlValues };

/** Пресет в UI / локальном стейте. */
export interface StylePreset {
  id: string;
  name: string;
  favorite: boolean;
  /** id на сервере (`Pack/Caption Folder`). */
  styleId: string;
  /** версия/метка локального пакета (downloadedAt). */
  styleVersion: string;
  source: PresetSource;
  values: ControlValues;
  origin: PresetOrigin;
  /** на сервере файл новее локального (сравниваем etag/size/hash с R2). */
  updateAvailable?: boolean;
  preview?: StylePreviewColors;
  categoryName?: string;
  /** Пока — имя категории; позже придут с сервера. */
  tags?: string[];
  previewImageUrl?: string | null;
  previewVideoUrl?: string | null;
  controlsUrl?: string | null;
  files?: CaptionCatalogEntry["files"];
}

/**
 * CDN `{Brand} Captions/Base/manifest.json` — каталожная версия проектов.
 * Локальная копия: AppData/spunkram-library/captions-base-manifest.json
 */
export interface CaptionsCdnBaseManifest {
  version: string;
}

/** Сохранённый снимок CDN Base/manifest.json (чтобы ловить bump версии). */
export interface LocalCdnBaseManifest extends CaptionsCdnBaseManifest {
  fetchedAt: string;
  brand: string;
}

/** manifest.json скачанного пакета в AppData/styles/{safeId}/ */
export interface LocalStyleManifest {
  id: string;
  name: string;
  version: string;
  downloadedAt: string;
  files: {
    /** Pack project — `{Pack}.aep` */
    aep?: string;
    /** Pack project — `{Pack}.mogrt` */
    mogrt?: string;
  };
  /** Fingerprint of last downloaded project file (R2 / CDN). */
  remote?: {
    file: CaptionProjectFile;
    etag?: string;
    byteLength?: number;
    contentHash?: string;
  };
}

/** Полный пакет после скачивания / чтения с диска. */
export interface LocalStylePackage {
  manifest: LocalStyleManifest;
  definition: MogrtDefinition;
  dir: string;
}

/** Локальный UI-стейт (выбор, избранное, user-пресеты, правки скачанных). */
export interface StylesLocalState {
  version: number;
  selectedPresetId: string;
  favorites: Record<string, boolean>;
  userPresets: StylePreset[];
  /** Сохранённые правки скачанных серверных пресетов (ключ = styleId). */
  downloadedEdits: Record<string, StylePreset>;
}

export type StylesSyncStatus = "idle" | "loading" | "ready" | "error";

export interface StylesSyncResult {
  presets: StylePreset[];
  definitions: Record<string, MogrtDefinition>;
  catalog: CaptionCatalogEntry[];
  categories: CaptionCatalogCategory[];
  selectedPresetId: string;
  error?: string;
}

export const EMPTY_DEFINITION: MogrtDefinition = { clientControls: [] };
