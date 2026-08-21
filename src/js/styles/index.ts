export type {
  CaptionCatalogCategory,
  CaptionCatalogEntry,
  CaptionCatalogResponse,
  CaptionProjectFile,
  CaptionStyleCatalogItem,
  CaptionsCdnBaseManifest,
  LocalCdnBaseManifest,
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
  colorIdsFromDefinition,
  downloadStylePackage,
  ensureDefinitionForStyle,
  isPresetDirty,
  isPresetValuesDirty,
  makeOrigin,
  presetSwatchColors,
  matchPresetByStyleName,
  previewFromValues,
  refreshStylePackageIfRemoteChanged,
  syncCaptionStyles,
  valuesEqual,
} from "./sync";
export {
  CaptionApiError,
  authErrorMessage,
  captionsCdnBaseManifestUrl,
  downloadCaptionProject,
  fetchCaptionControls,
  fetchCaptionStylesCatalog,
  fetchCaptionsCatalog,
  fetchCaptionsCdnBaseManifest,
  flattenCatalog,
  hashArrayBuffer,
  pickProjectFile,
  resolveControlsUrl,
  resolveMediaUrl,
  CAPTIONS_CDN_VERSION_FOLDER,
} from "./api";
export type { CaptionDownloadResult } from "./api";
export {
  loadCdnBaseManifest,
  loadLocalPackage,
  loadLocalState,
  removeLocalPackage,
  removeUserPreset,
  saveCdnBaseManifest,
  saveLocalPackage,
  saveLocalState,
  upsertUserPreset,
} from "./localStore";
export { getCdnBaseManifestPath, getStylePackageDir, getStylesDir, getStylesRoot, styleIdToDirName } from "./paths";
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
