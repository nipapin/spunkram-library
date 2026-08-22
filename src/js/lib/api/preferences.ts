import { fs, os, path } from "@/lib/cep/node";
import { BRAND } from "@brands";

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
  packSortFavorited: number;
  packSortByNames: number;
  packSortApp: string;
  autofillValues: { email: string };
};

/** Motionflow CEP session (browser device-code login). */
export type MotionflowAuth = {
  token?: string;
  id?: string;
  email?: string;
  name?: string;
};

/** One saved Motionflow account (multi-account vault). */
export type MotionflowAccountSession = {
  id: string;
  email: string;
  name?: string;
  token: string;
  lastUsedAt: string;
};

export const MAX_MOTIONFLOW_ACCOUNTS = 5;

export type PreferencesFile = {
  packages?: unknown[];
  /** Legacy / alternate casing seen in some installs. */
  Packages?: unknown[];
  PrefSettings?: Partial<PrefSettings>;
  motionflowAuth?: MotionflowAuth;
  motionflowAccounts?: MotionflowAccountSession[];
  motionflowActiveAccountId?: string;
  [key: string]: unknown;
};

export type AccountVault = {
  accounts: MotionflowAccountSession[];
  activeId: string | null;
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
  packSortFavorited: 0,
  packSortByNames: 0,
  packSortApp: "none",
  autofillValues: { email: "" },
};

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function" && typeof fs?.readFileSync === "function";
}

function roamingAppDataDir(): string {
  if (typeof os?.homedir !== "function" || typeof path?.join !== "function") return "";
  return os.platform() === "win32"
    ? path.join(os.homedir(), "AppData", "Roaming")
    : path.join(os.homedir(), "Library", "Application Support");
}

export function preferencesJsonPath(): string {
  const base = roamingAppDataDir();
  if (!base) return "";
  return path.join(base, BRAND.prefsCompany, BRAND.prefsProduct, "preferences.json");
}

/** Prefer an existing prefs file; fall back to primary Motionflow path. */
export function resolvePreferencesPath(): string {
  const prefPath = preferencesJsonPath();
  if (prefPath && cepFsAvailable() && fs.existsSync(prefPath)) return prefPath;
  if (prefPath) return prefPath;
  return "";
}

export function loadPreferencesFile(): PreferencesFile {
  const prefPath = resolvePreferencesPath();
  if (!prefPath || !cepFsAvailable() || !fs.existsSync(prefPath)) {
    return {
      packages: [],
      PrefSettings: { ...DEFAULT_PREF_SETTINGS },
      motionflowAuth: {},
      motionflowAccounts: [],
    };
  }
  try {
    const raw = fs.readFileSync(prefPath, { encoding: "utf8" }).toString();
    return JSON.parse(raw) as PreferencesFile;
  } catch {
    return {
      packages: [],
      PrefSettings: { ...DEFAULT_PREF_SETTINGS },
      motionflowAuth: {},
      motionflowAccounts: [],
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

/**
 * Wipe preferences.json (Beta `clearPrefJSON_File`). Next load rebuilds defaults.
 */
export function clearPreferencesFile(): boolean {
  const prefPath = resolvePreferencesPath();
  if (!prefPath || typeof fs?.writeFileSync !== "function") return false;
  try {
    const dir = path.dirname(prefPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(prefPath, "", { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

/** Clear installed pack list (`packages` / `Packages`) in preferences.json. */
export function clearInstalledPackagesInPreferences(): boolean {
  const file = loadPreferencesFile();
  file.packages = [];
  if ("Packages" in file) file.Packages = [];
  return savePreferencesFile(file);
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

export function readMotionflowAuth(): MotionflowAuth {
  const file = loadPreferencesFile();
  return file.motionflowAuth ?? {};
}

export function writeMotionflowAuth(auth: MotionflowAuth): boolean {
  const file = loadPreferencesFile();
  file.motionflowAuth = auth;
  return savePreferencesFile(file);
}

function normalizeAccount(
  raw: Partial<MotionflowAccountSession> | null | undefined,
): MotionflowAccountSession | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim() : "";
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (!id || !email || !token) return null;
  return {
    id,
    email,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : undefined,
    token,
    lastUsedAt:
      typeof raw.lastUsedAt === "string" && raw.lastUsedAt
        ? raw.lastUsedAt
        : new Date().toISOString(),
  };
}

/** Migrate legacy single `motionflowAuth` into the multi-account vault when empty. */
function migrateVaultIfNeeded(file: PreferencesFile): PreferencesFile {
  const existing = Array.isArray(file.motionflowAccounts) ? file.motionflowAccounts : [];
  const normalized = existing
    .map((a) => normalizeAccount(a))
    .filter((a): a is MotionflowAccountSession => Boolean(a));

  if (normalized.length > 0) {
    file.motionflowAccounts = normalized;
    if (!file.motionflowActiveAccountId) {
      const preferredId = file.motionflowAuth?.id;
      const active = preferredId
        ? normalized.find((a) => a.id === preferredId)
        : undefined;
      file.motionflowActiveAccountId = active?.id ?? normalized[0].id;
    }
    return file;
  }

  const legacy = file.motionflowAuth;
  if (legacy?.token && legacy.id && legacy.email) {
    const seeded: MotionflowAccountSession = {
      id: String(legacy.id),
      email: legacy.email,
      name: legacy.name,
      token: legacy.token,
      lastUsedAt: new Date().toISOString(),
    };
    file.motionflowAccounts = [seeded];
    file.motionflowActiveAccountId = seeded.id;
    savePreferencesFile(file);
  } else {
    file.motionflowAccounts = [];
  }
  return file;
}

export function readAccountVault(): AccountVault {
  const file = migrateVaultIfNeeded(loadPreferencesFile());
  const accounts = (file.motionflowAccounts ?? [])
    .map((a) => normalizeAccount(a))
    .filter((a): a is MotionflowAccountSession => Boolean(a));
  const activeId =
    typeof file.motionflowActiveAccountId === "string" &&
    accounts.some((a) => a.id === file.motionflowActiveAccountId)
      ? file.motionflowActiveAccountId
      : (accounts[0]?.id ?? null);
  return { accounts, activeId };
}

export function listAccountSessions(): MotionflowAccountSession[] {
  const { accounts } = readAccountVault();
  return [...accounts].sort((a, b) => {
    const ta = Date.parse(a.lastUsedAt) || 0;
    const tb = Date.parse(b.lastUsedAt) || 0;
    return tb - ta;
  });
}

export function upsertAccountSession(
  session: Omit<MotionflowAccountSession, "lastUsedAt"> & { lastUsedAt?: string },
): AccountVault {
  const file = migrateVaultIfNeeded(loadPreferencesFile());
  let accounts = (file.motionflowAccounts ?? [])
    .map((a) => normalizeAccount(a))
    .filter((a): a is MotionflowAccountSession => Boolean(a));

  const next: MotionflowAccountSession = {
    id: String(session.id).trim(),
    email: session.email.trim(),
    name: session.name?.trim() || undefined,
    token: session.token.trim(),
    lastUsedAt: session.lastUsedAt || new Date().toISOString(),
  };

  const idx = accounts.findIndex((a) => a.id === next.id);
  if (idx >= 0) {
    accounts[idx] = next;
  } else {
    accounts = [next, ...accounts];
    if (accounts.length > MAX_MOTIONFLOW_ACCOUNTS) {
      accounts = [...accounts]
        .sort((a, b) => (Date.parse(b.lastUsedAt) || 0) - (Date.parse(a.lastUsedAt) || 0))
        .slice(0, MAX_MOTIONFLOW_ACCOUNTS);
    }
  }

  file.motionflowAccounts = accounts;
  file.motionflowActiveAccountId = next.id;
  file.motionflowAuth = {
    token: next.token,
    id: next.id,
    email: next.email,
    name: next.name,
  };
  savePreferencesFile(file);
  return { accounts, activeId: next.id };
}

export function setActiveAccount(id: string): MotionflowAccountSession | null {
  const file = migrateVaultIfNeeded(loadPreferencesFile());
  const accounts = (file.motionflowAccounts ?? [])
    .map((a) => normalizeAccount(a))
    .filter((a): a is MotionflowAccountSession => Boolean(a));
  const hit = accounts.find((a) => a.id === id);
  if (!hit) return null;

  const updated: MotionflowAccountSession = {
    ...hit,
    lastUsedAt: new Date().toISOString(),
  };
  file.motionflowAccounts = accounts.map((a) => (a.id === id ? updated : a));
  file.motionflowActiveAccountId = id;
  file.motionflowAuth = {
    token: updated.token,
    id: updated.id,
    email: updated.email,
    name: updated.name,
  };
  savePreferencesFile(file);
  return updated;
}

export function removeAccountSession(id: string): AccountVault {
  const file = migrateVaultIfNeeded(loadPreferencesFile());
  const accounts = (file.motionflowAccounts ?? [])
    .map((a) => normalizeAccount(a))
    .filter((a): a is MotionflowAccountSession => Boolean(a))
    .filter((a) => a.id !== id);

  const wasActive = file.motionflowActiveAccountId === id;
  file.motionflowAccounts = accounts;

  if (wasActive || !accounts.some((a) => a.id === file.motionflowActiveAccountId)) {
    const next = [...accounts].sort(
      (a, b) => (Date.parse(b.lastUsedAt) || 0) - (Date.parse(a.lastUsedAt) || 0),
    )[0];
    if (next) {
      file.motionflowActiveAccountId = next.id;
      file.motionflowAuth = {
        token: next.token,
        id: next.id,
        email: next.email,
        name: next.name,
      };
    } else {
      file.motionflowActiveAccountId = undefined;
      file.motionflowAuth = {};
    }
  }

  savePreferencesFile(file);
  return {
    accounts,
    activeId: file.motionflowActiveAccountId ?? null,
  };
}

export function asBool(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}
