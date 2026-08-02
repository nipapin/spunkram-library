export type BrandId = "gal" | "spunkram";

export type BrandConfig = {
  id: BrandId;
  extensionId: string;
  displayName: string;
  panelDisplayName: string;
  authorName: string;
};

export const BRANDS: Record<BrandId, BrandConfig> = {
  gal: {
    id: "gal",
    extensionId: "com.spunkramlibrary.cep",
    displayName: "Spunkram Library",
    panelDisplayName: "Spunkram Library",
    authorName: "Gal",
  },
  spunkram: {
    id: "spunkram",
    extensionId: "com.spunkramlibrary.cep",
    displayName: "Spunkram Library",
    panelDisplayName: "Spunkram Library",
    authorName: "Spunkram",
  },
};

export const DEFAULT_BRAND: BrandId = "spunkram";

export function resolveBrand(raw?: string | null): BrandId {
  return raw === "gal" ? "gal" : DEFAULT_BRAND;
}

export function getBrand(raw?: string | null): BrandConfig {
  return BRANDS[resolveBrand(raw)];
}
