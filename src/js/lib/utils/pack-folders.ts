/**
 * Pack sibling folders (Market composer layout):
 *   Assets   — projects + media (.prproj / .aep / footage under `_Assets`)
 *   Previews — UI grid posters / clips
 *   Fonts    — fonts installed on pack install
 */
import { fs, path } from "../cep/node";
import { BRAND } from "@brands";

export type HostAppId = "PPRO" | "AEFT";

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function";
}

/**
 * Templates / media root (projects live here; offline media under `_Assets/`).
 */
export function resolvePackTemplatesPath(
  packFilePath: string,
  hostAppId: HostAppId,
): string {
  if (typeof path?.dirname !== "function" || typeof path?.join !== "function") {
    return "";
  }
  const root = path.dirname(packFilePath);
  const modern = path.join(root, "Assets");
  if (BRAND.id === "odin" && cepFsAvailable() && !fs.existsSync(modern)) {
    return path.join(root, hostAppId === "AEFT" ? "Odin Pro After Effects" : "Odin Pro Premiere Pro");
  }
  return modern;
}

/** Preview-media folder for the footage grid. */
export function resolvePackPreviewsPath(packFilePath: string): string {
  if (typeof path?.dirname !== "function" || typeof path?.join !== "function") {
    return "";
  }
  const root = path.dirname(packFilePath);
  const modern = path.join(root, "Previews");
  if (BRAND.id === "odin" && cepFsAvailable() && !fs.existsSync(modern)) return path.join(root, "Odin Pro Preview Assets");
  return modern;
}

/** Fonts folder installed into the OS on pack install. */
export function resolvePackFontsPath(packFilePath: string): string | null {
  if (typeof path?.dirname !== "function" || typeof path?.join !== "function") {
    return null;
  }
  const fontsDir = path.join(path.dirname(packFilePath), "Fonts");
  if (cepFsAvailable() && fs.existsSync(fontsDir)) return fontsDir;
  const legacy = path.join(path.dirname(packFilePath), "Odin Pro Fonts");
  if (BRAND.id === "odin" && cepFsAvailable() && fs.existsSync(legacy)) return legacy;
  return null;
}

/**
 * Offline-media folder used to relink imported .prproj clips.
 * Prefer `{templatesDir}/_Assets/{custom_assets_folder|lastGroup}` when it exists;
 * otherwise fall back to `{templatesDir}/_Assets` so JSX can search by basename.
 */
export function resolveFullProjectAssetsPath(
  templatesDir: string,
  item: { group: { custom_assets_folder?: string }; pathSegments: string[] },
): string {
  const folder =
    (typeof item.group.custom_assets_folder === "string" &&
      item.group.custom_assets_folder) ||
    item.pathSegments[item.pathSegments.length - 1] ||
    "";
  const assetsRoot = path.join(templatesDir, "_Assets");
  if (folder) {
    const specific = path.join(assetsRoot, folder);
    if (cepFsAvailable() && fs.existsSync(specific)) return specific;
  }
  if (cepFsAvailable() && fs.existsSync(assetsRoot)) return assetsRoot;
  return folder ? path.join(assetsRoot, folder) : assetsRoot;
}
