/**
 * Motionflow product identity — constants safe for ExtendScript bundle (no CEP node).
 * Path helpers live in `brand.ts` (panel-only).
 */
export const BRAND = {
  name: "Spunkram",
  productName: "Spunkram Library",
  /** Primary pack file extension from Market composer */
  packExtension: "spunkram",
  /** Accepted until composer stops shipping `.spunkram` zips */
  legacyPackExtension: "spunkram",
  /** Device-auth client id sent to motionflow.pro (server contract) */
  apiClient: "spunkram-cep",
  /** `%AppData%/{prefsCompany}/{prefsProduct}/preferences.json` */
  prefsCompany: "Spunkram",
  prefsProduct: "Spunkram Library",
  /** Panel store: `{panelCompany}/{panelProduct}/panel-store.json` */
  panelCompany: "Spunkram",
  panelProduct: "Spunkram Library",
  /** `%USER_DATA%/Adobe/Common/{adobeCommonFolder}/` — native PTX seeds */
  adobeCommonFolder: "Spunkram",
  stylesBin: "Spunkram Styles",
  captionsBin: "Spunkram Captions",
  storagePrefix: "spunkram.",
} as const;

export const PACKAGE_FILE_EXTENSIONS = [
  BRAND.packExtension,
  BRAND.legacyPackExtension,
] as const;

export type PackFileExtension = (typeof PACKAGE_FILE_EXTENSIONS)[number];

/** Panel-store / localStorage key under {@link BRAND.storagePrefix}. */
export function storageKey(suffix: string): string {
  return `${BRAND.storagePrefix}${suffix}`;
}

/** Human label for pack files in UI messages. */
export function packExtensionLabel(): string {
  return `.${BRAND.packExtension}`;
}
