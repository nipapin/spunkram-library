import brandBuild from "./brand-build.json";
export const BRANDS = {
    odin: {
        id: "odin",
        extensionId: "com.odinpro.cep",
        displayName: "Odin Pro",
        panelDisplayName: "Odin Pro",
        ...brandBuild.odin,
        panelMainPath: "./odin/index.html",
        authorName: "Premiere Basics",
        apiClient: "odin-cep",
        sitePath: "/",
        siteOrigin: "https://odin-pro.com",
        tutorialsUrl: "",
        devPack: {
            path: "C:/Users/nipap/Downloads/Telegram Desktop/Odin Pro 1.2.0 - Premiere Pro Test Mode.odin",
            host: "PR",
        },
        packagePreviews: {
            AE: "https://api.get-atomx.com/atomx_files/ext_market/packages/560.jpg",
            PR: "https://api.get-atomx.com/atomx_files/ext_market/packages/542.jpg",
        },
        apiOrigin: "https://odin-pro.com",
        verificationPath: "/cep/login",
        manageSubscriptionPath: "/account",
        features: { aiTools: false, footages: false, remoteNotifications: false, extensionUpdates: false, telemetry: false, remotePackPreview: false },
        packExtension: "odin",
        legacyPackExtension: "odin",
        prefsCompany: "Premiere Basics",
        prefsProduct: "Odin Pro Extension",
        panelCompany: "Premiere Basics",
        panelProduct: "Odin Pro",
        adobeCommonFolder: "Odin Pro",
        stylesBin: "Odin Pro Styles",
        captionsBin: "Odin Pro Captions",
        captionsCdnPrefix: "Odin Pro Captions",
        assetsBin: "Odin Pro Assets",
        storagePrefix: "odin.",
        appDataFolder: "odin-pro",
        access: {
            tiers: ["free", "subscribed"],
            packPurchasesGrantAccess: false,
            generations: { free: 0, purchased: 0, subscribed: 0 },
            freePackSlots: 0,
        },
    },
    gal: {
        features: { aiTools: true, footages: false, remoteNotifications: true, extensionUpdates: true, telemetry: true, remotePackPreview: true },
        id: "gal",
        extensionId: "com.premieregal.cep",
        displayName: "Gal Toolkit MAX",
        panelDisplayName: "Gal Toolkit MAX",
        version: brandBuild.gal.version,
        port: brandBuild.gal.port,
        servePort: brandBuild.gal.servePort,
        startingDebugPort: brandBuild.gal.startingDebugPort,
        panelMainPath: "./gal/index.html",
        authorName: "Premiere Gal",
        apiClient: "gal-cep",
        sitePath: "/premiere-gal",
        siteOrigin: "https://premieregal.motionflow.pro",
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
        features: { aiTools: true, footages: true, remoteNotifications: true, extensionUpdates: true, telemetry: true, remotePackPreview: true },
        id: "spunkram",
        extensionId: "com.spunkramlibrary.cep",
        displayName: "Spunkram Library",
        panelDisplayName: "Spunkram Library",
        version: brandBuild.spunkram.version,
        port: brandBuild.spunkram.port,
        servePort: brandBuild.spunkram.servePort,
        startingDebugPort: brandBuild.spunkram.startingDebugPort,
        panelMainPath: "./spunkram/index.html",
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
            // Subscribed fallback until `/me` sends a cap. Free accounts get no generations.
            generations: { free: 0, purchased: 0, subscribed: 100 },
            freePackSlots: 1,
        },
    },
};
export const DEFAULT_BRAND = "spunkram";
export function otherBrandIds(id = activeBrandId()) {
    return Object.keys(BRANDS).filter((brandId) => brandId !== id);
}
/** Folder under `dist/` for this brand's CEP output (`cep-spunkram`, `cep-gal`). */
export function brandCepDist(id = activeBrandId()) {
    return `cep-${id}`;
}
export function resolveBrand(raw) {
    return raw && Object.prototype.hasOwnProperty.call(BRANDS, raw) ? raw : DEFAULT_BRAND;
}
export function getBrand(raw) {
    return BRANDS[resolveBrand(raw)];
}
/** Active build brand (`APP_BRAND` / Vite `__APP_BRAND__`). */
export function activeBrandId() {
    return resolveBrand(typeof __APP_BRAND__ !== "undefined" ? __APP_BRAND__ : DEFAULT_BRAND);
}
export const BRAND = BRANDS[activeBrandId()];
export const PACKAGE_FILE_EXTENSIONS = [
    BRAND.packExtension,
    BRAND.legacyPackExtension,
];
export function storageKey(suffix) {
    return `${BRAND.storagePrefix}${suffix}`;
}
export function packExtensionLabel() {
    return `.${BRAND.packExtension}`;
}
const ACCESS_TIERS = ["free", "purchased", "subscribed"];
function asAccessTier(raw) {
    return ACCESS_TIERS.includes(raw) ? raw : null;
}
/** Map `/me` + subscription/purchases onto this author's tier set. */
export function resolveAccessTier(opts, brand = BRAND) {
    const allowed = new Set(brand.access.tiers);
    const fromServer = asAccessTier((opts.tier || "").toLowerCase());
    if (fromServer && allowed.has(fromServer))
        return fromServer;
    // Lifetime / toolkit purchase may arrive as `purchased` on an author without that tier.
    if (fromServer === "purchased" && allowed.has("subscribed"))
        return "subscribed";
    if (opts.subscribed && allowed.has("subscribed"))
        return "subscribed";
    if (brand.access.packPurchasesGrantAccess &&
        opts.purchaseCount > 0 &&
        allowed.has("purchased")) {
        return "purchased";
    }
    return "free";
}
/** Monthly AI cap. Accounts without a subscription get 0, even if `/me` still sends a free allotment. */
export function resolveGenerationLimit(serverLimit, accessTier = "free", brand = BRAND) {
    if (!brand.features.aiTools)
        return 0;
    if (accessTier !== "subscribed")
        return 0;
    if (typeof serverLimit === "number" && Number.isFinite(serverLimit) && serverLimit > 0) {
        return Math.floor(serverLimit);
    }
    const cap = brand.access.generations[accessTier];
    return cap > 0 ? cap : null;
}
/** Free pack slots: `/me` first (including 0), otherwise this author's default. */
export function resolveFreePackSlots(serverSlots, brand = BRAND) {
    if (typeof serverSlots === "number" && Number.isFinite(serverSlots) && serverSlots >= 0) {
        return Math.floor(serverSlots);
    }
    return brand.access.freePackSlots;
}
