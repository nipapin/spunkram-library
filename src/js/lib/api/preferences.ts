import { fs, os, path } from "@/lib/cep/node";
import { getPreferencesCandidates } from "@/lib/utils/pack";

export type PrefSettings = {
  portablePackageInstallation: number;
  askInstallationMethodEachTime: number;
  askDirectPackageInstallLocationEachTime: number;
  useCustomPathBySubscription: number | boolean;
  absCustomAbsolutePath: string | null;
  useCustomPathByDirectPackages: number;
  absDirectPackagesAbsolutePath: string | null;
  useCustomPathForAssets: number | boolean;
  customStockLocation: string | null;
  useCurrentProjectLocation: number | boolean;
  audioVisualization: number;
  useSystemFonts: number | boolean;
  useGPUSupports: number;
  useContinueAnyway: number;
  defaultApiServer: number;
  packSortFavorited: number;
  packSortByNames: number;
  packSortApp: string;
  autofillValues: { email: string };
};

/** Legacy AtomX marketplace auth (kept for market catalog compatibility). */
export type PersonalAuth = {
  usid?: string;
  email?: string;
};

/** Motionflow CEP session (browser device-code login). */
export type MotionflowAuth = {
  token?: string;
  id?: string;
  email?: string;
  name?: string;
};

export type PreferencesFile = {
  packages?: unknown[];
  PrefSettings?: Partial<PrefSettings>;
  personalAuthSystem?: PersonalAuth;
  motionflowAuth?: MotionflowAuth;
  [key: string]: unknown;
};

export const DEFAULT_PREF_SETTINGS: PrefSettings = {
  portablePackageInstallation: 0,
  askInstallationMethodEachTime: 1,
  askDirectPackageInstallLocationEachTime: 1,
  useCustomPathBySubscription: 0,
  absCustomAbsolutePath: null,
  useCustomPathByDirectPackages: 0,
  absDirectPackagesAbsolutePath: null,
  useCustomPathForAssets: 0,
  customStockLocation: null,
  useCurrentProjectLocation: 0,
  audioVisualization: 2,
  useSystemFonts: 0,
  useGPUSupports: 1,
  useContinueAnyway: 1,
  defaultApiServer: 0,
  packSortFavorited: 0,
  packSortByNames: 0,
  packSortApp: "none",
  autofillValues: { email: "" },
};

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function" && typeof fs?.readFileSync === "function";
}

/** Prefer an existing prefs file; fall back to primary Spunkram path. */
export function resolvePreferencesPath(): string {
  const candidates = getPreferencesCandidates();
  for (const prefPath of candidates) {
    if (cepFsAvailable() && fs.existsSync(prefPath)) return prefPath;
  }
  if (candidates[0]) return candidates[0];
  if (typeof os?.homedir !== "function" || typeof path?.join !== "function") {
    return "";
  }
  const roaming =
    os.platform() === "win32"
      ? path.join(os.homedir(), "AppData", "Roaming")
      : path.join(os.homedir(), "Library", "Application Support");
  return path.join(roaming, "Spunkram", "Spunkram Extension", "preferences.json");
}

export function loadPreferencesFile(): PreferencesFile {
  const prefPath = resolvePreferencesPath();
  if (!prefPath || !cepFsAvailable() || !fs.existsSync(prefPath)) {
    return {
      packages: [],
      PrefSettings: { ...DEFAULT_PREF_SETTINGS },
      personalAuthSystem: {},
      motionflowAuth: {},
    };
  }
  try {
    const raw = fs.readFileSync(prefPath, { encoding: "utf8" }).toString();
    return JSON.parse(raw) as PreferencesFile;
  } catch {
    return {
      packages: [],
      PrefSettings: { ...DEFAULT_PREF_SETTINGS },
      personalAuthSystem: {},
      motionflowAuth: {},
    };
  }
}

export function savePreferencesFile(data: PreferencesFile): boolean {
  const prefPath = resolvePreferencesPath();
  if (!prefPath || typeof fs?.writeFileSync !== "function") return false;
  try {
    const dir = path.dirname(prefPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(prefPath, JSON.stringify(data, null, 2), { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

export function readPrefSettings(): PrefSettings {
  const file = loadPreferencesFile();
  return {
    ...DEFAULT_PREF_SETTINGS,
    ...file.PrefSettings,
    autofillValues: {
      ...DEFAULT_PREF_SETTINGS.autofillValues,
      ...file.PrefSettings?.autofillValues,
    },
  };
}

export function writePrefSettings(settings: PrefSettings): boolean {
  const file = loadPreferencesFile();
  file.PrefSettings = settings;
  return savePreferencesFile(file);
}

export function readPersonalAuth(): PersonalAuth {
  const file = loadPreferencesFile();
  return file.personalAuthSystem ?? {};
}

export function writePersonalAuth(auth: PersonalAuth): boolean {
  const file = loadPreferencesFile();
  file.personalAuthSystem = auth;
  return savePreferencesFile(file);
}

export function readMotionflowAuth(): MotionflowAuth {
  const file = loadPreferencesFile();
  return file.motionflowAuth ?? {};
}

export function writeMotionflowAuth(auth: MotionflowAuth): boolean {
  const file = loadPreferencesFile();
  file.motionflowAuth = auth;
  return savePreferencesFile(file);
}

export function asBool(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}
