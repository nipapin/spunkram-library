import { os, path } from "@/lib/cep/node";
import { BRAND } from "./brand-core";

export {
  BRAND,
  PACKAGE_FILE_EXTENSIONS,
  packExtensionLabel,
  storageKey,
  type PackFileExtension,
} from "./brand-core";

/** `%AppData%/Motionflow/Motionflow Extension/preferences.json` */
export function preferencesJsonPath(): string {
  const base = roamingBase();
  if (!base) return "";
  return path.join(base, BRAND.prefsCompany, BRAND.prefsProduct, "preferences.json");
}

/** Directory for `panel-store.json` persistence. */
export function panelUserDataDir(): string {
  const base = roamingBase();
  if (!base) return "";
  return path.join(base, BRAND.panelCompany, BRAND.panelProduct);
}

function roamingBase(): string {
  if (typeof os?.homedir !== "function" || typeof path?.join !== "function") {
    return "";
  }
  return os.platform() === "win32"
    ? path.join(os.homedir(), "AppData", "Roaming")
    : path.join(os.homedir(), "Library", "Application Support");
}
