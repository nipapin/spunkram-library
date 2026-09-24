import { activeBrandId, DEFAULT_BRAND } from "@brands";
/** Build-time brand from Vite define (`APP_BRAND` / `brands.config.ts`). */
export const BUILD_BRAND = activeBrandId();
export const canSwitchBrandAtRuntime = false;
export function getActiveBrand() {
    return BUILD_BRAND;
}
export function applyBrand(brand) {
    document.documentElement.dataset.brand = brand;
}
export function initBrandTheme() {
    const brand = getActiveBrand();
    applyBrand(brand);
    return brand;
}
export { DEFAULT_BRAND };
