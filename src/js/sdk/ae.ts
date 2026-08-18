import { evalTS } from "../lib/utils/bolt";
import { withHostJsonFile } from "../utils/captionHostPayload";
import { requireHost } from "./host";
import { wrap } from "./result";
import type {
  ApplyPackItemPayload,
  ApplyPackItemResult,
  CreateCompOptions,
  CreateTextOptions,
  MfResult,
  ResponsiveBackgroundOptions,
} from "./types";

export const AE = {
  async createComp(opts: CreateCompOptions): Promise<MfResult<{ compId: number; name: string }>> {
    return wrap(async () => {
      requireHost("AE");
      const r = await evalTS("createComp", opts);
      if (!r || !r.ok) throw new Error((r as any)?.reason || "createComp failed");
      return { compId: (r as any).compId, name: (r as any).name };
    });
  },

  async createText(
    opts: CreateTextOptions,
  ): Promise<MfResult<{ layerIndex: number; compId: number }>> {
    return wrap(async () => {
      requireHost("AE");
      const r = await evalTS("createText", opts);
      if (!r || !r.ok) throw new Error((r as any)?.reason || "createText failed");
      return { layerIndex: (r as any).layerIndex, compId: (r as any).compId };
    });
  },

  async addResponsiveBackground(
    opts?: ResponsiveBackgroundOptions,
  ): Promise<MfResult<{ layerIndex: number; compId: number }>> {
    return wrap(async () => {
      requireHost("AE");
      const r = await evalTS("addResponsiveBackground", opts);
      if (!r || !r.ok) throw new Error((r as any)?.reason || "addResponsiveBackground failed");
      return { layerIndex: (r as any).layerIndex, compId: (r as any).compId };
    });
  },

  async applyComp(...args: unknown[]): Promise<MfResult<unknown>> {
    return wrap(async () => {
      requireHost("AE");
      const r = await evalTS("legacyAeCall", "applyComp", JSON.stringify(args));
      if (!r?.ok) throw new Error(r?.reason || "applyComp failed");
      return r.data;
    });
  },

  async addTextAnimator(...args: unknown[]): Promise<MfResult<unknown>> {
    return wrap(async () => {
      requireHost("AE");
      const r = await evalTS("legacyAeCall", "addTextAnimatorComp", JSON.stringify(args));
      if (!r?.ok) throw new Error(r?.reason || "addTextAnimator failed");
      return r.data;
    });
  },

  async addPhotoAnimator(...args: unknown[]): Promise<MfResult<unknown>> {
    return wrap(async () => {
      requireHost("AE");
      const r = await evalTS("legacyAeCall", "addPhotoAnimatorComp", JSON.stringify(args));
      if (!r?.ok) throw new Error(r?.reason || "addPhotoAnimator failed");
      return r.data;
    });
  },

  async applyPreset(...args: unknown[]): Promise<MfResult<unknown>> {
    return wrap(async () => {
      requireHost("AE");
      const { evalES } = await import("../lib/utils/bolt");
      return evalES(
        `(function(){ if(!$._AtomExt_aePresetManager) throw new Error('LEGACY_PRESET_NOT_LOADED'); return $._AtomExt_aePresetManager.applyPreset.apply($._AtomExt_aePresetManager, ${JSON.stringify(args)}); })()`,
        true,
      );
    });
  },

  textPresets: {
    async apply(...args: unknown[]): Promise<MfResult<unknown>> {
      return wrap(async () => {
        requireHost("AE");
        const { evalES } = await import("../lib/utils/bolt");
        return evalES(
          `(function(){ if(!$._AtomExt_aeTextPresets) throw new Error('LEGACY_TEXT_PRESETS_NOT_LOADED'); return $._AtomExt_aeTextPresets.applyAndReplacePreset.apply($._AtomExt_aeTextPresets, ${JSON.stringify(args)}); })()`,
          true,
        );
      });
    },
    async get(): Promise<MfResult<unknown>> {
      return wrap(async () => {
        requireHost("AE");
        const { evalES } = await import("../lib/utils/bolt");
        return evalES(
          `(function(){ if(!$._AtomExt_aeTextPresets) throw new Error('LEGACY_TEXT_PRESETS_NOT_LOADED'); return $._AtomExt_aeTextPresets.getPreset(); })()`,
          true,
        );
      });
    },
    async remove(...args: unknown[]): Promise<MfResult<unknown>> {
      return wrap(async () => {
        requireHost("AE");
        const { evalES } = await import("../lib/utils/bolt");
        return evalES(
          `(function(){ if(!$._AtomExt_aeTextPresets) throw new Error('LEGACY_TEXT_PRESETS_NOT_LOADED'); return $._AtomExt_aeTextPresets.removePreset.apply($._AtomExt_aeTextPresets, ${JSON.stringify(args)}); })()`,
          true,
        );
      });
    },
  },

  customize: {
    async get(...args: unknown[]): Promise<MfResult<unknown>> {
      return wrap(async () => {
        requireHost("AE");
        const r = await evalTS("legacyAeCall", "customizer", JSON.stringify(args));
        if (!r?.ok) throw new Error(r?.reason || "customize get failed");
        return r.data;
      });
    },
    async edit(...args: unknown[]): Promise<MfResult<unknown>> {
      return wrap(async () => {
        requireHost("AE");
        const r = await evalTS("legacyAeCall", "editCustomizer", JSON.stringify(args));
        if (!r?.ok) throw new Error(r?.reason || "customize edit failed");
        return r.data;
      });
    },
  },

  tools: {
    async run(type: string): Promise<MfResult<unknown>> {
      return wrap(async () => {
        requireHost("AE");
        const r = await evalTS("legacyAeCall", "buttons", JSON.stringify([type]));
        if (!r?.ok) throw new Error(r?.reason || "tools failed");
        return r.data;
      });
    },
  },

  async describe(audioPresetPath?: string) {
    return wrap(() => evalTS("describe", audioPresetPath));
  },
  async getWorkRange() {
    return wrap(() => evalTS("getWorkRange"));
  },
  async addMarkers(data: { markers: unknown[] }) {
    return wrap(() => evalTS("addMarkers", data as any));
  },
  async getCurrentTime() {
    return wrap(() => evalTS("getCurrentTime"));
  },
  async getProjectFolderPath() {
    return wrap(() => evalTS("getProjectFolderPath"));
  },
  async setCurrentTime(payload: { time: number }) {
    return wrap(() => evalTS("setCurrentTime", payload));
  },
  async createCaptions(payload: unknown) {
    return wrap(() =>
      withHostJsonFile(payload, (filePath) => evalTS("createCaptionsFromFile", filePath)),
    );
  },
  async createCaptionsFromFile(jsonPath: string) {
    return wrap(() => evalTS("createCaptionsFromFile", jsonPath));
  },
  async resegmentCaptions(payload: unknown) {
    return wrap(() =>
      withHostJsonFile(payload, (filePath) => evalTS("resegmentCaptionsFromFile", filePath)),
    );
  },
  async updateCaptionText(payload: unknown) {
    return wrap(() =>
      withHostJsonFile(payload, (filePath) => evalTS("updateCaptionTextFromFile", filePath)),
    );
  },
  async findAppliedCaptions() {
    return wrap(() => evalTS("findAppliedCaptions"));
  },
  async loadCaptionsFromTimeline() {
    return wrap(() => evalTS("loadCaptionsFromTimeline"));
  },
  async getSystemFonts() {
    return wrap(() => evalTS("getSystemFonts"));
  },
  async saveSessionData(payload: unknown) {
    return wrap(() => evalTS("saveSessionData", payload as any));
  },
  async applyStyleProject(payload: unknown) {
    return wrap(() => evalTS("applyStyleProject", payload as any));
  },
  async applyCaptionStyleValues(payload: unknown) {
    return wrap(() => evalTS("applyCaptionStyleValues", payload as any));
  },
  async importMedia(filePath: string, destination: string, duration: number) {
    return wrap(() => evalTS("importMedia", filePath, destination, duration));
  },
  async importVoiceoverAudio(filePath: string, destination: string, duration: number) {
    return wrap(() => evalTS("importVoiceoverAudio", filePath, destination, duration));
  },
  async applyPackItem(payload: ApplyPackItemPayload): Promise<MfResult<ApplyPackItemResult>> {
    return wrap(() => evalTS("applyPackItem", payload));
  },
};
