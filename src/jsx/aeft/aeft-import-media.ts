const GAL_TOOLKIT_MAX_STOCK_ASSETS = "Spunkram Stock Assets";

const getStockFolderByName = (parent: FolderItem, name: string): FolderItem => {
  for (let i = 1; i <= parent.numItems; i++) {
    const item = parent.item(i);
    if (item.name === name && item instanceof FolderItem) {
      return item;
    }
  }
  const newFolder = app.project.items.addFolder(name);
  newFolder.parentFolder = parent;
  return newFolder;
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

const findStockItemByPath = (
  folder: FolderItem,
  url: string,
): _ItemClasses | null => {
  const fileName = getStockFileName(url);
  for (let i = 1; i <= folder.numItems; i++) {
    if (folder.item(i).name === fileName) return folder.item(i);
  }
  return null;
};

const importStockFileToFolder = (url: string, folder: FolderItem): _ItemClasses => {
  const importOptions = new ImportOptions(new File(url));
  const imported = app.project.importFile(importOptions);
  imported.parentFolder = folder;
  return imported;
};

const importStockByDestination: Record<
  string,
  (url: string, duration: number) => void
> = {
  project: (url: string, _duration: number) => {
    const assetsFolder = getStockFolderByName(
      app.project.rootFolder,
      GAL_TOOLKIT_MAX_STOCK_ASSETS,
    );
    if (!findStockItemByPath(assetsFolder, url)) {
      importStockFileToFolder(url, assetsFolder);
    }
  },
  timeline: (url: string, _duration: number) => {
    const assetsFolder = getStockFolderByName(
      app.project.rootFolder,
      GAL_TOOLKIT_MAX_STOCK_ASSETS,
    );

    let importedItem = findStockItemByPath(assetsFolder, url);

    if (!importedItem) {
      importedItem = importStockFileToFolder(url, assetsFolder);
    }

    const activeComp = app.project.activeItem;
    if (!(activeComp instanceof CompItem)) {
      alert("No active composition found");
      return;
    }

    activeComp.layers.add(importedItem as AVItem);
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

const VOICEOVER_FOLDER = "Spunkram Voiceover";

/**
 * Import a generated voiceover audio file into the AE project and optionally
 * add it as a layer on the active composition at the playhead.
 */
export const importVoiceoverAudio = (
  filePath: string,
  destination: "project" | "timeline",
  _duration = 1,
): { ok: boolean; reason?: string } => {
  try {
    if (!filePath) return { ok: false, reason: "NO_FILE" };
    // Normalize separators — AE File() is happier with forward slashes on Windows.
    const normalized = String(filePath).replace(/\\/g, "/");
    const file = new File(normalized);
    if (!file.exists) {
      return { ok: false, reason: "SOURCE_MISSING" };
    }

    const assetsFolder = getStockFolderByName(
      app.project.rootFolder,
      VOICEOVER_FOLDER,
    );
    let importedItem = findStockItemByPath(assetsFolder, normalized);
    if (!importedItem) {
      const importOptions = new ImportOptions(file);
      try {
        if (importOptions.canImportAs(ImportAsType.FOOTAGE)) {
          importOptions.importAs = ImportAsType.FOOTAGE;
        }
      } catch (eOpts) {
        // older AE — ImportAsType may differ
      }
      importedItem = app.project.importFile(importOptions);
      if (importedItem) importedItem.parentFolder = assetsFolder;
    }
    if (!importedItem) return { ok: false, reason: "IMPORT_FAILED" };
    if (destination === "project") return { ok: true };

    const activeComp = app.project.activeItem;
    if (!(activeComp instanceof CompItem)) {
      return { ok: false, reason: "NO_ACTIVE_COMP" };
    }
    const layer = activeComp.layers.add(importedItem as AVItem);
    try {
      layer.startTime = activeComp.time;
    } catch (e) {
      // ignore
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  }
};
