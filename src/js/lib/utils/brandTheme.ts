import { activeBrandId, DEFAULT_BRAND, type BrandId } from "@brands";

/** Build-time brand from Vite define (`APP_BRAND` / `brands.config.ts`). */
export const BUILD_BRAND: BrandId = activeBrandId();

export const canSwitchBrandAtRuntime = false;

export function getActiveBrand(): BrandId {
  return BUILD_BRAND;
}

export function applyBrand(brand: BrandId): void {
  document.documentElement.dataset.brand = brand;
}

export function initBrandTheme(): BrandId {
  const brand = getActiveBrand();
  applyBrand(brand);
  return brand;
}

export { DEFAULT_BRAND };
export type { BrandId };
