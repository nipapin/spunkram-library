/**
 * Resolve the on-disk source file for a pack item, so it can be applied to the
 * host project/timeline.
 * Port of Spunkram Beta `getItemFilepath` (`js/filesystem.js`) — PR + AE branches.
 *
 * Market packs ship plaintext `.prproj` / `.mogrt` only (no encrypted sidecars).
 * Folders: prefer `Assets` / `Previews` (see pack-folders.ts).
 */
import { fs, path } from "../cep/node";
import { resolvePackTemplatesPath } from "./pack-folders";
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

function sanitizeName(id: string): string {
  return id.replace(/[^a-z0-9._-]/gi, "_");
}

export { resolvePackTemplatesPath } from "./pack-folders";

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
  const templatesDir = resolvePackTemplatesPath(packFilePath, hostAppId);

  if (group.is_presets) {
    return { ctype: "UNSUPPORTED", file: "", cacheName: "" };
  }

  if (group.is_audio) {
    // Audio lives under Assets (same tree as projects), not Previews.
    const segments = resolveItemAssetSegments(item);
    const ext =
      typeof customArgs.filetype === "string" ? customArgs.filetype : "wav";
    const baseWithoutExt = path.join(templatesDir, ...segments);
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

  const groupDir = path.join(templatesDir, ...item.pathSegments);

  if (group.is_footage) {
    const ext =
      typeof customArgs.filetype === "string"
        ? customArgs.filetype
        : typeof group.is_footage === "string"
          ? group.is_footage
          : "mp4";
    const stem = group.preview_name_instead_id ? item.name : item.previewKey;
    const file = path.join(groupDir, `${stem}.${String(ext).toLowerCase()}`);
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
  // Precedence: item custom_args → group custom_source_type → pack source_type.
  const groupSourceType =
    typeof group.custom_source_type === "string" && group.custom_source_type
      ? group.custom_source_type
      : undefined;
  const rawSourceType =
    (customArgs.custom_source_type as string | undefined) ||
    groupSourceType ||
    settings?.inside_option_sets?.source_type ||
    "FULL_PROJECT";
  const sourceType =
    rawSourceType === "PROJECT" ? "FULL_PROJECT" : rawSourceType;

  if (sourceType === "MOGRT") {
    const stem =
      (typeof customArgs.multiuse_ref_mogrt === "string" &&
        customArgs.multiuse_ref_mogrt) ||
      (group.preview_name_instead_id ? item.name : item.previewKey);
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
