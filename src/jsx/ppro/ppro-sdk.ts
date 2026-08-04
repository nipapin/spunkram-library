/**
 * Premiere Pro SDK host surface — addMogrt, undo groups, import helpers.
 */
import { ensureTopVideoTrack } from "./ppro-utils";
import {
  bindPack,
  setEngine,
  getPackContext,
  getEngine,
  type PackBindContext,
} from "../shared/engine";
import {
  copyPackageToAppData,
  deletePackageFiles,
  type PackCopyTransfer,
} from "../shared/fs";

export { bindPack, setEngine, getPackContext, getEngine };
export type { PackBindContext };

export const mfCopyPackage = (transfer: PackCopyTransfer) => copyPackageToAppData(transfer);
export const mfDeletePackage = (packDir: string) => deletePackageFiles(packDir);

export type AddMogrtOptions = {
  filePath: string;
  itemName?: string;
  trackIndex?: number;
  startTicks?: string;
};

const getOrCreateBin = (name: string): ProjectItem => {
  const root = app.project.rootItem;
  for (let i = 0; i < root.children.numItems; i++) {
    const child = root.children[i];
    if (child.name === name && child.type === ProjectItemType.BIN) return child;
  }
  return root.createBin(name);
};

const fileNameOf = (filePath: string): string => new File(filePath).name;

const findImportedItemByName = (bin: ProjectItem, name: string): ProjectItem | null => {
  for (let i = 0; i < bin.children.numItems; i++) {
    if (bin.children[i].name === name) return bin.children[i];
  }
  return null;
};

/** Import a .mogrt at the playhead on a free/top video track. */
export const addMogrt = (
  opts: AddMogrtOptions,
): { ok: true; trackIndex: number } | { ok: false; reason: string } => {
  try {
    if (!new File(opts.filePath).exists) return { ok: false, reason: "SOURCE_MISSING" };
    const seq = app.project.activeSequence;
    if (!seq) return { ok: false, reason: "NO_ACTIVE_SEQUENCE" };
    const trackIndex =
      typeof opts.trackIndex === "number" ? opts.trackIndex : ensureTopVideoTrack();
    const startTicks =
      opts.startTicks != null ? opts.startTicks : seq.getPlayerPosition().ticks;
    const trackItem = seq.importMGT(opts.filePath, startTicks, trackIndex, 0);
    if (!trackItem) return { ok: false, reason: "IMPORT_FAILED" };
    if (opts.itemName) {
      try {
        trackItem.name = opts.itemName;
      } catch (e) {
        // cosmetic
      }
    }
    return { ok: true, trackIndex };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};

/** Import a Premiere project / sequence file into a bin (PROJECT ctype). */
export const importSequence = (payload: {
  filePath: string;
  binName?: string;
  itemName?: string;
}): { ok: true } | { ok: false; reason: string } => {
  try {
    if (!new File(payload.filePath).exists) return { ok: false, reason: "SOURCE_MISSING" };
    const bin = getOrCreateBin(payload.binName || "Spunkram Assets");
    const fileName = fileNameOf(payload.filePath);
    let imported = findImportedItemByName(bin, fileName);
    if (!imported) {
      app.project.importFiles([payload.filePath], true, bin, false);
      imported = findImportedItemByName(bin, fileName);
    }
    if (!imported) return { ok: false, reason: "IMPORT_FAILED" };
    if (payload.itemName) {
      try {
        imported.name = payload.itemName;
      } catch (e) {
        // ignore
      }
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};

export const importFootage = (payload: {
  filePath: string;
  binName?: string;
  placeOnTimeline?: boolean;
}): { ok: true } | { ok: false; reason: string } => {
  try {
    if (!new File(payload.filePath).exists) return { ok: false, reason: "SOURCE_MISSING" };
    const bin = getOrCreateBin(payload.binName || "Spunkram Assets");
    const fileName = fileNameOf(payload.filePath);
    let imported = findImportedItemByName(bin, fileName);
    if (!imported) {
      app.project.importFiles([payload.filePath], true, bin, false);
      imported = findImportedItemByName(bin, fileName);
    }
    if (!imported) return { ok: false, reason: "IMPORT_FAILED" };
    const seq = app.project.activeSequence;
    if (payload.placeOnTimeline !== false && seq) {
      const videoTrackIndex = ensureTopVideoTrack();
      seq.videoTracks[videoTrackIndex].overwriteClip(imported, seq.getPlayerPosition().seconds);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};

export const importAudio = (payload: {
  filePath: string;
  binName?: string;
  placeOnTimeline?: boolean;
}): { ok: true } | { ok: false; reason: string } => {
  try {
    if (!new File(payload.filePath).exists) return { ok: false, reason: "SOURCE_MISSING" };
    const bin = getOrCreateBin(payload.binName || "Spunkram Assets");
    const fileName = fileNameOf(payload.filePath);
    let imported = findImportedItemByName(bin, fileName);
    if (!imported) {
      app.project.importFiles([payload.filePath], true, bin, false);
      imported = findImportedItemByName(bin, fileName);
    }
    if (!imported) return { ok: false, reason: "IMPORT_FAILED" };
    const seq = app.project.activeSequence;
    if (payload.placeOnTimeline !== false && seq) {
      const audioTrackIndex = Math.max(0, seq.audioTracks.numTracks - 1);
      seq.audioTracks[audioTrackIndex].overwriteClip(imported, seq.getPlayerPosition().seconds);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};

/** Thin undo-group bridge — prefers legacy PremiereUndoGroups when loaded. */
export const undoGroupStart = (): { ok: boolean; status: string } => {
  try {
    // @ts-ignore
    if (typeof PremiereUndoGroups !== "undefined" && PremiereUndoGroups.start) {
      // @ts-ignore
      const status = PremiereUndoGroups.start();
      return { ok: status === "OK", status: String(status) };
    }
    return { ok: false, status: "LEGACY_UNDO_NOT_LOADED" };
  } catch (e: any) {
    return { ok: false, status: e && e.message ? e.message : String(e) };
  }
};

export const undoGroupEnd = (): { ok: boolean; status: string } => {
  try {
    // @ts-ignore
    if (typeof PremiereUndoGroups !== "undefined" && PremiereUndoGroups.end) {
      // @ts-ignore
      const status = PremiereUndoGroups.end();
      return { ok: status === "OK", status: String(status) };
    }
    return { ok: false, status: "LEGACY_UNDO_NOT_LOADED" };
  } catch (e: any) {
    return { ok: false, status: e && e.message ? e.message : String(e) };
  }
};

export const undoGroupAbort = (): { ok: boolean; status: string } => {
  try {
    // @ts-ignore
    if (typeof PremiereUndoGroups !== "undefined" && PremiereUndoGroups.abort) {
      // @ts-ignore
      const status = PremiereUndoGroups.abort();
      return { ok: status === "OK", status: String(status) };
    }
    return { ok: false, status: "LEGACY_UNDO_NOT_LOADED" };
  } catch (e: any) {
    return { ok: false, status: e && e.message ? e.message : String(e) };
  }
};

export const legacyPpCall = (
  method: string,
  argsJson: string,
): { ok: boolean; data?: unknown; reason?: string } => {
  try {
    // @ts-ignore
    const ns = typeof $ !== "undefined" ? $._AtomExt_ppComposer : null;
    if (!ns || typeof ns[method] !== "function") {
      return { ok: false, reason: "LEGACY_PPRO_NOT_LOADED" };
    }
    const args = argsJson ? JSON.parse(argsJson) : [];
    const data = ns[method].apply(ns, args);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};
