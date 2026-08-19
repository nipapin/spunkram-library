/**
 * Import user-picked assets into Premiere project bin or active sequence.
 * Port of legacy `external_lib_import.jsx` — uses ppro-utils instead of pp_composer.
 */
import {
  findClipNearPosition,
  findFreeVideoTrack,
  fitClipScaleToSeq,
} from "./ppro-utils";

const EXTERNAL_BIN = "Ex Assets Lib";

export type ImportExternalAssetPayload = {
  typeImportTo: string | number;
  filePath: string;
};

const isTimelineImport = (typeImportTo: string | number): boolean =>
  String(typeImportTo) === "1";

const getFileName = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
};

const findOrCreateBin = (parent: ProjectItem, name: string): ProjectItem => {
  for (let i = 0; i < parent.children.numItems; i++) {
    const item = parent.children[i];
    if (item.name === name && item.type === ProjectItemType.BIN) {
      return item;
    }
  }
  return parent.createBin(name);
};

const findClipInBin = (bin: ProjectItem, fileName: string): ProjectItem | null => {
  for (let i = 0; i < bin.children.numItems; i++) {
    const item = bin.children[i];
    if (item.type === ProjectItemType.CLIP && item.name === fileName) {
      return item;
    }
  }
  return null;
};

export const importExternalAsset = (
  payload: ImportExternalAssetPayload,
): { ok: true; data?: unknown } | { ok: false; reason: string } => {
  try {
    const { typeImportTo, filePath } = payload;
    if (!filePath) return { ok: false, reason: "NO_FILE" };

    const project = app.project;
    const bin = findOrCreateBin(project.rootItem, EXTERNAL_BIN);

    if (!isTimelineImport(typeImportTo)) {
      project.importFiles([filePath], true, bin, false);
      return { ok: true };
    }

    const activeSeq = project.activeSequence;
    if (!activeSeq) {
      return { ok: true, data: "SEQUENCE" };
    }

    project.importFiles([filePath], true, bin, false);
    const fileName = getFileName(filePath);
    const imported = findClipInBin(bin, fileName);
    if (!imported) {
      return { ok: true, data: "SEQUENCE" };
    }

    const position = activeSeq.getPlayerPosition();
    const durationSec = Math.max(
      0.05,
      imported.getOutPoint().seconds - imported.getInPoint().seconds,
    );
    const trackIndex = findFreeVideoTrack(
      activeSeq,
      position.seconds,
      durationSec,
      1,
    );
    activeSeq.videoTracks[trackIndex].insertClip(imported, position);
    imported.select();

    const placed = findClipNearPosition(
      activeSeq.videoTracks[trackIndex],
      position.seconds,
      fileName,
    );
    if (placed) fitClipScaleToSeq(placed, activeSeq);

    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};

/** Legacy `engine.jsx` bridge until engine is removed (phase 3+). */
function installLegacyBridge(): void {
  try {
    // @ts-ignore
    if (typeof $ === "undefined") return;
    // @ts-ignore
    $._AtomExt_externalLibAssetImporter = {
      maskedTransferOnce: (_newValue: string) => {},
      importToAE: () => "NO_SUPPORT_APP",
      importToPR: (typeImportTo: string | number, path: string) => {
        const r = importExternalAsset({ typeImportTo, filePath: path });
        if (!r.ok) return r.reason;
        return r.data;
      },
    };
  } catch {
    // ignore
  }
}

installLegacyBridge();
