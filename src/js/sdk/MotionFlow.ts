import { evalES, evalTS, initBolt, reloadJSX } from "../lib/utils/bolt";
import { version as pkgVersion } from "../../shared/shared";
import { detectHost } from "./host";
import { fail, ok, wrap } from "./result";
import { legacyLoaded, loadLegacyJsx } from "./legacy-loader";
import type { MfResult, PackBindContext } from "./types";
import { AE } from "./ae";
import { PPRO } from "./ppro";

let hostScriptsReady = false;

async function ensureHost(): Promise<void> {
  if (!window.cep) return;
  if (!hostScriptsReady) {
    await MotionFlow.loadHostScripts();
  }
}

export const MotionFlow = {
  version: pkgVersion,
  AE,
  PPRO,

  get host() {
    return detectHost();
  },

  isReady(): boolean {
    return hostScriptsReady;
  },

  /** Load Bolt JSX bundle + Beta legacy composers. Safe to call multiple times. */
  async loadHostScripts(): Promise<
    MfResult<{ legacyLoaded: string[]; legacyMissing: string[] }>
  > {
    return wrap(async () => {
      if (window.cep) {
        initBolt(false);
        await reloadJSX();
        const legacy = await loadLegacyJsx();
        hostScriptsReady = true;
        return { legacyLoaded: legacy.loaded, legacyMissing: legacy.missing };
      }
      hostScriptsReady = false;
      return { legacyLoaded: [], legacyMissing: [] };
    });
  },

  async bindPack(ctx: PackBindContext): Promise<MfResult<{ ok: true }>> {
    await ensureHost();
    return wrap(async () => {
      const r = await evalTS("bindPack", ctx);
      // Also sync legacy engine when present
      try {
        await evalES(
          `(function(){ if(typeof transferExeSwitchTrigger==='function'){ transferExeSwitchTrigger(${JSON.stringify(ctx)}); } return true; })()`,
          true,
        );
      } catch {
        // legacy optional
      }
      return r;
    });
  },

  async setEngine(engineType: string): Promise<MfResult<{ ok: true; engine: string }>> {
    await ensureHost();
    return wrap(async () => {
      const r = await evalTS("setEngine", engineType);
      try {
        await evalES(
          `(function(){ if(typeof transferExeEngineSwitchTrigger==='function'){ transferExeEngineSwitchTrigger(${JSON.stringify({ engine: engineType })}); } return true; })()`,
          true,
        );
      } catch {
        // optional
      }
      return r;
    });
  },

  /**
   * Legacy global applyItem when composers are loaded.
   * Prefer applyPackItem / PPRO.addMogrt for new code.
   */
  async applyItem(...args: unknown[]): Promise<MfResult<unknown>> {
    await ensureHost();
    return wrap(async () => {
      const res = await evalES(
        `(function(){ if(typeof applyItem!=='function') throw new Error('LEGACY_APPLYITEM_NOT_LOADED'); return applyItem.apply(null, ${JSON.stringify(args)}); })()`,
        true,
      );
      return res;
    });
  },

  customize: {
    async get(...args: unknown[]): Promise<MfResult<unknown>> {
      await ensureHost();
      const host = detectHost();
      if (host === "AE") return AE.customize.get(...args);
      if (host === "PPRO") return PPRO.customize.get(...args);
      return fail("No host");
    },
    async set(...args: unknown[]): Promise<MfResult<unknown>> {
      await ensureHost();
      const host = detectHost();
      if (host === "AE") return AE.customize.edit(...args);
      if (host === "PPRO") return PPRO.customize.set(...args);
      return fail("No host");
    },
  },

  packs: {
    async copyToAppData(transfer: {
      source: { pack: string; assets: string; templates: string };
      target: { pack: string; assets: string; templates: string };
    }): Promise<MfResult<string | false>> {
      await ensureHost();
      return wrap(() => evalTS("mfCopyPackage", transfer));
    },
    async deleteFiles(packDir: string): Promise<MfResult<boolean>> {
      await ensureHost();
      return wrap(() => evalTS("mfDeletePackage", packDir));
    },
    /** @deprecated Legacy JSXBIN pack loader */
    async runJsxbin(path: string): Promise<MfResult<unknown>> {
      await ensureHost();
      return wrap(async () =>
        evalES(
          `(function(){ if(typeof runPackageJSXBIN!=='function') throw new Error('LEGACY_JSXBIN_NOT_LOADED'); return runPackageJSXBIN(${JSON.stringify(path)}); })()`,
          true,
        ),
      );
    },
  },

  async importExternalAsset(
    host: "AE" | "PPRO",
    typeImportTo: string,
    filePath: string,
  ): Promise<MfResult<unknown>> {
    await ensureHost();
    return wrap(async () => {
      const method = host === "AE" ? "importToAE" : "importToPR";
      return evalES(
        `(function(){ if(!$._AtomExt_externalLibAssetImporter) throw new Error('LEGACY_EXTERNAL_LIB_NOT_LOADED'); return $._AtomExt_externalLibAssetImporter.${method}(${JSON.stringify(typeImportTo)}, ${JSON.stringify(filePath)}); })()`,
        true,
      );
    });
  },

  /** Host-agnostic helpers that pick AE or PPRO from current app. */
  async describe(audioPresetPath?: string) {
    await ensureHost();
    const host = detectHost();
    if (host === "AE") return AE.describe(audioPresetPath);
    if (host === "PPRO") return PPRO.describe(audioPresetPath);
    return fail("No host");
  },

  async importMedia(filePath: string, destination: string, duration: number) {
    await ensureHost();
    const host = detectHost();
    if (host === "AE") return AE.importMedia(filePath, destination, duration);
    if (host === "PPRO") return PPRO.importMedia(filePath, destination, duration);
    return fail("No host");
  },

  async importVoiceoverAudio(filePath: string, destination: string, duration: number) {
    await ensureHost();
    const host = detectHost();
    if (host === "AE") return AE.importVoiceoverAudio(filePath, destination, duration);
    if (host === "PPRO") return PPRO.importVoiceoverAudio(filePath, destination, duration);
    return fail("No host");
  },

  async applyPackItem(payload: import("./types").ApplyPackItemPayload) {
    await ensureHost();
    const host = detectHost();
    if (host === "AE") return AE.applyPackItem(payload);
    if (host === "PPRO") return PPRO.applyPackItem(payload);
    return fail("No host");
  },

  /** Debug: whether Beta legacy composers finished loading. */
  legacyLoaded,
};

export type { MfResult, PackBindContext };
export type * from "./types";
