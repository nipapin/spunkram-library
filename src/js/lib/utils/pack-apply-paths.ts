/**
 * Resolve the on-disk source file for a pack item, so it can be applied to the
 * host project/timeline.
 * Port of Spunkram Beta `getItemFilepath` (`js/filesystem.js`) — PR + AE branches.
 *
 * Market packs ship plaintext `.prproj` / `.mogrt` only (no encrypted sidecars).
 */
import { fs, path } from "../cep/node";
import { MASKED } from "../config/masked";
import { resolvePackAssetsPath } from "./pack";
import { resolveItemAssetSegments } from "./pack-tree";
import type { PackPreviewItem, PackSettings, PackTreeItem } from "./pack-types";

export type HostAppId = "PPRO" | "AEFT";

export type PackItemCType =
  | "PROJECT"
  | "FULL_PROJECT"
  | "MOGRT"
  | "AUDIO"
  | "FOOTAGE"
  | "UNSUPPORTED";

export type ResolvedItemFile = {
  ctype: PackItemCType;
  /** Absolute path to the source file on disk. */
  file: string;
  /** Suggested cache / display file name. */
  cacheName: string;
};

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function";
}

function sanitizeName(id: string): string {
  return id.replace(/[^a-z0-9._-]/gi, "_");
}

/** Resolve the template folder (.prproj / .aep source files) next to the pack file. */
export function resolvePackTemplatesPath(
  packFilePath: string,
  hostAppId: HostAppId,
): string {
  if (typeof path?.dirname !== "function" || typeof path?.join !== "function") {
    return "";
  }
  const dir = path.dirname(packFilePath);
  const modern =
    hostAppId === "PPRO"
      ? `${MASKED.name} Premiere Pro`
      : `${MASKED.name} After Effects`;
  const legacy = hostAppId === "PPRO" ? "Atom Premiere Pro" : "Atom After Effects";
  // Market composer zips ship templates under `Assets/` (not Spunkram Premiere Pro).
  const candidates = [
    path.join(dir, modern),
    path.join(dir, legacy),
    path.join(dir, "Assets"),
  ];
  for (const candidate of candidates) {
    if (cepFsAvailable() && fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function previewEntryFor(item: PackTreeItem): PackPreviewItem | undefined {
  return item.group.preview?.[item.previewKey];
}

function customArgsFor(item: PackTreeItem): Record<string, unknown> {
  const entry = previewEntryFor(item);
  return (entry?.custom_args as Record<string, unknown>) || {};
}

/** Apply an item-level `_Files/<folder>/` override, when the pack sets it (PR only). */
function withCustomFilesFolder(
  file: string,
  templatesDir: string,
  customFilesFolder: unknown,
): string {
  if (typeof customFilesFolder !== "string" || !customFilesFolder) return file;
  return path.join(templatesDir, "_Files", customFilesFolder, path.basename(file));
}

/**
 * Resolve where an item's real source file lives on disk.
 * Returns `null` when the item type isn't supported for direct apply yet
 * (e.g. AE/PS text or FX presets, which use a separate `.ffx` engine).
 */
export function resolveItemSourceFile(
  item: PackTreeItem,
  packFilePath: string,
  hostAppId: HostAppId,
  settings: PackSettings | null,
): ResolvedItemFile | null {
  const group = item.group;
  const customArgs = customArgsFor(item);

  if (group.is_presets) {
    return { ctype: "UNSUPPORTED", file: "", cacheName: "" };
  }

  if (group.is_audio) {
    const assetsPath = resolvePackAssetsPath(packFilePath);
    const segments = resolveItemAssetSegments(item);
    const ext =
      typeof customArgs.filetype === "string" ? customArgs.filetype : "wav";
    const baseWithoutExt = path.join(assetsPath, ...segments);
    const itemNameAudio = group.preview_name_instead_id
      ? item.name
      : item.previewKey;
    return {
      ctype: "AUDIO",
      file: path.join(
        path.dirname(baseWithoutExt),
        `${itemNameAudio}.${String(ext).toLowerCase()}`,
      ),
      cacheName: `${sanitizeName(item.id)}.${String(ext).toLowerCase()}`,
    };
  }

  const templatesDir = resolvePackTemplatesPath(packFilePath, hostAppId);
  const groupDir = path.join(templatesDir, ...item.pathSegments);

  if (group.is_footage) {
    const ext =
      typeof customArgs.filetype === "string"
        ? customArgs.filetype
        : typeof group.is_footage === "string"
          ? group.is_footage
          : "mp4";
    const file = path.join(groupDir, `${item.name}.${String(ext).toLowerCase()}`);
    return { ctype: "FOOTAGE", file, cacheName: path.basename(file) };
  }

  if (hostAppId === "AEFT") {
    const individualComp = !!customArgs.individual_comp;
    const file = individualComp
      ? path.join(groupDir, `${item.name}.aep`)
      : path.join(templatesDir, `${item.pathSegments.join(path.sep)}.aep`);
    return { ctype: "PROJECT", file, cacheName: path.basename(file) };
  }

  // PPRO: FULL_PROJECT (.prproj via $._copyPasteSystem) or MOGRT.
  // Legacy per-item PROJECT path is removed — treat "PROJECT" as FULL_PROJECT.
  const rawSourceType =
    (customArgs.custom_source_type as string | undefined) ||
    settings?.inside_option_sets?.source_type ||
    "FULL_PROJECT";
  const sourceType =
    rawSourceType === "PROJECT" ? "FULL_PROJECT" : rawSourceType;

  if (sourceType === "MOGRT") {
    const stem = (customArgs.multiuse_ref_mogrt as string) || item.name;
    const file = withCustomFilesFolder(
      path.join(groupDir, `${stem}.mogrt`),
      templatesDir,
      customArgs.custom_files_folder,
    );
    return {
      ctype: "MOGRT",
      file,
      cacheName: `${sanitizeName(item.id)}.mogrt`,
    };
  }

  // FULL_PROJECT → `$._copyPasteSystem` / customChain on plaintext .prproj.
  const lastGroup = item.pathSegments[item.pathSegments.length - 1] || item.name;
  const file = withCustomFilesFolder(
    path.join(groupDir, `${lastGroup}.prproj`),
    templatesDir,
    customArgs.custom_files_folder,
  );
  return {
    ctype: "FULL_PROJECT",
    file,
    cacheName: `${sanitizeName(item.id)}.prproj`,
  };
}
