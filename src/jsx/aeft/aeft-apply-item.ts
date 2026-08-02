export type ApplyPackItemPayload = {
  ctype: "PROJECT" | "MOGRT" | "AUDIO" | "FOOTAGE";
  filePath: string;
  itemName: string;
  binName: string;
  /** Name of the comp to look for inside an imported `.aep` (PROJECT only). */
  compName?: string;
};

export type ApplyPackItemResult =
  | { applied: true; ctype: string }
  | { applied: false; reason: string };

const getOrCreateFolder = (name: string): FolderItem => {
  for (let i = 1; i <= app.project.rootFolder.numItems; i++) {
    const item = app.project.rootFolder.item(i);
    if (item instanceof FolderItem && item.name === name) return item;
  }
  const created = app.project.items.addFolder(name);
  created.parentFolder = app.project.rootFolder;
  return created;
};

const findChildByName = (folder: FolderItem, name: string): _ItemClasses | null => {
  for (let i = 1; i <= folder.numItems; i++) {
    if (folder.item(i).name === name) return folder.item(i);
  }
  return null;
};

const findCompRecursive = (folder: FolderItem, name?: string): CompItem | null => {
  let firstComp: CompItem | null = null;
  for (let i = 1; i <= folder.numItems; i++) {
    const item = folder.item(i);
    if (item instanceof CompItem) {
      if (!firstComp) firstComp = item;
      if (name && item.name === name) return item;
    } else if (item instanceof FolderItem) {
      const found = findCompRecursive(item, name);
      if (found) {
        if (name && found.name === name) return found;
        if (!firstComp) firstComp = found;
      }
    }
  }
  return name ? null : firstComp;
};

/**
 * Apply a resolved (already decrypted) pack item file to the AE project /
 * active composition.
 */
export const applyPackItem = (payload: ApplyPackItemPayload): ApplyPackItemResult => {
  try {
    const { ctype, filePath, itemName, binName, compName } = payload;
    const file = new File(filePath);
    if (!file.exists) return { applied: false, reason: "SOURCE_MISSING" };

    if (ctype === "PROJECT") {
      let comp = findCompRecursive(app.project.rootFolder, compName || itemName);
      if (!comp) {
        try {
          app.project.importFile(new ImportOptions(file));
        } catch (e: any) {
          return { applied: false, reason: e && e.message ? e.message : "IMPORT_FAILED" };
        }
        comp =
          findCompRecursive(app.project.rootFolder, compName || itemName) ||
          findCompRecursive(app.project.rootFolder);
      }
      if (!comp) return { applied: false, reason: "IMPORT_FAILED" };

      const activeItem = app.project.activeItem;
      if (activeItem instanceof CompItem && activeItem.id !== comp.id) {
        activeItem.layers.add(comp);
      }
      return { applied: true, ctype };
    }

    if (ctype === "MOGRT") {
      return { applied: false, reason: "MOGRT_NOT_SUPPORTED_IN_AE" };
    }

    // AUDIO / FOOTAGE
    const folder = getOrCreateFolder(binName);
    let imported = findChildByName(folder, file.name);
    if (!imported) {
      try {
        const importOptions = new ImportOptions(file);
        imported = app.project.importFile(importOptions);
        imported.parentFolder = folder;
      } catch (e: any) {
        return { applied: false, reason: e && e.message ? e.message : "IMPORT_FAILED" };
      }
    }

    const activeItem = app.project.activeItem;
    if (activeItem instanceof CompItem) {
      activeItem.layers.add(imported as AVItem);
    }

    return { applied: true, ctype };
  } catch (e: any) {
    return { applied: false, reason: e && e.message ? e.message : String(e) };
  }
};
