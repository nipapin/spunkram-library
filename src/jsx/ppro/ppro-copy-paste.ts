/**
 * Premiere FULL_PROJECT copy/paste — TS port of legacy `$._copyPasteSystem` (pp_composer.jsx).
 * Native `Motionflow.dll` stays shipped under extension `bin/`; only orchestration moves here.
 */

/** Project bin root name — legacy parity with pp_composer.jsx. */
const ASSETS_FOLDER_NAME = "Spunkram";
const TICKS_PER_SECONDS = 254016000000;
const isWin = $.os.indexOf("Windows") !== -1;

type PresetSize = {
  width: { video: number; audio: number };
  height: { video: number; audio: number };
  startOffset: number;
};

type TrackTargets = {
  videoTrackIndex: number;
  audioTrackIndex: number;
};

type CopyPasteState = {
  appPrefs: Record<string, unknown>;
  authorFolder?: ProjectItem;
  adjusmentsFolder?: ProjectItem;
  insertionBin?: ProjectItem;
  externalLibrary: ExternalObject | null;
  overrideStartTrack: number;
  tracksTargeting: { video: boolean[]; audio: boolean[] };
  locks: { video: boolean[]; audio: boolean[] };
};

const state: CopyPasteState = {
  appPrefs: {},
  externalLibrary: null,
  overrideStartTrack: -1,
  tracksTargeting: { video: [], audio: [] },
  locks: { video: [], audio: [] },
};

const compareStrings = (a: string, b: string): boolean => {
  const prepareA = String(a)
    .toLowerCase()
    .replace(/^\s+|\s+$/g, "");
  const prepareB = String(b)
    .toLowerCase()
    .replace(/^\s+|\s+$/g, "");
  return prepareA === prepareB;
};

const saveAppPrefs = (): void => {
  state.appPrefs = {
    "BE.Prefs.General.MetadataPropertyLinking": app.properties.getProperty(
      "BE.Prefs.General.MetadataPropertyLinking",
    ),
    "ImportProjectDialog.CreateFolderState": app.properties.getProperty(
      "ImportProjectDialog.CreateFolderState",
    ),
    "BE.Project.CreateDupesOnImportPropertyKey": app.properties.getProperty(
      "BE.Project.CreateDupesOnImportPropertyKey",
    ),
  };
};

const setAppPrefs = (): void => {
  app.properties.setProperty("BE.Prefs.General.MetadataPropertyLinking", true, false, true);
  app.properties.setProperty("ImportProjectDialog.CreateFolderState", false, false, true);
  app.properties.setProperty("BE.Project.CreateDupesOnImportPropertyKey", true, false, true);
};

const restoreAppPrefs = (): void => {
  app.properties.setProperty(
    "BE.Prefs.General.MetadataPropertyLinking",
    state.appPrefs["BE.Prefs.General.MetadataPropertyLinking"],
    false,
    true,
  );
  app.properties.setProperty(
    "ImportProjectDialog.CreateFolderState",
    state.appPrefs["ImportProjectDialog.CreateFolderState"],
    false,
    true,
  );
  app.properties.setProperty(
    "BE.Project.CreateDupesOnImportPropertyKey",
    state.appPrefs["BE.Project.CreateDupesOnImportPropertyKey"],
    false,
    true,
  );
};

const getAuthorFolder = (): void => {
  const root = app.project.rootItem;
  let found = false;
  for (let i = 0; i < root.children.numItems; i++) {
    const atom = root.children[i];
    if (atom.name === ASSETS_FOLDER_NAME && atom.type === ProjectItemType.BIN) {
      state.authorFolder = atom;
      for (let j = 0; j < atom.children.numItems; j++) {
        const child = atom.children[j];
        if (child.name === ASSETS_FOLDER_NAME + " Adjustments") {
          state.adjusmentsFolder = child;
          found = true;
          break;
        }
      }
      if (!found) {
        state.adjusmentsFolder = atom.createBin(ASSETS_FOLDER_NAME + " Adjustments");
      }
      break;
    }
  }
};

const getCutPoint = (markers: Markers): number => {
  if (markers.numMarkers > 0) {
    const first = markers.getFirstMarker();
    if (first) return first.start.seconds;
  }
  return 0;
};

const getPresetSize = (sequence: Sequence): PresetSize => {
  const size: PresetSize = {
    width: { video: 0, audio: 0 },
    height: { video: 0, audio: 0 },
    startOffset: 0,
  };
  let vStart = Infinity;
  let vEnd = -Infinity;
  let aStart = Infinity;
  let aEnd = -Infinity;

  for (let i = 0; i < sequence.videoTracks.numTracks; i++) {
    const track = sequence.videoTracks[i];
    const clips = track.clips;
    if (clips.numItems > 0) {
      size.height.video++;
      for (let j = 0; j < clips.numItems; j++) {
        const clip = clips[j];
        vStart = Math.min(clip.start.seconds, vStart);
        vEnd = Math.max(clip.end.seconds, vEnd);
      }
    }
  }
  for (let i = 0; i < sequence.audioTracks.numTracks; i++) {
    const track = sequence.audioTracks[i];
    const clips = track.clips;
    if (clips.numItems > 0) {
      size.height.audio++;
      for (let j = 0; j < clips.numItems; j++) {
        const clip = clips[j];
        aStart = Math.min(clip.start.seconds, aStart);
        aEnd = Math.max(clip.end.seconds, aEnd);
      }
    }
  }
  size.width.video = vEnd - vStart;
  size.width.audio = aEnd - aStart;
  size.startOffset = Math.min(vStart, aStart);
  return size;
};

const trackIsAvailable = (track: Track, regionStart: number, regionEnd: number): boolean => {
  if (track.isLocked()) return false;
  for (let j = 0; j < track.clips.numItems; j++) {
    const clip = track.clips[j];
    if (clip.start.seconds < regionEnd && clip.end.seconds > regionStart) {
      return false;
    }
  }
  return true;
};

const findFreeTrackIndex = (
  tracks: number,
  size: PresetSize,
  sequence: Sequence,
  type: "video" | "audio",
): number => {
  app.enableQE();
  const regionStart = sequence.getPlayerPosition().seconds;
  const regionEnd = regionStart + size.width[type];
  const isOverrideStartTrack = state.overrideStartTrack > -1;

  let freeTracks = 0;
  let startIndex = type === "video" && isOverrideStartTrack ? state.overrideStartTrack : -1;

  for (let i = 0; i < tracks; i++) {
    const trackCollection = type === "video" ? sequence.videoTracks : sequence.audioTracks;
    if (trackIsAvailable(trackCollection[i], regionStart, regionEnd)) {
      if (startIndex === -1) {
        startIndex = i;
      }
      freeTracks++;

      if (freeTracks === size.height[type]) {
        const result =
          startIndex + (type === "video" && isOverrideStartTrack ? state.overrideStartTrack : 0);
        state.overrideStartTrack = -1;
        return result;
      }
    } else {
      freeTracks = 0;
      startIndex = -1;
    }
  }
  state.overrideStartTrack = -1;
  const tracksToAdd = size.height[type] - freeTracks;

  if (type === "video") {
    qe.project.getActiveSequence().addTracks(tracksToAdd, sequence.videoTracks.numTracks, 0);
  } else {
    qe.project
      .getActiveSequence()
      .addTracks(0, 0, 1, tracksToAdd, sequence.audioTracks.numTracks);
  }

  const trackCollection = type === "video" ? sequence.videoTracks : sequence.audioTracks;
  return trackCollection.numTracks - size.height[type];
};

const findTargetTrackIndex = (sequence: Sequence, size: PresetSize): TrackTargets => ({
  videoTrackIndex: findFreeTrackIndex(sequence.videoTracks.numTracks, size, sequence, "video"),
  audioTrackIndex: findFreeTrackIndex(sequence.audioTracks.numTracks, size, sequence, "audio"),
});

const saveTracksTargeting = (sequence: Sequence, tracks: TrackTargets): void => {
  const targetings = { video: [] as boolean[], audio: [] as boolean[] };
  const locks = { video: [] as boolean[], audio: [] as boolean[] };
  for (let i = 0; i < sequence.videoTracks.numTracks; i++) {
    const track = sequence.videoTracks[i];
    locks.video.push(track.isLocked());
    if (i < tracks.videoTrackIndex) {
      track.setLocked(1);
    }
    targetings.video.push(track.isTargeted());
    track.setTargeted(false, true);
  }
  for (let i = 0; i < sequence.audioTracks.numTracks; i++) {
    const track = sequence.audioTracks[i];
    locks.audio.push(track.isLocked());
    if (i < tracks.audioTrackIndex) {
      track.setLocked(1);
    }
    targetings.audio.push(track.isTargeted());
    track.setTargeted(false, true);
  }
  state.tracksTargeting = targetings;
  state.locks = locks;
};

const restoreTracksTargeting = (sequence: Sequence): void => {
  for (let i = 0; i < sequence.videoTracks.numTracks; i++) {
    const track = sequence.videoTracks[i];
    if (state.tracksTargeting.video[i]) {
      track.setTargeted(state.tracksTargeting.video[i], true);
    }
  }
  for (let i = 0; i < sequence.audioTracks.numTracks; i++) {
    const track = sequence.audioTracks[i];
    if (state.tracksTargeting.audio[i]) {
      track.setTargeted(state.tracksTargeting.audio[i], true);
    }
  }
};

const findAdjustment = (resolution: string): ProjectItem | null => {
  const folder = state.adjusmentsFolder;
  if (!folder) return null;
  for (let i = 0; i < folder.children.numItems; i++) {
    const child = folder.children[i];
    if (child.isAdjustmentLayer() && child.name === resolution) {
      return child;
    }
  }
  return null;
};

const loadAdjustment = (suppressWarnings: boolean): ProjectItem | null => {
  const activeSequence = app.project.activeSequence;
  if (!activeSequence) return null;
  const resolution = [
    activeSequence.frameSizeHorizontal,
    activeSequence.frameSizeVertical,
  ].join("x");
  const adjustment = findAdjustment(resolution);
  if (!adjustment && !suppressWarnings) {
    alert(
      [
        "loadAdjustment:\nAdjustment with resolution",
        resolution,
        " not found\nPlease apply again\nIf the problem persists, please contact support",
      ].join(" "),
    );
  }
  return adjustment;
};

const loadColorMatte = (suppressWarnings: boolean): ProjectItem | null => {
  const activeSequence = app.project.activeSequence;
  if (!activeSequence) return null;
  const resolution = [
    activeSequence.frameSizeHorizontal,
    activeSequence.frameSizeVertical,
  ].join("x");
  const cmName = "cm_" + resolution;
  const folder = state.adjusmentsFolder;
  if (!folder) return null;
  for (let i = 0; i < folder.children.numItems; i++) {
    const child = folder.children[i];
    if (child.name === cmName) {
      return child;
    }
  }
  if (!suppressWarnings) {
    alert(
      [
        "loadAdjustment:\nAdjustment with resolution",
        resolution,
        " not found\nPlease apply again\nIf the problem persists, please contact support",
      ].join(" "),
    );
  }
  return null;
};

const resizeTransition = (): void => {
  const activeSequence = app.project.activeSequence;
  if (!activeSequence) return;
  const selectedClips = activeSequence.getSelection();
  let suppressWarnings = false;
  for (let i = 0; i < selectedClips.length; i++) {
    try {
      const clip = selectedClips[i];
      if (clip.mediaType !== "Video" || !clip.projectItem) continue;
      if (clip.isAdjustmentLayer() && clip.projectItem.isAdjustmentLayer()) {
        const adjustment = loadAdjustment(suppressWarnings);
        if (!adjustment) {
          suppressWarnings = true;
          continue;
        }
        const clipName = clip.name;
        clip.projectItem = adjustment;
        clip.name = clipName;
      }
      if (!clip.isAdjustmentLayer() && clip.projectItem.isAdjustmentLayer()) {
        const colormatte = loadColorMatte(suppressWarnings);
        if (!colormatte) {
          suppressWarnings = true;
          continue;
        }
        const clipName = clip.name;
        clip.projectItem = colormatte;
        clip.name = clipName;
      }
      if (clip.isMGT()) {
        let widthProp: any;
        let heightProp: any;
        for (let j = clip.components.numItems - 1; j >= 0; j--) {
          const component = clip.components[j];
          if (component.matchName !== "AE.ADBE Capsule") continue;
          const props = component.properties;
          for (let k = props.numItems - 1; k >= 0; k--) {
            if (props[k].displayName === "Width") widthProp = props[k];
            if (props[k].displayName === "Height") heightProp = props[k];
          }
        }
        if (widthProp && heightProp) {
          widthProp.setValue(activeSequence.frameSizeHorizontal, true);
          heightProp.setValue(activeSequence.frameSizeVertical, true);
        }
      }
    } catch (e) {
      // non-fatal — legacy parity
    }
  }
};

const findMediaFileRecursive = (
  folder: Folder,
  fileName: string,
  depth: number,
): File | null => {
  if (!folder || !folder.exists || depth > 6) return null;
  const direct = new File(folder.fsName + (isWin ? "\\" : "/") + fileName);
  if (direct.exists) return direct;

  const entries = folder.getFiles();
  if (!entries) return null;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry instanceof Folder) {
      const found = findMediaFileRecursive(entry, fileName, depth + 1);
      if (found) return found;
    } else if (entry instanceof File && entry.name === fileName) {
      return entry;
    }
  }
  return null;
};

const findMissingFootages = (overrideBin?: ProjectItem): ProjectItem[] => {
  const result: ProjectItem[] = [];
  const searchMedia = (projectItem: ProjectItem): void => {
    for (let i = 0; i < projectItem.children.numItems; i++) {
      const child = projectItem.children[i];
      if (
        child.type === ProjectItemType.CLIP &&
        child.isOffline() &&
        !child.isSequence() &&
        !child.isAdjustmentLayer()
      ) {
        result.push(child);
      }
      if (child.type === ProjectItemType.BIN) {
        searchMedia(child);
      }
    }
  };

  const bin = overrideBin || state.insertionBin;
  if (bin) {
    searchMedia(bin);
  }
  return result;
};

const cleanupEmptyAuthorBins = (): void => {
  const author = state.authorFolder;
  if (!author) return;
  for (let i = 0; i < author.children.numItems; i++) {
    const child = author.children[i];
    if (child.type === ProjectItemType.BIN && child.children.numItems === 0) {
      child.deleteBin();
    }
  }
};

// --- Public host exports (evalTS) ---

export const copyPasteGetAppPrefs = (): { version: string; language: string; appPath: string } => {
  app.enableQE();
  const version = String(app.version).split(".")[0];
  const language = String(qe.language);
  return { version, language, appPath: String(app.path) };
};

export const copyPasteCheckForDuplicatesOfAuthorFolder = (): { ok: true } => {
  const root = app.project.rootItem;
  let increment = 1;

  const traverseFolder = (folder: ProjectItem): void => {
    for (let i = 0; i < folder.children.numItems; i++) {
      const child = folder.children[i];
      if (child.type === ProjectItemType.BIN) {
        if (child.name === ASSETS_FOLDER_NAME && folder.type !== ProjectItemType.ROOT) {
          child.name = ASSETS_FOLDER_NAME + " " + increment++;
        }
        if (child.children.numItems > 0) {
          traverseFolder(child);
        }
      }
    }
  };

  traverseFolder(root);
  return { ok: true };
};

export const copyPasteGetMetadata = ():
  | {
      ok: true;
      name: string;
      sequenceID: string;
      resolution: [number, number];
    }
  | { ok: false; reason: string } => {
  getAuthorFolder();
  const sequence = app.project.activeSequence;
  if (!sequence) {
    return { ok: false, reason: "NO_ACTIVE_SEQUENCE" };
  }
  saveAppPrefs();
  setAppPrefs();
  return {
    ok: true,
    name: sequence.name,
    sequenceID: sequence.sequenceID,
    resolution: [sequence.frameSizeHorizontal, sequence.frameSizeVertical],
  };
};

export const copyPasteIsSelectedItemExists = (presetName: string): { exists: boolean } => {
  for (let i = 0; i < app.project.sequences.numSequences; i++) {
    if (compareStrings(app.project.sequences[i].name, presetName)) {
      return { exists: true };
    }
  }
  return { exists: false };
};

export const copyPasteGetSelectedItem = (presetName: string): { sequenceID: string | null } => {
  for (let i = 0; i < app.project.sequences.numSequences; i++) {
    if (compareStrings(app.project.sequences[i].name, presetName)) {
      return { sequenceID: app.project.sequences[i].sequenceID };
    }
  }
  return { sequenceID: null };
};

export const copyPasteIsResolutionExists = (resolution: string): { exists: boolean } => {
  if (!state.adjusmentsFolder) {
    getAuthorFolder();
  }
  const folder = state.adjusmentsFolder;
  if (!folder) return { exists: false };
  for (let i = 0; i < folder.children.numItems; i++) {
    if (folder.children[i].name === resolution) {
      return { exists: true };
    }
  }
  return { exists: false };
};

export const copyPasteCreateStructure = (payload: {
  packName: string;
  groups: string[];
}): { ok: true; status: string } => {
  const treePath = [ASSETS_FOLDER_NAME, payload.packName].concat(payload.groups || []);

  let parentFolder: ProjectItem = app.project.rootItem;
  let lastFolder: ProjectItem | null = null;

  for (let i = 0; i < treePath.length; i++) {
    const folderName = treePath[i];
    let found = false;
    for (let j = 0; j < parentFolder.children.numItems; j++) {
      const child = parentFolder.children[j];
      if (child && child.type === ProjectItemType.BIN && child.name === folderName) {
        parentFolder = child;
        lastFolder = child;
        found = true;
        break;
      }
    }
    if (!found) {
      const newFolder = parentFolder.createBin(folderName);
      parentFolder = newFolder;
      lastFolder = newFolder;
    }
  }

  if (lastFolder) {
    state.insertionBin = lastFolder;
  }
  getAuthorFolder();
  return { ok: true, status: "STRUCTURE_CREATED" };
};

export const copyPasteInitializeLibrary = (
  libraryBasePath: string,
  platform: string,
): { ready: boolean; reused?: boolean; error?: string } => {
  try {
    if (state.externalLibrary) {
      return { ready: true, reused: true };
    }
    const ext = platform === "win" ? ".dll" : ".bundle";
    const libPath =
      platform === "win"
        ? [libraryBasePath, "bin", platform, "Motionflow" + ext].join("/")
        : [libraryBasePath, "Motionflow" + ext].join("/");
    state.externalLibrary = new ExternalObject("lib:" + libPath);
    return { ready: true };
  } catch (err: any) {
    return {
      ready: false,
      error: [err.message, err.line].join("\n"),
    };
  }
};

export const copyPasteExecuteCommand = (command: string): { ok: true } => {
  app.enableQE();
  qe.project.getActiveSequence().makeCurrent();
  if (!state.externalLibrary) {
    throw new Error("Motionflow library not initialized");
  }
  state.externalLibrary.execute(command);
  return { ok: true };
};

export const copyPasteImportSelectedItem = (projectPath: string): { ok: true; status: string } => {
  try {
    saveAppPrefs();
    setAppPrefs();
    getAuthorFolder();
    if (!state.insertionBin) {
      throw new Error("Insertion bin not set — call copyPasteCreateStructure first");
    }
    app.project.importFiles([projectPath], true, state.insertionBin, false);
    return { ok: true, status: "Project imported" };
  } finally {
    restoreAppPrefs();
  }
};

export const copyPasteResolveMissingFootages = (
  assetsPath: string,
  presetName: string,
): { ok: true; status: string } => {
  try {
    getAuthorFolder();
  } catch {
    /* optional */
  }

  let footages = findMissingFootages();
  if (!footages.length && state.authorFolder) {
    footages = findMissingFootages(state.authorFolder);
  }
  if (!assetsPath) {
    return { ok: true, status: "NO_ASSETS_PATH" };
  }

  let assetsFolder = new Folder(assetsPath);
  if (!assetsFolder.exists) {
    assetsFolder = new Folder(String(assetsPath).replace(/\//g, isWin ? "\\" : "/"));
  }
  if (!assetsFolder.exists) {
    return { ok: true, status: "ASSETS_MISSING:" + assetsPath };
  }

  let resolved = 0;
  for (let i = 0; i < footages.length; i++) {
    const footage = footages[i];
    let footageName = "";
    try {
      const footageMedia = footage.getMediaPath();
      if (footageMedia) {
        const footageSeparate = footageMedia.indexOf("\\") > -1 ? "\\" : "/";
        footageName = footageMedia.split(footageSeparate).pop() || "";
      }
    } catch {
      /* ignore */
    }
    if (!footageName && footage.name) {
      footageName = footage.name;
    }
    if (!footageName) continue;

    const targetFile = findMediaFileRecursive(assetsFolder, footageName, 0);
    if (!targetFile || !targetFile.exists) continue;

    const targetPath = targetFile.fsName;
    try {
      if (footage.canChangeMediaPath()) {
        footage.changeMediaPath(targetPath);
        resolved++;
      }
    } catch {
      /* ignore */
    }

    if (
      footageName.indexOf(".aegraphic") !== -1 &&
      presetName &&
      footageName.indexOf(presetName) !== -1
    ) {
      try {
        footage.changeMediaPath(targetPath, true);
      } catch {
        /* ignore */
      }
    }
  }
  return { ok: true, status: "RESOLVED:" + resolved + "/" + footages.length };
};

export const copyPasteImportAdjustmentSequence = (
  ptxPath: string,
  resolution: string,
): { ok: true; status: string } | { ok: false; error: string } => {
  try {
    getAuthorFolder();
    if (!state.adjusmentsFolder) {
      return { ok: true, status: "Adjustment folder not found." };
    }
    for (let i = 0; i < state.adjusmentsFolder.children.numItems; i++) {
      if (state.adjusmentsFolder.children[i].name === resolution) {
        return { ok: true, status: "Already Exist" };
      }
    }

    const sequenceStore: Record<string, boolean> = {};
    for (let i = 0; i < app.project.sequences.numSequences; i++) {
      sequenceStore[app.project.sequences[i].sequenceID] = true;
    }

    saveAppPrefs();
    setAppPrefs();

    app.project.importFiles(
      [ptxPath + resolution + ".prproj"],
      true,
      state.adjusmentsFolder,
      false,
    );
    restoreAppPrefs();

    let importedSequence: Sequence | null = null;
    for (let i = 0; i < app.project.sequences.numSequences; i++) {
      if (!sequenceStore[app.project.sequences[i].sequenceID]) {
        importedSequence = app.project.sequences[i];
        break;
      }
    }

    if (!importedSequence) {
      throw new Error(
        "Adjustment sequence was not imported. If the problem persists, please contact support",
      );
    }

    const importedAdjustment = importedSequence.videoTracks[0].clips[0].projectItem;
    if (!importedAdjustment) {
      throw new Error(
        "Adjustment sequence was not imported. If the problem persists, please contact support",
      );
    }

    importedAdjustment.name = resolution;
    importedAdjustment.moveBin(state.adjusmentsFolder);
    app.project.deleteSequence(importedSequence);
    cleanupEmptyAuthorBins();
    return { ok: true, status: "Imported adjustment sequence" };
  } catch (err: any) {
    return { ok: false, error: String(err.message || err) };
  }
};

export const copyPasteImportColorMatteSequence = (
  ptxPath: string,
  resolution: string,
): { ok: true; status: string } | { ok: false; error: string } => {
  try {
    const cmName = "cm_" + resolution;
    getAuthorFolder();
    if (!state.adjusmentsFolder) {
      return { ok: true, status: "Adjustment folder not found." };
    }
    for (let i = 0; i < state.adjusmentsFolder.children.numItems; i++) {
      if (state.adjusmentsFolder.children[i].name === cmName) {
        return { ok: true, status: "Already Exist" };
      }
    }

    const sequenceStore: Record<string, boolean> = {};
    for (let i = 0; i < app.project.sequences.numSequences; i++) {
      sequenceStore[app.project.sequences[i].sequenceID] = true;
    }

    saveAppPrefs();
    setAppPrefs();
    app.project.importFiles([ptxPath + cmName + ".prproj"], true, state.adjusmentsFolder, false);
    restoreAppPrefs();

    let importedSequence: Sequence | null = null;
    for (let i = 0; i < app.project.sequences.numSequences; i++) {
      if (!sequenceStore[app.project.sequences[i].sequenceID]) {
        importedSequence = app.project.sequences[i];
        break;
      }
    }

    if (!importedSequence) {
      throw new Error(
        "Color Matte sequence was not imported. If the problem persists, please contact support",
      );
    }

    const importedAdjustment = importedSequence.videoTracks[0].clips[0].projectItem;
    if (!importedAdjustment) {
      throw new Error(
        "Color Matte sequence was not imported. If the problem persists, please contact support",
      );
    }

    importedAdjustment.name = cmName;
    importedAdjustment.moveBin(state.adjusmentsFolder);
    app.project.deleteSequence(importedSequence);
    cleanupEmptyAuthorBins();
    return { ok: true, status: "Imported color matte sequence" };
  } catch (err: any) {
    return { ok: false, error: String(err.message || err) };
  }
};

export const copyPasteCollectClipsPreset = (presetSequenceID: string): { ok: true } => {
  app.enableQE();
  app.project.openSequence(presetSequenceID);
  const qePresetSequence = qe.project.getActiveSequence();
  const presetSequence = app.project.activeSequence;
  if (!presetSequence) {
    throw new Error("Preset sequence not found");
  }
  qePresetSequence.removeEmptyVideoTracks();
  const clips: TrackItem[] = [];
  for (let i = 0; i < presetSequence.videoTracks.numTracks; i++) {
    const track = presetSequence.videoTracks[i];
    for (let j = 0; j < track.clips.numItems; j++) {
      clips.push(track.clips[j]);
    }
  }
  for (let i = 0; i < presetSequence.audioTracks.numTracks; i++) {
    const track = presetSequence.audioTracks[i];
    for (let j = 0; j < track.clips.numItems; j++) {
      clips.push(track.clips[j]);
    }
  }
  qePresetSequence.makeCurrent();
  presetSequence.setSelection(clips);
  return { ok: true };
};

export const copyPastePrepareToPastePreset = (
  sequenceID: string,
):
  | { ok: true; tracks: TrackTargets; savePlayerPosition: string }
  | { ok: false; error: string } => {
  try {
    app.enableQE();
    const activeBefore = app.project.activeSequence;
    if (!activeBefore) {
      return { ok: false, error: "NO_ACTIVE_SEQUENCE" };
    }
    const presetSize = getPresetSize(activeBefore);
    const cutPoint = getCutPoint(activeBefore.markers);
    activeBefore.close();
    app.project.openSequence(sequenceID);
    const activeSequence = app.project.activeSequence;
    if (!activeSequence) {
      return { ok: false, error: "TARGET_SEQUENCE_NOT_FOUND" };
    }
    const savePlayerPosition = activeSequence.getPlayerPosition();
    const offsetPlayerPosition =
      savePlayerPosition.seconds - cutPoint + presetSize.startOffset;

    const wholePart = Math.floor(offsetPlayerPosition);
    const decimalPart = offsetPlayerPosition - wholePart;
    const a = wholePart * TICKS_PER_SECONDS;
    const b = Math.round(decimalPart * TICKS_PER_SECONDS);
    activeSequence.setPlayerPosition(String(a + b));
    const tracks = findTargetTrackIndex(activeSequence, presetSize);
    saveTracksTargeting(activeSequence, tracks);
    qe.project.getActiveSequence().makeCurrent();
    return {
      ok: true,
      tracks,
      savePlayerPosition: savePlayerPosition.ticks,
    };
  } catch (err: any) {
    return { ok: false, error: String(err.message || err) };
  }
};

export type CopyPasteDetouchArgs = {
  tracks: TrackTargets;
  savePlayerPosition: string;
  resolution: string;
  removeAudio: boolean;
};

export const copyPasteDetouchPreset = (args: CopyPasteDetouchArgs): { ok: true } => {
  const activeSequence = app.project.activeSequence;
  if (!activeSequence) {
    throw new Error("NO_ACTIVE_SEQUENCE");
  }
  const selection = activeSequence.getSelection();
  const adjustment = findAdjustment(args.resolution);
  for (let i = 0; i < selection.length; i++) {
    const item = selection[i];
    if (item.mediaType === "Video" && item.projectItem && item.isAdjustmentLayer() && adjustment) {
      const savename = item.name;
      item.projectItem = adjustment;
      item.name = savename;
    }
    if (item.mediaType === "Audio" && args.removeAudio) {
      item.remove(0, 0);
    }
  }
  for (let i = 0; i < activeSequence.videoTracks.numTracks; i++) {
    activeSequence.videoTracks[i].setLocked(Number(state.locks.video[i]));
  }
  for (let i = 0; i < activeSequence.audioTracks.numTracks; i++) {
    activeSequence.audioTracks[i].setLocked(Number(state.locks.audio[i]));
  }
  activeSequence.setPlayerPosition(args.savePlayerPosition);
  app.enableQE();
  qe.project.getActiveSequence().makeCurrent();
  restoreTracksTargeting(activeSequence);
  resizeTransition();
  return { ok: true };
};
