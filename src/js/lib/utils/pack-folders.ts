/**
 * Resolve pack sibling folders after Market composer simplified names:
 *   Assets   — projects + media (.prproj / .aep / footage under `_Assets`)
 *   Previews — UI grid posters / clips
 *   Fonts    — fonts installed on pack install
 *
 * Legacy fallbacks: Spunkram/Atom brand folders and older pack-name prefixes
 * (e.g. "Gal Toolkit Max Premiere Pro", "… Preview Assets", "… Fonts").
 */
import { fs, path } from "../cep/node";
import { MASKED } from "../config/masked";

export type HostAppId = "PPRO" | "AEFT";

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function" && typeof fs?.readdirSync === "function";
}

function firstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && cepFsAvailable() && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Directories next to the pack file whose name ends with `suffix` (case-sensitive). */
function findDirBySuffix(packDir: string, suffix: string): string | null {
  if (!cepFsAvailable() || !fs.existsSync(packDir)) return null;
  try {
    for (const entry of fs.readdirSync(packDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === suffix.replace(/^\s+/, "") || entry.name.endsWith(suffix)) {
        return path.join(packDir, entry.name);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Templates / media root (projects live here; offline media under `_Assets/`).
 * Prefer modern `Assets`, then brand folders, then `* Premiere Pro` / `* After Effects`.
 */
export function resolvePackTemplatesPath(
  packFilePath: string,
  hostAppId: HostAppId,
): string {
  if (typeof path?.dirname !== "function" || typeof path?.join !== "function") {
    return "";
  }
  const dir = path.dirname(packFilePath);
  const brand =
    hostAppId === "PPRO"
      ? `${MASKED.name} Premiere Pro`
      : `${MASKED.name} After Effects`;
  const atom = hostAppId === "PPRO" ? "Atom Premiere Pro" : "Atom After Effects";
  const suffix = hostAppId === "PPRO" ? " Premiere Pro" : " After Effects";

  const found = firstExisting([
    path.join(dir, "Assets"),
    path.join(dir, brand),
    path.join(dir, atom),
  ]);
  if (found) return found;

  const bySuffix = findDirBySuffix(dir, suffix);
  if (bySuffix) return bySuffix;

  return path.join(dir, "Assets");
}

/**
 * Preview-media folder for the footage grid.
 * Prefer `Previews`, then brand / Atom / `* Preview Assets`.
 */
export function resolvePackPreviewsPath(packFilePath: string): string {
  if (typeof path?.dirname !== "function" || typeof path?.join !== "function") {
    return "";
  }
  const dir = path.dirname(packFilePath);
  const found = firstExisting([
    path.join(dir, "Previews"),
    path.join(dir, `${MASKED.name} Preview Assets`),
    path.join(dir, "Atom Preview Assets"),
  ]);
  if (found) return found;

  const bySuffix = findDirBySuffix(dir, " Preview Assets");
  if (bySuffix) return bySuffix;

  return path.join(dir, "Previews");
}

/**
 * Fonts folder installed into the OS on pack install.
 * Prefer `Fonts`, then `* Fonts`.
 */
export function resolvePackFontsPath(packFilePath: string): string | null {
  if (typeof path?.dirname !== "function" || typeof path?.join !== "function") {
    return null;
  }
  const dir = path.dirname(packFilePath);
  const found = firstExisting([path.join(dir, "Fonts")]);
  if (found) return found;
  return findDirBySuffix(dir, " Fonts");
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
