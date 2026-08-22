import {
  buildFontCatalogAsync,
  canPreviewFamily,
  cssFontFamily,
  pickFaceForFamily,
  type FontCatalog,
  type FontFace,
  findFaceInCatalog,
  fallbackFaceFromId,
} from "./font-catalog";
import { asBool, readPrefSettings } from "../api/preferences";

export type { FontCatalog, FontFace };
export { canPreviewFamily, cssFontFamily, pickFaceForFamily };

let cached: FontCatalog | null = null;
let pending: Promise<FontCatalog> | null = null;

const EMPTY_CATALOG: FontCatalog = { families: [], byId: new Map() };

/** Cached OS font catalog (family + style + PostScript id). */
export function getFontCatalog(): Promise<FontCatalog> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    const prefs = readPrefSettings();
    if (!asBool(prefs.useSystemFonts)) {
      cached = EMPTY_CATALOG;
      return Promise.resolve(EMPTY_CATALOG);
    }
    pending = buildFontCatalogAsync()
      .then((next) => {
        cached = next;
        return next;
      })
      .catch(() => {
        pending = null;
        cached = EMPTY_CATALOG;
        return EMPTY_CATALOG;
      });
  }
  return pending;
}

export function resolveFontFace(catalog: FontCatalog | null, id: string): FontFace {
  if (!id.trim()) return { id: "", family: "", style: "Regular" };
  if (catalog) {
    const hit = findFaceInCatalog(catalog, id);
    if (hit) return hit;
  }
  return fallbackFaceFromId(id);
}
