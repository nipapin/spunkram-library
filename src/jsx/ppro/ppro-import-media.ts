const GAL_TOOLKIT_MAX_STOCK_ASSETS = "Spunkram Stock Assets";

const getStockFolderByName = (folder: ProjectItem, name: string): ProjectItem => {
  for (let i = 0; i < folder.children.numItems; i++) {
    const item = folder.children[i];
    if (item.name === name && item.type === ProjectItemType.BIN) {
      return item;
    }
  }

  const newFolder = folder.createBin(name);
  return newFolder;
};

const isStockFreeAtPosition = (
  track: Track,
  position: number,
  duration: number,
): boolean => {
  const numClips = track.clips.numItems;
  if (numClips === 0) return true;

  const end = position + duration;

  for (let i = 0; i < numClips; i++) {
    const clipStart = track.clips[i].start.seconds;
    const clipEnd = track.clips[i].end.seconds;
    if (clipStart < end && clipEnd > position) return false;
  }

  return true;
};

const getStockFreeTrack = (
  sequence: Sequence,
  position: number,
  duration: number,
): { videoTrack: number; audioTrack: number } => {
  for (let i = 0; i < sequence.videoTracks.numTracks; i++) {
    if (isStockFreeAtPosition(sequence.videoTracks[i], position, duration)) {
      return {
        videoTrack: i,
        audioTrack: Math.min(i, sequence.audioTracks.numTracks - 1),
      };
    }
  }

  app.enableQE();
  const qeSequence = qe!.project.getActiveSequence();
  const videoIdx = sequence.videoTracks.numTracks;
  const audioIdx = sequence.audioTracks.numTracks;
  qeSequence.addTracks(1, videoIdx, 1, 1, audioIdx);

  return { videoTrack: videoIdx, audioTrack: audioIdx };
};

const getStockFileName = (url: string): string => {
  var sepIdx = -1;
  for (var k = url.length - 1; k >= 0; k--) {
    if (url[k] === "/" || url[k] === "\\") {
      sepIdx = k;
      break;
    }
  }
  return sepIdx >= 0 ? url.substring(sepIdx + 1) : url;
};

const findStockItemByPath = (folder: ProjectItem, url: string): ProjectItem | null => {
  const fileName = getStockFileName(url);
  for (let i = 0; i < folder.children.numItems; i++) {
    if (folder.children[i].name === fileName) return folder.children[i];
  }
  return null;
};

const importStockByDestination: Record<
  string,
  (url: string, duration: number) => void
> = {
  project: (url: string, _duration: number) => {
    const assetsFolder = getStockFolderByName(
      app.project.rootItem,
      GAL_TOOLKIT_MAX_STOCK_ASSETS,
    );
    if (!findStockItemByPath(assetsFolder, url)) {
      app.project.importFiles([url], true, assetsFolder, false);
    }
  },
  timeline: (url: string, duration: number) => {
    const assetsFolder = getStockFolderByName(
      app.project.rootItem,
      GAL_TOOLKIT_MAX_STOCK_ASSETS,
    );

    let importedItem = findStockItemByPath(assetsFolder, url);

    if (!importedItem) {
      app.project.importFiles([url], true, assetsFolder, false);
      importedItem = findStockItemByPath(assetsFolder, url);
    }

    if (!importedItem) {
      alert("No imported item found");
      return;
    }

    const activeSequence = app.project.activeSequence;
    if (!activeSequence) {
      alert("No active sequence found");
      return;
    }

    const playerPosition = activeSequence.getPlayerPosition();
    const { videoTrack } = getStockFreeTrack(
      activeSequence,
      playerPosition.seconds,
      duration,
    );

    activeSequence.videoTracks[videoTrack].overwriteClip(
      importedItem,
      playerPosition.seconds,
    );
  },
};

export const importMedia = (
  url: string,
  destination: string,
  duration: number,
) => {
  if (destination === "project") {
    importStockByDestination.project(url, duration);
  } else {
    importStockByDestination.timeline(url, duration);
  }
};

const VOICEOVER_BIN = "Spunkram Voiceover";

const isAudioTrackFree = (
  track: Track,
  position: number,
  duration: number,
): boolean => {
  const end = position + Math.max(0.1, duration);
  for (let i = 0; i < track.clips.numItems; i++) {
    const clipStart = track.clips[i].start.seconds;
    const clipEnd = track.clips[i].end.seconds;
    if (clipStart < end && clipEnd > position) return false;
  }
  return true;
};

const findFreeAudioTrack = (
  sequence: Sequence,
  position: number,
  duration: number,
): number => {
  for (let i = 0; i < sequence.audioTracks.numTracks; i++) {
    if (isAudioTrackFree(sequence.audioTracks[i], position, duration)) return i;
  }
  try {
    app.enableQE();
    const qeSequence = qe!.project.getActiveSequence();
    const audioIdx = sequence.audioTracks.numTracks;
    qeSequence.addTracks(0, 0, 1, 1, audioIdx);
    return audioIdx;
  } catch (e) {
    return Math.max(0, sequence.audioTracks.numTracks - 1);
  }
};

/**
 * Import a generated voiceover audio file into the project and optionally
 * place it on the active sequence at the playhead.
 */
export const importVoiceoverAudio = (
  filePath: string,
  destination: "project" | "timeline",
  duration = 1,
): { ok: boolean; reason?: string } => {
  try {
    if (!filePath) return { ok: false, reason: "NO_FILE" };
    const assetsFolder = getStockFolderByName(app.project.rootItem, VOICEOVER_BIN);
    let importedItem = findStockItemByPath(assetsFolder, filePath);
    if (!importedItem) {
      app.project.importFiles([filePath], true, assetsFolder, false);
      importedItem = findStockItemByPath(assetsFolder, filePath);
    }
    if (!importedItem) return { ok: false, reason: "IMPORT_FAILED" };
    if (destination === "project") return { ok: true };

    const activeSequence = app.project.activeSequence;
    if (!activeSequence) return { ok: false, reason: "NO_ACTIVE_SEQUENCE" };
    const playerPosition = activeSequence.getPlayerPosition();
    const audioTrack = findFreeAudioTrack(
      activeSequence,
      playerPosition.seconds,
      duration,
    );
    activeSequence.audioTracks[audioTrack].overwriteClip(
      importedItem,
      playerPosition.seconds,
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
};
