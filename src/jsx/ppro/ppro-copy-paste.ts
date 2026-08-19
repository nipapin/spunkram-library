/**
 * Premiere FULL_PROJECT copy/paste — TS port of `$._copyPasteSystem` (legacy pp_composer).
 * Phase 5: non-DLL helpers first; DLL-backed ops stay on legacy until ported.
 */

/** Project bin root name — legacy parity with pp_composer.jsx. */
const ASSETS_FOLDER_NAME = "Spunkram";

type CopyPasteState = {
  appPrefs: Record<string, unknown>;
  authorFolder?: ProjectItem;
  adjusmentsFolder?: ProjectItem;
  insertionBin?: ProjectItem;
};

const state: CopyPasteState = { appPrefs: {} };

const compareStrings = (a: string, b: string): boolean =>
  String(a).toLowerCase() === String(b).toLowerCase();

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

export const copyPasteGetSelectedItem = (
  presetName: string,
): { sequenceID: string | null } => {
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
  return { ok: true, status: "STRUCTURE_CREATED" };
};
