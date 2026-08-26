import { fs, path } from "../lib/cep/node";
import {
  ensureDir,
  getCdnBaseManifestPath,
  getLocalStatePath,
  getStylePackageDir,
  getStylesDir,
  getStylesRoot,
  getUserControlsPath,
  getUserStyleDir,
} from "./paths";
import type {
  LocalCdnBaseManifest,
  LocalStyleManifest,
  LocalStylePackage,
  StylesLocalState,
  StylePreset,
} from "./types";
import { EMPTY_DEFINITION } from "./types";
import { normalizeDefinition } from "../presets/controlsSchema";
import type { MogrtDefinition } from "../presets/types";

export const LOCAL_STATE_VERSION = 1;

const emptyState = (): StylesLocalState => ({
  version: LOCAL_STATE_VERSION,
  selectedPresetId: "",
  favorites: {},
  userPresets: [],
  downloadedEdits: {},
});

const isCepFs = () => typeof window !== "undefined" && typeof (window as Window & { cep?: unknown }).cep !== "undefined";

const readJson = <T>(filePath: string): T | null => {
  if (!isCepFs() || !fs.existsSync?.(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, { encoding: "utf-8" });
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
};

const writeJson = (filePath: string, data: unknown): boolean => {
  if (!isCepFs() || !fs.writeFileSync) return false;
  try {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
};

/** Fallback для браузерного vite-preview без CEP Node. */
const MEMORY_KEY = "aitools-cep-styles-state";
const MEMORY_PACKAGES_KEY = "aitools-cep-style-packages";
const MEMORY_CDN_BASE_KEY = "aitools-cep-captions-cdn-base";
const MEMORY_USER_CONTROLS_KEY = "aitools-cep-user-controls";

type MemoryPackages = Record<string, { manifest: LocalStyleManifest }>;

const readMemoryState = (): StylesLocalState => {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<StylesLocalState>;
    if (parsed.version !== LOCAL_STATE_VERSION) return emptyState();
    return {
      version: LOCAL_STATE_VERSION,
      selectedPresetId: parsed.selectedPresetId ?? "",
      favorites: parsed.favorites ?? {},
      userPresets: Array.isArray(parsed.userPresets) ? parsed.userPresets : [],
      downloadedEdits: {},
    };
  } catch {
    return emptyState();
  }
};

const writeMemoryState = (state: StylesLocalState) => {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(state));
};

const readMemoryPackages = (): MemoryPackages => {
  try {
    const raw = localStorage.getItem(MEMORY_PACKAGES_KEY);
    return raw ? (JSON.parse(raw) as MemoryPackages) : {};
  } catch {
    return {};
  }
};

const writeMemoryPackages = (packages: MemoryPackages) => {
  localStorage.setItem(MEMORY_PACKAGES_KEY, JSON.stringify(packages));
};

export const loadLocalState = (): StylesLocalState => {
  const filePath = getLocalStatePath();
  if (!filePath) return readMemoryState();
  const root = getStylesRoot();
  if (root) ensureDir(root);
  const fromDisk = readJson<StylesLocalState>(filePath);
  if (!fromDisk || fromDisk.version !== LOCAL_STATE_VERSION) return emptyState();
  return {
    version: LOCAL_STATE_VERSION,
    selectedPresetId: fromDisk.selectedPresetId ?? "",
    favorites: fromDisk.favorites ?? {},
    userPresets: Array.isArray(fromDisk.userPresets) ? fromDisk.userPresets : [],
    downloadedEdits: {},
  };
};

export const saveLocalState = (state: StylesLocalState): void => {
  const filePath = getLocalStatePath();
  if (!filePath) {
    writeMemoryState(state);
    return;
  }
  writeJson(filePath, state);
};

const parseLocalCdnBaseManifest = (raw: unknown): LocalCdnBaseManifest | null => {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== "string" || !o.version.trim()) return null;
  return {
    version: o.version.trim(),
    fetchedAt: typeof o.fetchedAt === "string" ? o.fetchedAt : "",
    brand: typeof o.brand === "string" ? o.brand : "",
  };
};

const readMemoryCdnBaseManifest = (): LocalCdnBaseManifest | null => {
  try {
    const raw = localStorage.getItem(MEMORY_CDN_BASE_KEY);
    return raw ? parseLocalCdnBaseManifest(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

/** Last seen `{Brand} Captions/Base/manifest.json` from CDN. */
export const loadCdnBaseManifest = (): LocalCdnBaseManifest | null => {
  const filePath = getCdnBaseManifestPath();
  if (!filePath) return readMemoryCdnBaseManifest();
  return parseLocalCdnBaseManifest(readJson<unknown>(filePath));
};

export const saveCdnBaseManifest = (manifest: LocalCdnBaseManifest): void => {
  const filePath = getCdnBaseManifestPath();
  if (!filePath) {
    try {
      localStorage.setItem(MEMORY_CDN_BASE_KEY, JSON.stringify(manifest));
    } catch {
      /* ignore quota */
    }
    return;
  }
  writeJson(filePath, manifest);
};

export const listLocalPackageIds = (): string[] => {
  const dir = getStylesDir();
  if (!dir || !isCepFs() || !fs.existsSync?.(dir) || !fs.readdirSync) {
    return Object.keys(readMemoryPackages());
  }
  try {
    return fs.readdirSync(dir).filter((name) => {
      try {
        return fs.statSync(path.join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
};

export const loadLocalPackage = (styleId: string): LocalStylePackage | null => {
  const dir = getStylePackageDir(styleId);
  if (!dir || !isCepFs()) {
    const mem = readMemoryPackages()[styleId];
    if (!mem) return null;
    return {
      manifest: mem.manifest,
      definition: EMPTY_DEFINITION,
      dir: `memory://${styleId}`,
    };
  }
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = readJson<LocalStyleManifest>(manifestPath);
  if (!manifest) return null;
  return {
    manifest,
    definition: EMPTY_DEFINITION,
    dir,
  };
};

/** Persist only `{Pack}.mogrt` / `{Pack}.aep`. controls.json is fetched from CDN. */
export const saveLocalPackage = (
  manifest: LocalStyleManifest,
  assets?: { aep?: ArrayBuffer | Uint8Array; mogrt?: ArrayBuffer | Uint8Array },
): LocalStylePackage | null => {
  const dir = getStylePackageDir(manifest.id);
  if (!dir || !isCepFs()) {
    const packages = readMemoryPackages();
    packages[manifest.id] = { manifest };
    writeMemoryPackages(packages);
    return { manifest, definition: EMPTY_DEFINITION, dir: `memory://${manifest.id}` };
  }

  if (!ensureDir(dir)) return null;

  writeJson(path.join(dir, "manifest.json"), manifest);

  if (assets?.aep && manifest.files.aep) {
    fs.writeFileSync(path.join(dir, manifest.files.aep), new Uint8Array(assets.aep));
  }
  if (assets?.mogrt && manifest.files.mogrt) {
    fs.writeFileSync(path.join(dir, manifest.files.mogrt), new Uint8Array(assets.mogrt));
  }

  return { manifest, definition: EMPTY_DEFINITION, dir };
};

export const removeLocalPackage = (styleId: string): void => {
  const dir = getStylePackageDir(styleId);
  if (!dir || !isCepFs() || !fs.existsSync?.(dir)) {
    const packages = readMemoryPackages();
    delete packages[styleId];
    writeMemoryPackages(packages);
    return;
  }
  try {
    fs.rmSync?.(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

export const upsertUserPreset = (preset: StylePreset): void => {
  const state = loadLocalState();
  const idx = state.userPresets.findIndex((p) => p.id === preset.id);
  if (idx >= 0) state.userPresets[idx] = preset;
  else state.userPresets.push(preset);
  saveLocalState(state);
};

export const removeUserPreset = (presetId: string): void => {
  const state = loadLocalState();
  state.userPresets = state.userPresets.filter((p) => p.id !== presetId);
  if (state.selectedPresetId === presetId) state.selectedPresetId = "";
  saveLocalState(state);
  removeUserControls(presetId);
};

const readMemoryUserControls = (): Record<string, Record<string, unknown>> => {
  try {
    const raw = localStorage.getItem(MEMORY_USER_CONTROLS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Record<string, unknown>>) : {};
  } catch {
    return {};
  }
};

const writeMemoryUserControls = (docs: Record<string, Record<string, unknown>>) => {
  localStorage.setItem(MEMORY_USER_CONTROLS_KEY, JSON.stringify(docs));
};

export const loadUserControlsDocument = (presetId: string): Record<string, unknown> | null => {
  const filePath = getUserControlsPath(presetId);
  if (!filePath) {
    const mem = readMemoryUserControls()[presetId];
    return mem ?? null;
  }
  return readJson<Record<string, unknown>>(filePath);
};

export const loadUserControlsDefinition = (presetId: string): MogrtDefinition | null => {
  const doc = loadUserControlsDocument(presetId);
  if (!doc) return null;
  const parsed = normalizeDefinition(doc);
  return parsed.clientControls?.length || parsed.init?.length ? parsed : null;
};

export const saveUserControls = (presetId: string, doc: Record<string, unknown>): boolean => {
  const filePath = getUserControlsPath(presetId);
  if (!filePath) {
    const mem = readMemoryUserControls();
    mem[presetId] = doc;
    writeMemoryUserControls(mem);
    return true;
  }
  const dir = getUserStyleDir(presetId);
  if (dir && !ensureDir(dir)) return false;
  return writeJson(filePath, doc);
};

export const removeUserControls = (presetId: string): void => {
  const dir = getUserStyleDir(presetId);
  if (!dir || !isCepFs() || !fs.existsSync?.(dir)) {
    const mem = readMemoryUserControls();
    delete mem[presetId];
    writeMemoryUserControls(mem);
    return;
  }
  try {
    fs.rmSync?.(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

export const hasUserControls = (presetId: string): boolean => {
  const filePath = getUserControlsPath(presetId);
  if (!filePath) return !!readMemoryUserControls()[presetId];
  try {
    return !!fs.existsSync?.(filePath);
  } catch {
    return false;
  }
};
