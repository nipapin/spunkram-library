/**
 * Load Beta legacy ExtendScript after Bolt `jsx/index.js`.
 * Files live in `src/jsx/legacy/` and are copied to `dist/cep/jsx/legacy/`.
 */
import { csi, evalES, evalFile } from "../lib/utils/bolt";
import { fs, path } from "../lib/cep/node";

let loaded = false;

const LEGACY_ORDER = [
  "engine.jsx",
  "ae_composer.jsx",
  "ae_preset_manager.jsx",
  "ae_text_presets.jsx",
];

export function legacyLoaded(): boolean {
  return loaded;
}

function legacyDir(): string {
  const extRoot = csi.getSystemPath("extension");
  return path.join(extRoot, "jsx", "legacy");
}

/** Alias Atom namespaces under $._MotionFlow for gradual rename (group 7). */
async function installMfAliases(): Promise<void> {
  await evalES(
    `(function(){
      if (typeof $ === 'undefined') return;
      $._MotionFlow = $._MotionFlow || {};
      if ($._AtomExt_engine) $._MotionFlow.engine = $._AtomExt_engine;
      if ($._AtomExt_aeComposer) $._MotionFlow.aeComposer = $._AtomExt_aeComposer;
      if ($._AtomExt_ppComposer) $._MotionFlow.ppComposer = $._AtomExt_ppComposer;
      if ($._AtomExt_aePresetManager) $._MotionFlow.aePresetManager = $._AtomExt_aePresetManager;
      if ($._AtomExt_aeTextPresets) $._MotionFlow.aeTextPresets = $._AtomExt_aeTextPresets;
    })()`,
    true,
  );
}

export async function loadLegacyJsx(): Promise<{ loaded: string[]; missing: string[] }> {
  if (!window.cep) {
    loaded = false;
    return { loaded: [], missing: LEGACY_ORDER.slice() };
  }
  const dir = legacyDir();
  const loadedFiles: string[] = [];
  const missing: string[] = [];
  for (let i = 0; i < LEGACY_ORDER.length; i++) {
    const name = LEGACY_ORDER[i];
    const full = path.join(dir, name).replace(/\\/g, "/");
    if (!fs.existsSync(full)) {
      missing.push(name);
      continue;
    }
    await evalFile(full);
    loadedFiles.push(name);
  }
  await installMfAliases();
  loaded = loadedFiles.length > 0;
  return { loaded: loadedFiles, missing };
}

/** Escape string for embedding in ExtendScript. */
export function esString(value: string): string {
  return JSON.stringify(value);
}

/** Call a legacy global / dotted path and JSON-parse the result when possible. */
export async function evalLegacy<T = unknown>(script: string): Promise<T> {
  const raw = await evalES(
    `(function(){ try { var __r = (function(){ ${script} })(); return JSON.stringify({ok:true,data:__r}); } catch(e){ return JSON.stringify({ok:false,error:String(e&&e.message?e.message:e)}); } })()`,
    true,
  );
  try {
    const parsed = JSON.parse(raw) as { ok: boolean; data?: T; error?: string };
    if (!parsed.ok) throw new Error(parsed.error || "Legacy ExtendScript error");
    return parsed.data as T;
  } catch (e) {
    if (e instanceof SyntaxError) {
      // non-JSON result
      return raw as unknown as T;
    }
    throw e;
  }
}
