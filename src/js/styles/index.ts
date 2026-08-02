export type {
  CaptionCatalogCategory,
  CaptionCatalogEntry,
  CaptionCatalogResponse,
  CaptionProjectFile,
  CaptionStyleCatalogItem,
  LocalStyleManifest,
  LocalStylePackage,
  PresetOrigin,
  PresetSource,
  StylePreset,
  StylePreviewColors,
  StylesLocalState,
  StylesSyncResult,
  StylesSyncStatus,
} from "./types";
export { EMPTY_DEFINITION } from "./types";

export {
  CaptionApiError,
  authErrorMessage,
  downloadCaptionProject,
  fetchCaptionStylesCatalog,
  fetchCaptionsCatalog,
  flattenCatalog,
  pickProjectFile,
  resolveMediaUrl,
} from "./api";
export type { CaptionDownloadResult } from "./api";
export {
  loadLocalPackage,
  loadLocalState,
  removeLocalPackage,
  removeUserPreset,
  saveLocalPackage,
  saveLocalState,
  upsertUserPreset,
} from "./localStore";
export { getStylePackageDir, getStylesDir, getStylesRoot, styleIdToDirName } from "./paths";
export {
  colorIdsFromDefinition,
  downloadStylePackage,
  ensureDefinitionForStyle,
  isPresetDirty,
  isPresetValuesDirty,
  makeOrigin,
  presetSwatchColors,
  previewFromValues,
  syncCaptionStyles,
  valuesEqual,
} from "./sync";
export {
  acquireAndApplyPreset,
  acquirePresetProject,
  applyPresetProjectInHost,
  getLocalStyleAssetPaths,
} from "./applyPipeline";
export type {
  AcquirePresetStatus,
  ApplyStyleProjectResult,
  LocalStyleAssetPaths,
  PreparedPresetProject,
} from "./applyPipeline";
