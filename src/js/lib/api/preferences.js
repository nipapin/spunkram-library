import { fs, os, path } from "@/lib/cep/node";
import { BRAND } from "@brands";
import { activeAuthFromParts, authVaultFingerprint, } from "@/lib/api/shared-auth-session";
export const MAX_MOTIONFLOW_ACCOUNTS = 5;
export const DEFAULT_PREF_SETTINGS = {
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
    useGPUSupports: 1,
    useContinueAnyway: 1,
    packSortFavorited: 0,
    packSortByNames: 0,
    packSortApp: "none",
    defaultApiServer: 0,
    useSystemFonts: 0,
    adminDevPlan: "",
    autofillValues: { email: "" },
};
function cepFsAvailable() {
    return typeof fs?.existsSync === "function" && typeof fs?.readFileSync === "function";
}
function roamingAppDataDir() {
    if (typeof os?.homedir !== "function" || typeof path?.join !== "function")
        return "";
    return os.platform() === "win32"
        ? path.join(os.homedir(), "AppData", "Roaming")
        : path.join(os.homedir(), "Library", "Application Support");
}
export function preferencesJsonPath() {
    const base = roamingAppDataDir();
    if (!base)
        return "";
    return path.join(base, BRAND.prefsCompany, BRAND.prefsProduct, "preferences.json");
}
/** Prefer an existing prefs file; fall back to primary Motionflow path. */
export function resolvePreferencesPath() {
    const prefPath = preferencesJsonPath();
    if (prefPath && cepFsAvailable() && fs.existsSync(prefPath))
        return prefPath;
    if (prefPath)
        return prefPath;
    return "";
}
function emptyPreferencesFile() {
    return {
        packages: [],
        PrefSettings: { ...DEFAULT_PREF_SETTINGS },
        motionflowAuth: {},
        motionflowAccounts: [],
    };
}
/** Last successful parse — a sibling host's partial write must not look like logout. */
let lastGoodPreferences = null;
function atomicWriteFile(filePath, contents) {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, contents, { encoding: "utf8" });
    try {
        fs.renameSync(tmp, filePath);
    }
    catch {
        fs.writeFileSync(filePath, contents, { encoding: "utf8" });
        try {
            fs.unlinkSync(tmp);
        }
        catch {
            /* ignore */
        }
    }
}
export function loadPreferencesFile() {
    const prefPath = resolvePreferencesPath();
    if (!prefPath || !cepFsAvailable() || !fs.existsSync(prefPath)) {
        return lastGoodPreferences ?? emptyPreferencesFile();
    }
    try {
        const raw = fs.readFileSync(prefPath, { encoding: "utf8" }).toString();
        if (!raw.trim()) {
            return lastGoodPreferences ?? emptyPreferencesFile();
        }
        const parsed = JSON.parse(raw);
        lastGoodPreferences = parsed;
        return parsed;
    }
    catch {
        return lastGoodPreferences ?? emptyPreferencesFile();
    }
}
export function savePreferencesFile(data) {
    const prefPath = resolvePreferencesPath();
    if (!prefPath || typeof fs?.writeFileSync !== "function")
        return false;
    try {
        const dir = path.dirname(prefPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        atomicWriteFile(prefPath, JSON.stringify(data, null, 2));
        lastGoodPreferences = data;
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Wipe preferences.json (Beta `clearPrefJSON_File`). Next load rebuilds defaults.
 */
export function clearPreferencesFile() {
    const prefPath = resolvePreferencesPath();
    if (!prefPath || typeof fs?.writeFileSync !== "function")
        return false;
    try {
        const dir = path.dirname(prefPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        lastGoodPreferences = emptyPreferencesFile();
        fs.writeFileSync(prefPath, "", { encoding: "utf8" });
        return true;
    }
    catch {
        return false;
    }
}
/** Clear installed pack list (`packages` / `Packages`) in preferences.json. */
export function clearInstalledPackagesInPreferences() {
    const file = loadPreferencesFile();
    file.packages = [];
    if ("Packages" in file)
        file.Packages = [];
    return savePreferencesFile(file);
}
export function readPrefSettings() {
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
export function writePrefSettings(settings) {
    const file = loadPreferencesFile();
    file.PrefSettings = settings;
    return savePreferencesFile(file);
}
export function readMotionflowAuth() {
    const file = loadPreferencesFile();
    return file.motionflowAuth ?? {};
}
/** Current session: `motionflowAuth`, or the active vault account if that field was cleared. */
export function readActiveMotionflowAuth() {
    return activeAuthFromParts(readMotionflowAuth(), readAccountVault());
}
export function writeMotionflowAuth(auth) {
    const file = loadPreferencesFile();
    file.motionflowAuth = auth;
    return savePreferencesFile(file);
}
function normalizeDeviceIds(raw) {
    if (!Array.isArray(raw))
        return undefined;
    const ids = [
        ...new Set(raw.flatMap((value) => {
            if (typeof value !== "string")
                return [];
            const id = value.trim();
            return id ? [id] : [];
        })),
    ];
    return ids.length ? ids : undefined;
}
function normalizeAccount(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const email = typeof raw.email === "string" ? raw.email.trim() : "";
    const token = typeof raw.token === "string" ? raw.token.trim() : "";
    if (!id || !email || !token)
        return null;
    const deviceIds = normalizeDeviceIds(raw.deviceIds);
    return {
        id,
        email,
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : undefined,
        token,
        lastUsedAt: typeof raw.lastUsedAt === "string" && raw.lastUsedAt
            ? raw.lastUsedAt
            : new Date().toISOString(),
        ...(deviceIds ? { deviceIds } : {}),
    };
}
/** Migrate legacy single `motionflowAuth` into the multi-account vault when empty. */
function migrateVaultIfNeeded(file) {
    const existing = Array.isArray(file.motionflowAccounts) ? file.motionflowAccounts : [];
    const normalized = existing
        .map((a) => normalizeAccount(a))
        .filter((a) => Boolean(a));
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
        const seeded = {
            id: String(legacy.id),
            email: legacy.email,
            name: legacy.name,
            token: legacy.token,
            lastUsedAt: new Date().toISOString(),
        };
        file.motionflowAccounts = [seeded];
        file.motionflowActiveAccountId = seeded.id;
        savePreferencesFile(file);
    }
    else {
        file.motionflowAccounts = [];
    }
    return file;
}
export function readAccountVault() {
    const file = migrateVaultIfNeeded(loadPreferencesFile());
    const accounts = (file.motionflowAccounts ?? [])
        .map((a) => normalizeAccount(a))
        .filter((a) => Boolean(a));
    const activeId = typeof file.motionflowActiveAccountId === "string" &&
        accounts.some((a) => a.id === file.motionflowActiveAccountId)
        ? file.motionflowActiveAccountId
        : (accounts[0]?.id ?? null);
    return { accounts, activeId };
}
export function listAccountSessions() {
    const { accounts } = readAccountVault();
    return [...accounts].sort((a, b) => {
        const ta = Date.parse(a.lastUsedAt) || 0;
        const tb = Date.parse(b.lastUsedAt) || 0;
        return tb - ta;
    });
}
export function upsertAccountSession(session) {
    const file = migrateVaultIfNeeded(loadPreferencesFile());
    let accounts = (file.motionflowAccounts ?? [])
        .map((a) => normalizeAccount(a))
        .filter((a) => Boolean(a));
    const idx = accounts.findIndex((a) => a.id === String(session.id).trim());
    const existing = idx >= 0 ? accounts[idx] : undefined;
    const deviceIds = session.deviceIds !== undefined
        ? normalizeDeviceIds(session.deviceIds)
        : existing?.deviceIds;
    const next = {
        id: String(session.id).trim(),
        email: session.email.trim(),
        name: session.name?.trim() || undefined,
        token: session.token.trim(),
        lastUsedAt: session.lastUsedAt || new Date().toISOString(),
        ...(deviceIds ? { deviceIds } : {}),
    };
    if (idx >= 0) {
        accounts[idx] = next;
    }
    else {
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
export function setActiveAccount(id) {
    const file = migrateVaultIfNeeded(loadPreferencesFile());
    const accounts = (file.motionflowAccounts ?? [])
        .map((a) => normalizeAccount(a))
        .filter((a) => Boolean(a));
    const hit = accounts.find((a) => a.id === id);
    if (!hit)
        return null;
    const updated = {
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
export function removeAccountSession(id) {
    const file = migrateVaultIfNeeded(loadPreferencesFile());
    const accounts = (file.motionflowAccounts ?? [])
        .map((a) => normalizeAccount(a))
        .filter((a) => Boolean(a))
        .filter((a) => a.id !== id);
    const wasActive = file.motionflowActiveAccountId === id;
    file.motionflowAccounts = accounts;
    if (wasActive || !accounts.some((a) => a.id === file.motionflowActiveAccountId)) {
        const next = [...accounts].sort((a, b) => (Date.parse(b.lastUsedAt) || 0) - (Date.parse(a.lastUsedAt) || 0))[0];
        if (next) {
            file.motionflowActiveAccountId = next.id;
            file.motionflowAuth = {
                token: next.token,
                id: next.id,
                email: next.email,
                name: next.name,
            };
        }
        else {
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
export function asBool(value) {
    return value === true || value === 1;
}
export function readSharedAuthSnapshot() {
    const auth = readMotionflowAuth();
    const vault = readAccountVault();
    return {
        token: auth.token,
        id: auth.id,
        activeId: vault.activeId,
        accounts: vault.accounts.map((account) => ({
            id: account.id,
            token: account.token,
        })),
    };
}
export function sharedAuthFingerprint() {
    return authVaultFingerprint(readSharedAuthSnapshot());
}
/**
 * AE and Premiere both persist to the same preferences.json for this brand.
 * Watch + poll so the other host picks up login/logout without a second sign-in.
 */
export function onSharedAuthFileChange(listener) {
    let debounce = null;
    const fire = () => {
        if (debounce)
            clearTimeout(debounce);
        debounce = setTimeout(() => {
            debounce = null;
            try {
                listener();
            }
            catch {
                /* ignore */
            }
        }, 150);
    };
    let watcher = null;
    const filePath = resolvePreferencesPath();
    if (cepFsAvailable() && filePath && typeof fs.watch === "function") {
        try {
            watcher = fs.watch(filePath, fire);
        }
        catch {
            try {
                const dir = path.dirname(filePath);
                watcher = fs.watch(dir, (_event, filename) => {
                    if (!filename || String(filename).toLowerCase().includes("preferences")) {
                        fire();
                    }
                });
            }
            catch {
                watcher = null;
            }
        }
    }
    const poll = setInterval(fire, 2000);
    const onVisible = () => {
        if (typeof document === "undefined" || document.visibilityState === "visible") {
            fire();
        }
    };
    if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onVisible);
    }
    if (typeof window !== "undefined") {
        window.addEventListener("focus", fire);
    }
    return () => {
        if (debounce)
            clearTimeout(debounce);
        clearInterval(poll);
        try {
            watcher?.close();
        }
        catch {
            /* ignore */
        }
        if (typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", onVisible);
        }
        if (typeof window !== "undefined") {
            window.removeEventListener("focus", fire);
        }
    };
}
