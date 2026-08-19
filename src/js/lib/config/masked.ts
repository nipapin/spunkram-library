/**
 * @deprecated Import from `@/lib/config/brand` (`BRAND`) instead.
 * Kept for gradual migration of older imports.
 */
export {
  BRAND,
  BRAND as MASKED,
  PACKAGE_FILE_EXTENSIONS,
  storageKey,
  preferencesJsonPath,
  panelUserDataDir,
  packExtensionLabel,
} from "./brand";

/** Re-export for callers that imported version from masked — single source: package.json via cep.config */
export { version as EXTENSION_VERSION } from "../../../shared/shared";
