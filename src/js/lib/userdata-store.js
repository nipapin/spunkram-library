/**
 * Persistent key/value store under Motionflow userdata (AppData / Application Support).
 * Survives clearing the CEP Chromium localStorage / site data.
 *
 * Path (Windows): %APPDATA%/Motionflow/Motionflow Library/panel-store.json
 * Path (macOS):   ~/Library/Application Support/Motionflow/Motionflow Library/panel-store.json
 */
import { fs, os, path } from "@/lib/cep/node";
import { BRAND, storageKey } from "@brands";
const STORE_VERSION = 1;
const MIGRATED_FLAG = storageKey("__ls_migrated_v1__");
let cache = null;
function cepFsAvailable() {
    return (typeof fs?.existsSync === "function" &&
        typeof fs?.readFileSync === "function" &&
        typeof fs?.writeFileSync === "function");
}
function hasLocalStorage() {
    try {
        return typeof localStorage !== "undefined" && !!localStorage.getItem;
    }
    catch {
        return false;
    }
}
/** Directory for Motionflow Library panel persistence. */
export function getPanelUserDataDir() {
    if (typeof os?.homedir !== "function" || typeof path?.join !== "function")
        return "";
    const base = os.platform() === "win32"
        ? path.join(os.homedir(), "AppData", "Roaming")
        : path.join(os.homedir(), "Library", "Application Support");
    return path.join(base, BRAND.panelCompany, BRAND.panelProduct);
}
export function getPanelStorePath() {
    const dir = getPanelUserDataDir();
    return dir ? path.join(dir, "panel-store.json") : "";
}
function emptyStore() {
    return { version: STORE_VERSION, values: {} };
}
function readStoreFile(filePath) {
    if (!cepFsAvailable() || !filePath || !fs.existsSync(filePath))
        return null;
    try {
        const raw = fs.readFileSync(filePath, { encoding: "utf8" }).toString();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || !parsed.values || typeof parsed.values !== "object") {
            return null;
        }
        const values = {};
        for (const [k, v] of Object.entries(parsed.values)) {
            if (typeof v === "string")
                values[k] = v;
            else if (v != null)
                values[k] = String(v);
        }
        return { version: STORE_VERSION, values };
    }
    catch {
        return null;
    }
}
function writeStoreFile(filePath, store) {
    if (!cepFsAvailable() || !filePath || typeof path?.dirname !== "function")
        return false;
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(store, null, 2), { encoding: "utf8" });
        return true;
    }
    catch {
        return false;
    }
}
function shouldMigrateKey(key) {
    return (key.startsWith("motionflow") ||
        key.startsWith("spunkram") ||
        key.startsWith("spunkram-library") ||
        key.startsWith("aitools-cep") ||
        key.startsWith("gal-premiere"));
}
/** Copy panel keys from Chromium localStorage into the userdata file once. */
function migrateLocalStorageOnce(store) {
    if (!hasLocalStorage())
        return;
    if (store.values[MIGRATED_FLAG] === "1")
        return;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !shouldMigrateKey(key))
                continue;
            if (Object.prototype.hasOwnProperty.call(store.values, key))
                continue;
            const val = localStorage.getItem(key);
            if (val != null)
                store.values[key] = val;
        }
    }
    catch {
        // ignore quota / security errors
    }
    store.values[MIGRATED_FLAG] = "1";
}
function ensureCache() {
    if (cache)
        return cache;
    const filePath = getPanelStorePath();
    if (cepFsAvailable() && filePath) {
        cache = readStoreFile(filePath) ?? emptyStore();
        migrateLocalStorageOnce(cache);
        writeStoreFile(filePath, cache);
        return cache;
    }
    cache = emptyStore();
    if (hasLocalStorage()) {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !shouldMigrateKey(key))
                    continue;
                const val = localStorage.getItem(key);
                if (val != null)
                    cache.values[key] = val;
            }
        }
        catch {
            // ignore
        }
    }
    return cache;
}
function persist() {
    if (!cache)
        return;
    const filePath = getPanelStorePath();
    if (cepFsAvailable() && filePath) {
        writeStoreFile(filePath, cache);
        return;
    }
    if (!hasLocalStorage())
        return;
    try {
        for (const [key, value] of Object.entries(cache.values)) {
            if (key === MIGRATED_FLAG)
                continue;
            localStorage.setItem(key, value);
        }
    }
    catch {
        // ignore
    }
}
export function getItem(key) {
    const store = ensureCache();
    if (Object.prototype.hasOwnProperty.call(store.values, key)) {
        return store.values[key] ?? null;
    }
    return null;
}
export function setItem(key, value) {
    const store = ensureCache();
    store.values[key] = String(value);
    persist();
}
export function removeItem(key) {
    const store = ensureCache();
    if (!Object.prototype.hasOwnProperty.call(store.values, key))
        return;
    delete store.values[key];
    persist();
    if (!cepFsAvailable() && hasLocalStorage()) {
        try {
            localStorage.removeItem(key);
        }
        catch {
            // ignore
        }
    }
}
export function getJSON(key, fallback) {
    const raw = getItem(key);
    if (raw == null)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
export function setJSON(key, value) {
    setItem(key, JSON.stringify(value));
}
export function resetPanelStoreCache() {
    cache = null;
}
