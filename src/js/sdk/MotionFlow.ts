import { evalTS, initBolt, reloadJSX } from "../lib/utils/bolt";
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

  /** Wait until Bolt JSX is loaded. Safe to call on every Transcribe / host action. */
  async ready(): Promise<void> {
    await ensureHost();
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
    return wrap(async () => evalTS("bindPack", ctx));
  },

  async setEngine(engineType: string): Promise<MfResult<{ ok: true; engine: string }>> {
    await ensureHost();
    return wrap(async () => evalTS("setEngine", engineType));
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
  },

  async importExternalAsset(
    host: "AE" | "PPRO",
    typeImportTo: string,
    filePath: string,
  ): Promise<MfResult<unknown>> {
    await ensureHost();
    return wrap(async () => {
      const payload = { typeImportTo, filePath };
      const r = await evalTS("importExternalAsset", payload);
      if (r && typeof r === "object" && (r as { ok?: boolean }).ok === false) {
        throw new Error(String((r as { reason?: string }).reason || "importExternalAsset failed"));
      }
      if (r && typeof r === "object" && "data" in (r as object)) {
        return (r as { data?: unknown }).data;
      }
      return r;
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

  async getWorkRange() {
    await ensureHost();
    const host = detectHost();
    if (host === "AE") return AE.getWorkRange();
    if (host === "PPRO") return PPRO.getWorkRange();
    return fail("No host");
  },

  async importMedia(filePath: string, destination: string, duration: number) {
    await ensureHost();
    const host = detectHost();
    if (host === "AE") return AE.importMedia(filePath, destination, duration);
    if (host === "PPRO") return PPRO.importMedia(filePath, destination, duration);
    return fail("No host");
  },

  /** Parent folder of the saved host project, or null if unsaved. */
  async getProjectFolderPath(): Promise<MfResult<string | null>> {
    await ensureHost();
    const host = detectHost();
    if (host === "AE") return AE.getProjectFolderPath();
    if (host === "PPRO") return PPRO.getProjectFolderPath();
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
