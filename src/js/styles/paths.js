import { cepProcessEnv, fs, os, path } from "../lib/cep/node";
import { BRAND } from "@brands";
const isCep = () => typeof window !== "undefined" && typeof window.cep !== "undefined";
/** Корень: %APPDATA%/{brand} (Win) или ~/Library/Application Support/{brand} (Mac). */
export const getStylesRoot = () => {
    if (!isCep() || !os.homedir || !path.join)
        return null;
    try {
        const platform = os.platform();
        const base = platform === "darwin"
            ? path.join(os.homedir(), "Library", "Application Support")
            : cepProcessEnv().APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        return path.join(base, BRAND.appDataFolder);
    }
    catch {
        return null;
    }
};
export const getStylesDir = () => {
    const root = getStylesRoot();
    return root ? path.join(root, "styles") : null;
};
/**
 * Catalog style id is `{Pack}/{Style}`. Pack name is the POST `/api/captions` id
 * and the stem of `{Brand} Captions/{Pack}/{Pack}.aep|mogrt`.
 */
export const packIdFromStyleId = (styleId) => {
    const parts = styleId.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..");
    return parts[0] || styleId.trim();
};
export const packProjectFileName = (packId, file) => `${packId}.${file}`;
/**
 * id с сервера: `Pack/Caption Folder`.
 * На диске `/` недопустим как имя — заменяем на `__`.
 */
export const styleIdToDirName = (styleId) => styleId.replace(/[<>:"|?*\\/]/g, "__");
export const getStylePackageDir = (styleId) => {
    const dir = getStylesDir();
    return dir ? path.join(dir, styleIdToDirName(styleId)) : null;
};
/** AppData/styles/{Pack}/ — cached `{Pack}.aep` / `{Pack}.mogrt`. */
export const getPackPackageDir = (packId) => getStylePackageDir(packId);
export const getLocalStatePath = () => {
    const root = getStylesRoot();
    return root ? path.join(root, "styles-state.json") : null;
};
/** AppData/user-styles/{id}/controls.json — Save as New dumps. */
export const getUserStylesDir = () => {
    const root = getStylesRoot();
    return root ? path.join(root, "user-styles") : null;
};
export const getUserStyleDir = (presetId) => {
    const dir = getUserStylesDir();
    if (!dir || !presetId)
        return null;
    return path.join(dir, styleIdToDirName(presetId));
};
export const getUserControlsPath = (presetId) => {
    const dir = getUserStyleDir(presetId);
    return dir ? path.join(dir, "controls.json") : null;
};
/** Локальная копия CDN `{Brand} Captions/Base/manifest.json`. */
export const getCdnBaseManifestPath = () => {
    const root = getStylesRoot();
    return root ? path.join(root, "captions-base-manifest.json") : null;
};
export const ensureDir = (dir) => {
    if (!isCep() || !fs.existsSync || !fs.mkdirSync)
        return false;
    try {
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        return true;
    }
    catch {
        return false;
    }
};
