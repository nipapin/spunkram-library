/**
 * Premiere Pro SDK host surface — addMogrt, undo groups, import helpers.
 */
import {
  findClipNearPosition,
  findFreeAudioTrack,
  findFreeVideoTrack,
  fitClipScaleToSeq,
} from "./ppro-utils";
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
import { undoGroupAbort, undoGroupEnd, undoGroupStart } from "./ppro-undo-group";

export { bindPack, setEngine, getPackContext, getEngine };
export type { PackBindContext };

export const mfCopyPackage = (transfer: PackCopyTransfer) => copyPackageToAppData(transfer);
export const mfDeletePackage = (packDir: string) => deletePackageFiles(packDir);

export type AddMogrtOptions = {
  filePath: string;
  itemName?: string;
  trackIndex?: number;
  startTicks?: string;
  /** Seconds for free-track search when `trackIndex` is omitted. */
  durationSeconds?: number;
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

/** Import a .mogrt at the playhead on the lowest free video track (Beta parity). */
export const addMogrt = (
  opts: AddMogrtOptions,
): { ok: true; trackIndex: number } | { ok: false; reason: string } => {
  try {
    if (!new File(opts.filePath).exists) return { ok: false, reason: "SOURCE_MISSING" };
    const seq = app.project.activeSequence;
    if (!seq) return { ok: false, reason: "NO_ACTIVE_SEQUENCE" };
    const position = seq.getPlayerPosition();
    const trackIndex =
      typeof opts.trackIndex === "number"
        ? opts.trackIndex
        : findFreeVideoTrack(
            seq,
            position.seconds,
            typeof opts.durationSeconds === "number" && opts.durationSeconds > 0
              ? opts.durationSeconds
              : 5,
            1,
          );
    const startTicks =
      opts.startTicks != null ? opts.startTicks : position.ticks;
    const trackItem = seq.importMGT(opts.filePath, startTicks, trackIndex, 0);
    if (!trackItem) return { ok: false, reason: "IMPORT_FAILED" };
    if (opts.itemName) {
      try {
        trackItem.name = opts.itemName;
      } catch (e) {
        // cosmetic
      }
    }
    fitClipScaleToSeq(trackItem, seq);
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
      const position = seq.getPlayerPosition().seconds;
      const videoTrackIndex = findFreeVideoTrack(seq, position, 5, 1);
      seq.videoTracks[videoTrackIndex].overwriteClip(imported, position);
      const placed = findClipNearPosition(
        seq.videoTracks[videoTrackIndex],
        position,
        imported.name,
      );
      if (placed) fitClipScaleToSeq(placed, seq);
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
      const position = seq.getPlayerPosition().seconds;
      const audioTrackIndex = findFreeAudioTrack(seq, position, 5);
      seq.audioTracks[audioTrackIndex].overwriteClip(imported, position);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};

export { undoGroupStart, undoGroupEnd, undoGroupAbort };
