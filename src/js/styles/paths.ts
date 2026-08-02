import { fs, os, path } from "../lib/cep/node";

const isCep = () => typeof window !== "undefined" && typeof (window as Window & { cep?: unknown }).cep !== "undefined";

/** Корень: %APPDATA%/spunkram-library (Win) или ~/Library/Application Support/spunkram-library (Mac). */
export const getStylesRoot = (): string | null => {
  if (!isCep() || !os.homedir || !path.join) return null;
  try {
    const platform = os.platform();
    const base =
      platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : processEnvAppData() || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "spunkram-library");
  } catch {
    return null;
  }
};

const processEnvAppData = (): string => {
  try {
    return (window as Window & { cep_node?: { process?: { env?: Record<string, string> } } }).cep_node?.process?.env
      ?.APPDATA || "";
  } catch {
    return "";
  }
};

export const getStylesDir = (): string | null => {
  const root = getStylesRoot();
  return root ? path.join(root, "styles") : null;
};

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

export const getLocalStatePath = (): string | null => {
  const root = getStylesRoot();
  return root ? path.join(root, "styles-state.json") : null;
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
