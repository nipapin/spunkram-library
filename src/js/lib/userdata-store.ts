/**
 * Persistent key/value store under Motionflow userdata (AppData / Application Support).
 * Survives clearing the CEP Chromium localStorage / site data.
 *
 * Path (Windows): %APPDATA%/Motionflow/Motionflow Library/panel-store.json
 * Path (macOS):   ~/Library/Application Support/Motionflow/Motionflow Library/panel-store.json
 */
import { fs, path } from "@/lib/cep/node";
import { panelUserDataDir, storageKey } from "@/lib/config/brand";

const STORE_VERSION = 1;
const MIGRATED_FLAG = storageKey("__ls_migrated_v1__");

type StoreFile = {
  version: number;
  values: Record<string, string>;
};

let cache: StoreFile | null = null;

function cepFsAvailable(): boolean {
  return (
    typeof fs?.existsSync === "function" &&
    typeof fs?.readFileSync === "function" &&
    typeof fs?.writeFileSync === "function"
  );
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && !!localStorage.getItem;
  } catch {
    return false;
  }
}

/** Directory for Motionflow Library panel persistence. */
export function getPanelUserDataDir(): string {
  return panelUserDataDir();
}

export function getPanelStorePath(): string {
  const dir = getPanelUserDataDir();
  return dir ? path.join(dir, "panel-store.json") : "";
}

function emptyStore(): StoreFile {
  return { version: STORE_VERSION, values: {} };
}

function readStoreFile(filePath: string): StoreFile | null {
  if (!cepFsAvailable() || !filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, { encoding: "utf8" }).toString();
    const parsed = JSON.parse(raw) as Partial<StoreFile>;
    if (!parsed || typeof parsed !== "object" || !parsed.values || typeof parsed.values !== "object") {
      return null;
    }
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.values)) {
      if (typeof v === "string") values[k] = v;
      else if (v != null) values[k] = String(v);
    }
    return { version: STORE_VERSION, values };
  } catch {
    return null;
  }
}

function writeStoreFile(filePath: string, store: StoreFile): boolean {
  if (!cepFsAvailable() || !filePath || typeof path?.dirname !== "function") return false;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

function shouldMigrateKey(key: string): boolean {
  return (
    key.startsWith("motionflow") ||
    key.startsWith("spunkram") ||
    key.startsWith("spunkram-library") ||
    key.startsWith("aitools-cep") ||
    key.startsWith("gal-premiere")
  );
}

/** Copy panel keys from Chromium localStorage into the userdata file once. */
function migrateLocalStorageOnce(store: StoreFile): void {
  if (!hasLocalStorage()) return;
  if (store.values[MIGRATED_FLAG] === "1") return;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !shouldMigrateKey(key)) continue;
      if (Object.prototype.hasOwnProperty.call(store.values, key)) continue;
      const val = localStorage.getItem(key);
      if (val != null) store.values[key] = val;
    }
  } catch {
    // ignore quota / security errors
  }

  store.values[MIGRATED_FLAG] = "1";
}

function ensureCache(): StoreFile {
  if (cache) return cache;

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
        if (!key || !shouldMigrateKey(key)) continue;
        const val = localStorage.getItem(key);
        if (val != null) cache.values[key] = val;
      }
    } catch {
      // ignore
    }
  }
  return cache;
}

function persist(): void {
  if (!cache) return;
  const filePath = getPanelStorePath();
  if (cepFsAvailable() && filePath) {
    writeStoreFile(filePath, cache);
    return;
  }
  if (!hasLocalStorage()) return;
  try {
    for (const [key, value] of Object.entries(cache.values)) {
      if (key === MIGRATED_FLAG) continue;
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
}

export function getItem(key: string): string | null {
  const store = ensureCache();
  if (Object.prototype.hasOwnProperty.call(store.values, key)) {
    return store.values[key] ?? null;
  }
  return null;
}

export function setItem(key: string, value: string): void {
  const store = ensureCache();
  store.values[key] = String(value);
  persist();
}

export function removeItem(key: string): void {
  const store = ensureCache();
  if (!Object.prototype.hasOwnProperty.call(store.values, key)) return;
  delete store.values[key];
  persist();
  if (!cepFsAvailable() && hasLocalStorage()) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

export function getJSON<T>(key: string, fallback: T): T {
  const raw = getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJSON(key: string, value: unknown): void {
  setItem(key, JSON.stringify(value));
}

export function resetPanelStoreCache(): void {
  cache = null;
}
