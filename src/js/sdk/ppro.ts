import { evalTS } from "../lib/utils/bolt";
import { requireHost } from "./host";
import { wrap } from "./result";
import type {
  AddMogrtOptions,
  ApplyPackItemPayload,
  ApplyPackItemResult,
  MfResult,
} from "./types";

export const PPRO = {
  async addMogrt(opts: AddMogrtOptions): Promise<MfResult<{ trackIndex: number }>> {
    return wrap(async () => {
      requireHost("PPRO");
      const r = await evalTS("addMogrt", opts);
      if (!r || !r.ok) throw new Error((r as any)?.reason || "addMogrt failed");
      return { trackIndex: (r as any).trackIndex };
    });
  },

  async importSequence(payload: {
    filePath: string;
    binName?: string;
    itemName?: string;
  }): Promise<MfResult<void>> {
    return wrap(async () => {
      requireHost("PPRO");
      const r = await evalTS("importSequence", payload);
      if (!r || !r.ok) throw new Error((r as any)?.reason || "importSequence failed");
    });
  },

  async importProject(payload: {
    filePath: string;
    binName?: string;
    itemName?: string;
  }): Promise<MfResult<void>> {
    return this.importSequence(payload);
  },

  async importFootage(payload: {
    filePath: string;
    binName?: string;
    placeOnTimeline?: boolean;
  }): Promise<MfResult<void>> {
    return wrap(async () => {
      requireHost("PPRO");
      const r = await evalTS("importFootage", payload);
      if (!r || !r.ok) throw new Error((r as any)?.reason || "importFootage failed");
    });
  },

  async importAudio(payload: {
    filePath: string;
    binName?: string;
    placeOnTimeline?: boolean;
  }): Promise<MfResult<void>> {
    return wrap(async () => {
      requireHost("PPRO");
      const r = await evalTS("importAudio", payload);
      if (!r || !r.ok) throw new Error((r as any)?.reason || "importAudio failed");
    });
  },

  undoGroup: {
    async start(): Promise<MfResult<{ status: string }>> {
      return wrap(async () => {
        requireHost("PPRO");
        const r = await evalTS("undoGroupStart");
        if (!r?.ok) throw new Error(r?.status || "undo start failed");
        return { status: r.status };
      });
    },
    async end(): Promise<MfResult<{ status: string }>> {
      return wrap(async () => {
        requireHost("PPRO");
        const r = await evalTS("undoGroupEnd");
        if (!r?.ok) throw new Error(r?.status || "undo end failed");
        return { status: r.status };
      });
    },
    async abort(): Promise<MfResult<{ status: string }>> {
      return wrap(async () => {
        requireHost("PPRO");
        const r = await evalTS("undoGroupAbort");
        if (!r?.ok) throw new Error(r?.status || "undo abort failed");
        return { status: r.status };
      });
    },
  },

  customize: {
    async get(insidePackOptions?: unknown): Promise<MfResult<unknown>> {
      return wrap(async () => {
        requireHost("PPRO");
        const r = await evalTS("legacyPpCall", "customizer", JSON.stringify([insidePackOptions]));
        if (!r?.ok) throw new Error(r?.reason || "customize get failed");
        return r.data;
      });
    },
    async set(...args: unknown[]): Promise<MfResult<unknown>> {
      return wrap(async () => {
        requireHost("PPRO");
        const r = await evalTS("legacyPpCall", "setCustomizeChanges", JSON.stringify(args));
        if (!r?.ok) throw new Error(r?.reason || "customize set failed");
        return r.data;
      });
    },
  },

  tools: {
    async run(type: string): Promise<MfResult<unknown>> {
      return wrap(async () => {
        requireHost("PPRO");
        const r = await evalTS("legacyPpCall", "buttonActions", JSON.stringify([type]));
        if (!r?.ok) throw new Error(r?.reason || "tools failed");
        return r.data;
      });
    },
  },

  async describe(audioPresetPath?: string) {
    return wrap(() => evalTS("describe", audioPresetPath));
  },
  async markSilences(data: { ranges: unknown[]; offset: number }) {
    return wrap(() => evalTS("markSilences", data as any));
  },
  async addMarkers(data: { markers: unknown[] }) {
    return wrap(() => evalTS("addMarkers", data as any));
  },
  async getCurrentTime() {
    return wrap(() => evalTS("getCurrentTime"));
  },
  async setCurrentTime(payload: { time: number }) {
    return wrap(() => evalTS("setCurrentTime", payload));
  },
  async createCaptions(payload: unknown) {
    return wrap(() => evalTS("createCaptions", payload as any));
  },
  async resegmentCaptions(payload: unknown) {
    return wrap(() => evalTS("resegmentCaptions", payload as any));
  },
  async updateCaptionText(payload: unknown) {
    return wrap(() => evalTS("updateCaptionText", payload as any));
  },
  async findAppliedCaptions() {
    return wrap(() => evalTS("findAppliedCaptions"));
  },
  async loadCaptionsFromTimeline() {
    return wrap(() => evalTS("loadCaptionsFromTimeline"));
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
