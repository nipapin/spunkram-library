import {
  DEFAULT_BRAND,
  resolveBrand,
  type BrandId,
} from "../../../../brands.config";

declare const __APP_BRAND__: string | undefined;

/** Build-time brand from Vite define — Spunkram Library is always spunkram. */
export const BUILD_BRAND: BrandId = resolveBrand(
  typeof __APP_BRAND__ !== "undefined" ? __APP_BRAND__ : "spunkram",
);

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
