/** Re-export for callers that imported version from masked — single source: package.json via cep.config */
export { version as EXTENSION_VERSION } from "../../../shared/shared";

/** Spunkram brand / public client identity. Author DB ids stay on the backend. */
export const MASKED = {
  name: "Spunkram",
  filetype: "spunkram",
  /** Device-auth client id — backend maps this to the Spunkram author. */
  client: "spunkram-cep",
  settings: {
    marketSubscriptionService: true,
    activateRegularPackBeforeInstall: true,
    directDownloadDemoPacks: true,
    marketplaceOptions: {
      hideSortTags: true,
    },
  },
} as const;
