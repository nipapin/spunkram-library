import { cepProcessEnv, fs, os, path } from "../lib/cep/node";
import { BRAND } from "@brands";

const isCep = () => typeof window !== "undefined" && typeof (window as Window & { cep?: unknown }).cep !== "undefined";

/** Корень: %APPDATA%/{brand} (Win) или ~/Library/Application Support/{brand} (Mac). */
export const getStylesRoot = (): string | null => {
  if (!isCep() || !os.homedir || !path.join) return null;
  try {
    const platform = os.platform();
    const base =
      platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : cepProcessEnv().APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, BRAND.appDataFolder);
  } catch {
    return null;
  }
};

export const getStylesDir = (): string | null => {
  const root = getStylesRoot();
  return root ? path.join(root, "styles") : null;
};

/**
 * Shared host template id — one `master.aep` / `master.mogrt` for all presets.
 * POST /api/captions `{ id: "master", file: "aep"|"mogrt" }`.
 */
export const MASTER_STYLE_ID = "master";
export const MASTER_AEP_FILE = "master.aep";
export const MASTER_MOGRT_FILE = "master.mogrt";

/**
 * id с сервера: `Category/Caption Folder`.
 * На диске `/` недопустим как имя — заменяем на `__`.
 */
export const styleIdToDirName = (styleId: string): string =>
  styleId.replace(/[<>:"|?*\\/]/g, "__");

export const getStylePackageDir = (styleId: string): string | null => {
  const dir = getStylesDir();
  return dir ? path.join(dir, styleIdToDirName(styleId)) : null;
};

/** AppData/styles/master/ — shared aep/mogrt cache. */
export const getMasterPackageDir = (): string | null => getStylePackageDir(MASTER_STYLE_ID);

export const getLocalStatePath = (): string | null => {
  const root = getStylesRoot();
  return root ? path.join(root, "styles-state.json") : null;
};

/** Локальная копия CDN `{Brand} Captions/Base/manifest.json`. */
export const getCdnBaseManifestPath = (): string | null => {
  const root = getStylesRoot();
  return root ? path.join(root, "captions-base-manifest.json") : null;
};

export const ensureDir = (dir: string): boolean => {
  if (!isCep() || !fs.existsSync || !fs.mkdirSync) return false;
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
};
