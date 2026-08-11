import {
  findClipNearPosition,
  findFreeAudioTrack,
  findFreeVideoTrack,
  fitClipScaleToSeq,
} from "./ppro-utils";

export type ApplyPackItemPayload = {
  ctype: "PROJECT" | "MOGRT" | "AUDIO" | "FOOTAGE";
  filePath: string;
  itemName: string;
  binName: string;
  /** Unused on Premiere — kept so the AE/PR signatures match for evalTS typing. */
  compName?: string;
  /** Clip length in seconds for free-track search (from pack `duration_ticks`). */
  durationSeconds?: number;
};

export type ApplyPackItemResult =
  | { applied: true; ctype: string }
  | { applied: false; reason: string };

const DEFAULT_PLACE_DURATION_SEC = 5;

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

/**
 * Apply a resolved pack item file to the current project / active sequence.
 * Video/audio placement uses the same free-track search as Beta transitions
 * (`setPlacesForTracks`) — lowest free track at the playhead, not a forced top track.
 * MOGRT / FOOTAGE are scaled to cover the active sequence (Beta `fitClipScaleToSeq`).
 */
export const applyPackItem = (payload: ApplyPackItemPayload): ApplyPackItemResult => {
  try {
    const { ctype, filePath, itemName, binName } = payload;
    if (!new File(filePath).exists) {
      return { applied: false, reason: "SOURCE_MISSING" };
    }

    const seq = app.project.activeSequence;
    const durationSeconds =
      typeof payload.durationSeconds === "number" && payload.durationSeconds > 0
        ? payload.durationSeconds
        : DEFAULT_PLACE_DURATION_SEC;

    if (ctype === "MOGRT") {
      if (!seq) return { applied: false, reason: "NO_ACTIVE_SEQUENCE" };
      const position = seq.getPlayerPosition();
      const trackIndex = findFreeVideoTrack(seq, position.seconds, durationSeconds, 1);
      const trackItem = seq.importMGT(filePath, position.ticks, trackIndex, 0);
      if (!trackItem) return { applied: false, reason: "IMPORT_FAILED" };
      try {
        trackItem.name = itemName;
      } catch (e) {
        // cosmetic only
      }
      fitClipScaleToSeq(trackItem, seq);
      return { applied: true, ctype };
    }

    // PROJECT / AUDIO / FOOTAGE: import into the project, then (if a sequence
    // is open) place on the lowest free track at the playhead.
    const bin = getOrCreateBin(binName);
    const fileName = fileNameOf(filePath);
    let imported = findImportedItemByName(bin, fileName);
    if (!imported) {
      app.project.importFiles([filePath], true, bin, false);
      imported = findImportedItemByName(bin, fileName);
    }
    if (!imported) return { applied: false, reason: "IMPORT_FAILED" };

    if (!seq) {
      return { applied: true, ctype };
    }

    const position = seq.getPlayerPosition().seconds;
    try {
      if (ctype === "AUDIO") {
        const audioTrackIndex = findFreeAudioTrack(seq, position, durationSeconds);
        seq.audioTracks[audioTrackIndex].overwriteClip(imported, position);
      } else {
        const videoTrackIndex = findFreeVideoTrack(seq, position, durationSeconds, 1);
        seq.videoTracks[videoTrackIndex].overwriteClip(imported, position);
        if (ctype === "FOOTAGE" || ctype === "PROJECT") {
          const placed = findClipNearPosition(
            seq.videoTracks[videoTrackIndex],
            position,
            imported.name,
          );
          if (placed) fitClipScaleToSeq(placed, seq);
        }
      }
    } catch (e: any) {
      // Imported into the project either way — surface a softer failure.
      return { applied: false, reason: e && e.message ? e.message : "PLACE_FAILED" };
    }

    return { applied: true, ctype };
  } catch (e: any) {
    return { applied: false, reason: e && e.message ? e.message : String(e) };
  }
};
