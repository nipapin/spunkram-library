/**
 * Resolve the on-disk source file for a pack item (before decrypt), so it can
 * be applied to the host project/timeline.
 * Port of Spunkram Beta `getItemFilepath` (`js/filesystem.js`) — PR + AE branches.
 */
import { fs, path } from "../cep/node";
import { MASKED } from "../config/masked";
import { resolvePackAssetsPath } from "./pack";
import { resolveItemAssetSegments } from "./pack-tree";
import type { PackPreviewItem, PackSettings, PackTreeItem } from "./pack-types";

export type HostAppId = "PPRO" | "AEFT";

export type PackItemCType =
  | "PROJECT"
  | "MOGRT"
  | "AUDIO"
  | "FOOTAGE"
  | "FULL_PROJECT"
  | "UNSUPPORTED";

export type ResolvedItemFile = {
  ctype: PackItemCType;
  /** Absolute path to the source file on disk (still encoded if `encrypted` is set). */
  file: string;
  encrypted?: "BIN_AX" | "MG_ASSET";
  /** Suggested cache file name once decoded. */
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
  const candidates = [path.join(dir, modern), path.join(dir, legacy)];
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
 * Resolve where an item's real source file lives on disk (before any decrypt).
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
  const filesProtection = settings?.inside_option_sets?.files_protection_method as
    | string
    | undefined;

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

  // PPRO: item/pack decide PROJECT vs MOGRT vs FULL_PROJECT.
  const sourceType =
    (customArgs.custom_source_type as string | undefined) ||
    settings?.inside_option_sets?.source_type ||
    "PROJECT";

  if (sourceType === "MOGRT") {
    const encrypted =
      settings?.inside_option_sets?.mogrt_files_protection_method === "MG_ASSET"
        ? ("MG_ASSET" as const)
        : undefined;
    const ext = encrypted ? "mgasset" : "mogrt";
    const stem = (customArgs.multiuse_ref_mogrt as string) || item.name;
    let file = path.join(groupDir, `${stem}.${ext}`);
    file = withCustomFilesFolder(file, templatesDir, customArgs.custom_files_folder);
    return {
      ctype: "MOGRT",
      file,
      encrypted,
      cacheName: `${sanitizeName(item.id)}.mogrt`,
    };
  }

  const encrypted = filesProtection === "BIN_AX" ? ("BIN_AX" as const) : undefined;
  const ext = encrypted ? "atomxasset" : "prproj";

  if (sourceType === "FULL_PROJECT") {
    const lastGroup = item.pathSegments[item.pathSegments.length - 1] || item.name;
    const file = path.join(groupDir, `${lastGroup}.${ext}`);
    return {
      ctype: "FULL_PROJECT",
      file,
      encrypted,
      cacheName: `${sanitizeName(item.id)}.prproj`,
    };
  }

  let file = path.join(groupDir, `${item.name}.${ext}`);
  file = withCustomFilesFolder(file, templatesDir, customArgs.custom_files_folder);
  return {
    ctype: "PROJECT",
    file,
    encrypted,
    cacheName: `${sanitizeName(item.id)}.prproj`,
  };
}
