export type BrandId = "gal" | "spunkram";

/** Author access model. Server `/me.tier` must be one of these (or mappable). */
export type AccessTier = "free" | "purchased" | "subscribed";

export type BrandAccess = {
  /** Tiers this author uses, in rank order. */
  tiers: readonly AccessTier[];
  /**
   * Owning sold packs without a subscription → `purchased`.
   * Spunkram pack store: true. Gal Toolkit plans (monthly/yearly/lifetime): false.
   */
  packPurchasesGrantAccess: boolean;
  /**
   * Default AI caps by tier. `GET /api/cep/me` `entitlements.ai_generations_limit` wins.
   * `0` = this author does not expose that cap in the panel until the server sends one.
   */
  generations: Record<AccessTier, number>;
  /**
   * Default free pack slots. `/me` `entitlements.free_pack_slots` wins.
   * `0` = no slot system (Gal).
   */
  freePackSlots: number;
};

export type BrandConfig = {
  id: BrandId;
  extensionId: string;
  displayName: string;
  panelDisplayName: string;
  authorName: string;
  /** Device-auth / CEP API client — server maps this to author; never send author_id. */
  apiClient: string;
  /** Public path on motionflow.pro (login, subscribe, contact). */
  sitePath: string;
  packExtension: string;
  legacyPackExtension: string;
  prefsCompany: string;
  prefsProduct: string;
  panelCompany: string;
  panelProduct: string;
  adobeCommonFolder: string;
  stylesBin: string;
  captionsBin: string;
  captionsCdnPrefix: string;
  assetsBin: string;
  storagePrefix: string;
  /** `%APPDATA%/{appDataFolder}` — styles / captions cache */
  appDataFolder: string;
  access: BrandAccess;
};

export const BRANDS: Record<BrandId, BrandConfig> = {
  gal: {
    id: "gal",
    extensionId: "com.premieregal.cep",
    displayName: "Gal Toolkit MAX",
    panelDisplayName: "Gal Toolkit MAX",
    authorName: "Premiere Gal",
    apiClient: "gal-cep",
    sitePath: "/premiere-gal",
    packExtension: "gal",
    legacyPackExtension: "gal",
    prefsCompany: "Premiere Gal",
    prefsProduct: "Gal Toolkit MAX",
    panelCompany: "Premiere Gal",
    panelProduct: "Gal Toolkit MAX",
    adobeCommonFolder: "Gal",
    stylesBin: "Gal Styles",
    captionsBin: "Gal Captions",
    captionsCdnPrefix: "Gal Captions",
    assetsBin: "Gal Assets",
    storagePrefix: "gal.",
    appDataFolder: "gal-toolkit",
    access: {
      tiers: ["free", "subscribed"],
      packPurchasesGrantAccess: false,
      generations: { free: 0, purchased: 0, subscribed: 0 },
      freePackSlots: 0,
    },
  },
  spunkram: {
    id: "spunkram",
    extensionId: "com.spunkramlibrary.cep",
    displayName: "Spunkram Library",
    panelDisplayName: "Spunkram Library",
    authorName: "Spunkram",
    apiClient: "spunkram-cep",
    sitePath: "/spunkram",
    packExtension: "spunkram",
    legacyPackExtension: "spunkram",
    prefsCompany: "Spunkram",
    prefsProduct: "Spunkram Library",
    panelCompany: "Spunkram",
    panelProduct: "Spunkram Library",
    adobeCommonFolder: "Spunkram",
    stylesBin: "Spunkram Styles",
    captionsBin: "Spunkram Captions",
    captionsCdnPrefix: "Spunkram Captions",
    assetsBin: "Spunkram Assets",
    storagePrefix: "spunkram.",
    appDataFolder: "spunkram-library",
    access: {
      tiers: ["free", "purchased", "subscribed"],
      packPurchasesGrantAccess: true,
      // Mirrors next-app cep-client-registry `spunkram-cep` (Editor AI = 100).
      generations: { free: 5, purchased: 5, subscribed: 100 },
      freePackSlots: 1,
    },
  },
};

export const DEFAULT_BRAND: BrandId = "spunkram";

declare const __APP_BRAND__: string | undefined;

export function resolveBrand(raw?: string | null): BrandId {
  return raw === "gal" ? "gal" : DEFAULT_BRAND;
}

export function getBrand(raw?: string | null): BrandConfig {
  return BRANDS[resolveBrand(raw)];
}

/** Active build brand (`APP_BRAND` / Vite `__APP_BRAND__`). */
export function activeBrandId(): BrandId {
  return resolveBrand(
    typeof __APP_BRAND__ !== "undefined" ? __APP_BRAND__ : DEFAULT_BRAND,
  );
}

export const BRAND: BrandConfig = BRANDS[activeBrandId()];

export const PACKAGE_FILE_EXTENSIONS = [
  BRAND.packExtension,
  BRAND.legacyPackExtension,
] as const;

export type PackFileExtension = (typeof PACKAGE_FILE_EXTENSIONS)[number];

export function storageKey(suffix: string): string {
  return `${BRAND.storagePrefix}${suffix}`;
}

export function packExtensionLabel(): string {
  return `.${BRAND.packExtension}`;
}

const ACCESS_TIERS: readonly AccessTier[] = ["free", "purchased", "subscribed"];

function asAccessTier(raw: string): AccessTier | null {
  return ACCESS_TIERS.includes(raw as AccessTier) ? (raw as AccessTier) : null;
}

/** Map `/me` + subscription/purchases onto this author's tier set. */
export function resolveAccessTier(
  opts: {
    tier?: string | null;
    subscribed: boolean;
    purchaseCount: number;
  },
  brand: BrandConfig = BRAND,
): AccessTier {
  const allowed = new Set(brand.access.tiers);
  const fromServer = asAccessTier((opts.tier || "").toLowerCase());
  if (fromServer && allowed.has(fromServer)) return fromServer;
  // Lifetime / toolkit purchase may arrive as `purchased` on an author without that tier.
  if (fromServer === "purchased" && allowed.has("subscribed")) return "subscribed";
  if (opts.subscribed && allowed.has("subscribed")) return "subscribed";
  if (
    brand.access.packPurchasesGrantAccess &&
    opts.purchaseCount > 0 &&
    allowed.has("purchased")
  ) {
    return "purchased";
  }
  return "free";
}

/** Monthly AI cap: `/me` first, otherwise this author's default for the resolved tier. */
export function resolveGenerationLimit(
  serverLimit?: number | null,
  accessTier: AccessTier = "free",
  brand: BrandConfig = BRAND,
): number | null {
  if (typeof serverLimit === "number" && Number.isFinite(serverLimit) && serverLimit > 0) {
    return Math.floor(serverLimit);
  }
  const cap = brand.access.generations[accessTier];
  return cap > 0 ? cap : null;
}

/** Free pack slots: `/me` first (including 0), otherwise this author's default. */
export function resolveFreePackSlots(
  serverSlots?: number | null,
  brand: BrandConfig = BRAND,
): number {
  if (typeof serverSlots === "number" && Number.isFinite(serverSlots) && serverSlots >= 0) {
    return Math.floor(serverSlots);
  }
  return brand.access.freePackSlots;
}
