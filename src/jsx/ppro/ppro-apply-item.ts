import { ensureTopVideoTrack } from "./ppro-utils";

export type ApplyPackItemPayload = {
  ctype: "PROJECT" | "MOGRT" | "AUDIO" | "FOOTAGE";
  filePath: string;
  itemName: string;
  binName: string;
  /** Unused on Premiere — kept so the AE/PR signatures match for evalTS typing. */
  compName?: string;
};

export type ApplyPackItemResult =
  | { applied: true; ctype: string }
  | { applied: false; reason: string };

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
 * Apply a resolved (already decrypted) pack item file to the current project /
 * active sequence. Standard import + place-on-a-fresh-track — avoids Beta's
 * native helper / clipboard-injection chain, which needs proprietary binaries
 * we can't safely re-verify here.
 */
export const applyPackItem = (payload: ApplyPackItemPayload): ApplyPackItemResult => {
  try {
    const { ctype, filePath, itemName, binName } = payload;
    if (!new File(filePath).exists) {
      return { applied: false, reason: "SOURCE_MISSING" };
    }

    const seq = app.project.activeSequence;

    if (ctype === "MOGRT") {
      if (!seq) return { applied: false, reason: "NO_ACTIVE_SEQUENCE" };
      const trackIndex = ensureTopVideoTrack();
      const startTicks = seq.getPlayerPosition().ticks;
      const trackItem = seq.importMGT(filePath, startTicks, trackIndex, 0);
      if (!trackItem) return { applied: false, reason: "IMPORT_FAILED" };
      try {
        trackItem.name = itemName;
      } catch (e) {
        // cosmetic only
      }
      return { applied: true, ctype };
    }

    // PROJECT / AUDIO / FOOTAGE: import into the project, then (if a sequence
    // is open) drop the result onto a brand-new top track at the playhead.
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
        const audioTrackIndex = Math.max(0, seq.audioTracks.numTracks - 1);
        seq.audioTracks[audioTrackIndex].overwriteClip(imported, position);
      } else {
        const videoTrackIndex = ensureTopVideoTrack();
        seq.videoTracks[videoTrackIndex].overwriteClip(imported, position);
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
