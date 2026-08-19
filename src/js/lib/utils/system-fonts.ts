import {
  buildFontCatalog,
  type FontCatalog,
  type FontFace,
  findFaceInCatalog,
  fallbackFaceFromId,
} from "./font-catalog";

export type { FontCatalog, FontFace };

let cached: FontCatalog | null = null;
let pending: Promise<FontCatalog> | null = null;

/** Cached OS font catalog (family + style + PostScript id). */
export function getFontCatalog(): Promise<FontCatalog> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = Promise.resolve().then(() => {
      cached = buildFontCatalog();
      return cached;
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
