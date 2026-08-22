import {
  buildFontCatalogAsync,
  canPreviewFamily,
  cssFontFamily,
  pickFaceForFamily,
  type FontCatalog,
  type FontFace,
  findFaceInCatalog,
  fallbackFaceFromId,
  mergeFontCatalogs,
} from "./font-catalog";

export type { FontCatalog, FontFace };
export { canPreviewFamily, cssFontFamily, pickFaceForFamily };

let cached: FontCatalog | null = null;
let pending: Promise<FontCatalog> | null = null;
let systemScanStarted = false;
const listeners = new Set<(catalog: FontCatalog) => void>();

const emitCatalog = (next: FontCatalog) => {
  cached = next;
  listeners.forEach((cb) => {
    try {
      cb(next);
    } catch {
      /* picker unmounted */
    }
  });
};

const scanSystemFonts = (base: FontCatalog) => {
  if (systemScanStarted) return;
  systemScanStarted = true;
  void buildFontCatalogAsync("system")
    .then((extra) => {
      if (!extra.byId.size) return;
      emitCatalog(mergeFontCatalogs(base, extra));
    })
    .catch(() => {
      /* keep the quick catalog */
    });
};

/** Cached OS font catalog (family + style + PostScript id). */
export function getFontCatalog(): Promise<FontCatalog> {
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
        const empty: FontCatalog = { families: [], byId: new Map() };
        emitCatalog(empty);
        return empty;
      });
  }
  return pending;
}

/** Live updates when the background System Fonts pass finishes. */
export function subscribeFontCatalog(cb: (catalog: FontCatalog) => void): () => void {
  listeners.add(cb);
  if (cached) cb(cached);
  return () => {
    listeners.delete(cb);
  };
}

export function resolveFontFace(catalog: FontCatalog | null, id: string): FontFace {
  if (!id.trim()) return { id: "", family: "", style: "Regular" };
  if (catalog) {
    const hit = findFaceInCatalog(catalog, id);
    if (hit) return hit;
  }
  return fallbackFaceFromId(id);
}
