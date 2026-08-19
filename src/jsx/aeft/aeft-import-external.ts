/**
 * Import user-picked assets into AE project or active comp (external assets library).
 * Port of legacy `external_lib_import.jsx` — no Atom/pp_composer dependency.
 */

const EXTERNAL_BIN = "Ex Assets Lib";

export type ImportExternalAssetPayload = {
  typeImportTo: string | number;
  filePath: string;
};

const isTimelineImport = (typeImportTo: string | number): boolean =>
  String(typeImportTo) === "1";

const findOrCreateRootBin = (name: string): FolderItem => {
  for (let i = 1; i <= app.project.numItems; i++) {
    const item = app.project.item(i);
    if (item instanceof FolderItem && item.name === name) {
      return item;
    }
  }
  return app.project.items.addFolder(name);
};

export const importExternalAsset = (
  payload: ImportExternalAssetPayload,
): { ok: true; data?: unknown } | { ok: false; reason: string } => {
  try {
    const { typeImportTo, filePath } = payload;
    const targetFile = new File(filePath);
    if (!targetFile.exists) {
      return { ok: false, reason: "FILE_NOT_FOUND" };
    }

    const bin = findOrCreateRootBin(EXTERNAL_BIN);
    app.beginUndoGroup("Motionflow - Import Lib Asset");

    if (!isTimelineImport(typeImportTo)) {
      const imported = app.project.importFile(new ImportOptions(targetFile));
      imported.parentFolder = bin;
      imported.selected = true;
      app.endUndoGroup();
      return { ok: true };
    }

    const comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
      app.endUndoGroup();
      return { ok: true, data: "COMP" };
    }

    const imported = app.project.importFile(new ImportOptions(targetFile));
    imported.parentFolder = bin;
    imported.selected = false;
    const layer = comp.layers.add(imported);
    layer.startTime = comp.time;
    app.endUndoGroup();
    return { ok: true };
  } catch (e: any) {
    try {
      app.endUndoGroup();
    } catch {
      // ignore
    }
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
      importToAE: (typeImportTo: string | number, path: string) => {
        const r = importExternalAsset({ typeImportTo, filePath: path });
        if (!r.ok) return r.reason;
        return r.data;
      },
      importToPR: () => "NO_SUPPORT_APP",
    };
  } catch {
    // ignore
  }
}

installLegacyBridge();
