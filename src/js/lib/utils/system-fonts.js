import { buildFontCatalogAsync, canPreviewFamily, cssFontFamily, pickFaceForFamily, findFaceInCatalog, fallbackFaceFromId, mergeFontCatalogs, } from "./font-catalog";
export { canPreviewFamily, cssFontFamily, pickFaceForFamily };
let cached = null;
let pending = null;
let systemScanStarted = false;
const listeners = new Set();
const emitCatalog = (next) => {
    cached = next;
    listeners.forEach((cb) => {
        try {
            cb(next);
        }
        catch {
            /* picker unmounted */
        }
    });
};
const scanSystemFonts = (base) => {
    if (systemScanStarted)
        return;
    systemScanStarted = true;
    void buildFontCatalogAsync("system")
        .then((extra) => {
        if (!extra.byId.size)
            return;
        emitCatalog(mergeFontCatalogs(base, extra));
    })
        .catch(() => {
        /* keep the quick catalog */
    });
};
/** Drop the cached catalog after new font files are installed. */
export function invalidateFontCatalog() {
    cached = null;
    pending = null;
    systemScanStarted = false;
}
/** Cached OS font catalog (family + style + PostScript id). */
export function getFontCatalog() {
    if (cached) {
        scanSystemFonts(cached);
        return Promise.resolve(cached);
    }
    if (!pending) {
        pending = buildFontCatalogAsync("quick")
            .then((next) => {
            emitCatalog(next);
            scanSystemFonts(next);
            return next;
        })
            .catch(() => {
            pending = null;
            const empty = { families: [], byId: new Map() };
            emitCatalog(empty);
            return empty;
        });
    }
    return pending;
}
/** Live updates when the background System Fonts pass finishes. */
export function subscribeFontCatalog(cb) {
    listeners.add(cb);
    if (cached)
        cb(cached);
    return () => {
        listeners.delete(cb);
    };
}
export function resolveFontFace(catalog, id) {
    if (!id.trim())
        return { id: "", family: "", style: "Regular" };
    if (catalog) {
        const hit = findFaceInCatalog(catalog, id);
        if (hit)
            return hit;
    }
    return fallbackFaceFromId(id);
}
