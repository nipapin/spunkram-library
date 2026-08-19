import { applyComp } from "./aeft-composer";
import { fitLayerScaleToComp } from "./aeft-utils";

export type ApplyPackItemPayload = {
  ctype: "PROJECT" | "MOGRT" | "AUDIO" | "FOOTAGE";
  filePath: string;
  itemName: string;
  binName: string;
  /** Name of the comp to look for inside an imported `.aep` (PROJECT only). */
  compName?: string;
  /** Unused on AE — kept for evalTS signature parity with Premiere. */
  durationSeconds?: number;
  composer?: {
    itemId: string;
    instanceGroup: string;
    argsObject: Record<string, unknown>;
    extraArguments: Record<string, unknown>;
    templatesDir: string;
    packName: string;
    packOptions: Record<string, unknown>;
  };
};

export type ApplyPackItemResult =
  | { applied: true; ctype: string }
  | { applied: false; reason: string };

const composerStatusReason = (status: unknown): string => {
  if (status == null || status === "") return "";
  return String(status);
};

/**
 * Apply a resolved pack item file to the AE project / active composition.
 * When `composer` context is provided, uses full Beta `applyComp` parity.
 */
export const applyPackItem = (payload: ApplyPackItemPayload): ApplyPackItemResult => {
  try {
    const { ctype, filePath, composer } = payload;
    const file = new File(filePath);
    if (!file.exists) return { applied: false, reason: "SOURCE_MISSING" };

    if (composer) {
      const result = applyComp(
        composer.itemId,
        payload.itemName,
        composer.instanceGroup,
        composer.argsObject,
        composer.extraArguments,
        composer.templatesDir,
        composer.packName,
        composer.packOptions,
      );
      const reason = composerStatusReason(result);
      if (reason) return { applied: false, reason };
      return { applied: true, ctype };
    }

    // Fallback simplified path (non-panel callers without composer context).
    const { itemName, binName, compName } = payload;

    if (ctype === "PROJECT") {
      let comp: CompItem | null = null;
      for (let i = 1; i <= app.project.rootFolder.numItems; i++) {
        const item = app.project.rootFolder.item(i);
        if (item instanceof CompItem && item.name === (compName || itemName)) {
          comp = item;
          break;
        }
      }
      if (!comp) {
        try {
          app.project.importFile(new ImportOptions(file));
        } catch (e: any) {
          return { applied: false, reason: e && e.message ? e.message : "IMPORT_FAILED" };
        }
        for (let i = 1; i <= app.project.rootFolder.numItems; i++) {
          const item = app.project.rootFolder.item(i);
          if (item instanceof CompItem) {
            if (!comp) comp = item;
            if (item.name === (compName || itemName)) {
              comp = item;
              break;
            }
          }
        }
      }
      if (!comp) return { applied: false, reason: "IMPORT_FAILED" };

      const activeItem = app.project.activeItem;
      if (activeItem instanceof CompItem && activeItem.id !== comp.id) {
        const layer = activeItem.layers.add(comp);
        fitLayerScaleToComp(activeItem, comp, layer);
      }
      return { applied: true, ctype };
    }

    if (ctype === "MOGRT") {
      return { applied: false, reason: "MOGRT_NOT_SUPPORTED_IN_AE" };
    }

    let folder: FolderItem | null = null;
    for (let i = 1; i <= app.project.rootFolder.numItems; i++) {
      const item = app.project.rootFolder.item(i);
      if (item instanceof FolderItem && item.name === binName) {
        folder = item;
        break;
      }
    }
    if (!folder) {
      folder = app.project.items.addFolder(binName);
      folder.parentFolder = app.project.rootFolder;
    }

    let imported: _ItemClasses | null = null;
    for (let i = 1; i <= folder.numItems; i++) {
      if (folder.item(i).name === file.name) {
        imported = folder.item(i);
        break;
      }
    }
    if (!imported) {
      try {
        imported = app.project.importFile(new ImportOptions(file));
        imported.parentFolder = folder;
      } catch (e: any) {
        return { applied: false, reason: e && e.message ? e.message : "IMPORT_FAILED" };
      }
    }

    const activeItem = app.project.activeItem;
    if (activeItem instanceof CompItem) {
      const layer = activeItem.layers.add(imported as AVItem);
      if (ctype === "FOOTAGE" && imported instanceof AVItem) {
        fitLayerScaleToComp(activeItem, imported, layer);
      }
    }

    return { applied: true, ctype };
  } catch (e: any) {
    return { applied: false, reason: e && e.message ? e.message : String(e) };
  }
};
