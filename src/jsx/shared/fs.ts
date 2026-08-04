/**
 * Shared ExtendScript FS helpers (port of Beta engine.jsx copy/delete utilities).
 * Pure host-side; also available via MotionFlow.packs when wired from JS.
 */

export const createFolderRecursive = (folder: Folder): void => {
  if (folder.parent !== null && !folder.parent.exists) {
    createFolderRecursive(folder.parent);
  }
  if (!folder.exists) folder.create();
};

export const copyFile = (sourceFile: File, destinationFile: File): boolean => {
  createFolderRecursive(destinationFile.parent as Folder);
  return sourceFile.copy(destinationFile);
};

export const copyFolder = (sourceFolder: Folder, destinationFolder: Folder): void => {
  if (!destinationFolder.exists) createFolderRecursive(destinationFolder);
  const children = sourceFolder.getFiles();
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const destPath = destinationFolder.fsName + "/" + child.name;
    if (child instanceof File) {
      copyFile(child, new File(destPath));
    } else if (child instanceof Folder) {
      copyFolder(child, new Folder(destPath));
    }
  }
};

export const deleteFolderRecursive = (folder: Folder): void => {
  if (!folder.exists) return;
  const children = folder.getFiles();
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child instanceof File) {
      child.remove();
    } else if (child instanceof Folder) {
      deleteFolderRecursive(child);
    }
  }
  folder.remove();
};

export type PackCopyTransfer = {
  source: { pack: string; assets: string; templates: string };
  target: { pack: string; assets: string; templates: string };
};

/** Port of engine.jsx `copyPackageToAppData`. */
export const copyPackageToAppData = (transfer: PackCopyTransfer): string | false => {
  try {
    const sourcePack = new File(transfer.source.pack);
    const targetPack = new File(transfer.target.pack);
    if (!sourcePack.copy(targetPack)) return false;
    copyFolder(new Folder(transfer.source.assets), new Folder(transfer.target.assets));
    copyFolder(new Folder(transfer.source.templates), new Folder(transfer.target.templates));
    return transfer.target.pack;
  } catch (e) {
    return false;
  }
};

export const deletePackageFiles = (packDir: string): boolean => {
  try {
    const folder = new Folder(packDir);
    if (!folder.exists) return true;
    deleteFolderRecursive(folder);
    return true;
  } catch (e) {
    return false;
  }
};
