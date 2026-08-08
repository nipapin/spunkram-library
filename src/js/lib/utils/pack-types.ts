/** Pack file extensions historically used by Atom / Spunkram. */
export const PACKAGE_FILETYPES = ["spunkram", "atom"] as const;
export type PackageFiletype = (typeof PACKAGE_FILETYPES)[number];

/** Join char for category instance paths (legacy: Typography-@-Basic). */
export const INSTANCE_GROUP_JOIN_CHAR = "-@-";

export const PACK_ASSETS_FOLDER = "Previews";

export type PackPreviewItem = {
  enabled?: boolean;
  name: string;
  options?: boolean | Record<string, unknown>;
  custom_args?: Record<string, unknown>;
};

export type PackLeafGroup = {
  preview: Record<string, PackPreviewItem>;
  is_new_mark?: boolean;
  premium?: boolean;
  enabled_only?: boolean;
  custom_folder?: string;
  custom_assets_folder?: string;
  preview_name_instead_id?: boolean;
  /** Preview card aspect: DEFAULT (16:9), VERTICAL (9:16), BOX_MIN/BOX_MAX (1:1). */
  custom_preview_res_thumbnail?: "DEFAULT" | "VERTICAL" | "BOX_MIN" | "BOX_MAX" | string;
  aep_file_name?: string;
  is_audio?: boolean;
  /** true or image type string ("JPG"/"PNG") for static footage thumbnails. */
  is_footage?: boolean | string;
  is_presets?: boolean;
  disable_webm_preview?: boolean;
  [key: string]: unknown;
};

/** Nested pack structure: folders (no preview) or leaf groups (has preview). */
export type PackStructureNode = PackLeafGroup | PackStructureMap;

export type PackStructureMap = {
  [key: string]: PackStructureNode;
};

export type PackSettingsMain = {
  name: string;
  version: string;
  required_app_version?: string;
  software_id?: string;
  software_version?: string;
  engine_pack?: string;
  inside_security?: string;
  required_purchase_code?: boolean;
  cc_author_username?: string;
};

export type PackSettings = {
  main: PackSettingsMain;
  inside_option_sets?: {
    use_webm_preview?: boolean | "mp4" | "webm";
    /** PR: FULL_PROJECT (.prproj + copyPaste) or MOGRT. Legacy "PROJECT" is treated as FULL_PROJECT. */
    source_type?: "FULL_PROJECT" | "MOGRT" | "PROJECT" | string;
    header_color_hex?: string;
    [key: string]: unknown;
  };
  stylization?: Record<string, unknown>;
};

/**
 * Parsed pack body. On disk, Market JSON may use `content` instead of
 * `structure`; loaders normalize to `structure` before returning.
 */
export type PackContent = {
  settings: PackSettings;
  structure: PackStructureMap;
};

export type PackInitResult = {
  method: "JSON" | "JSXBIN";
  full_content: PackContent;
  settings: PackSettings;
  structure: PackStructureMap;
  header_bytes: string;
  pack_hash: string;
};

export type PackInitError =
  | "PACK_NOT_FOUND"
  | "CANT_OPEN"
  | "CORRUPTED_PACK"
  | "CORRUPTED_TEST_PACK"
  | "UNKNOWN_ERROR"
  | string;

export type PackTreeIcon = "folder" | "group" | "SFX" | "FOOTAGE" | "PRESETS";

export type PackTreeItem = {
  id: string;
  name: string;
  enabled: boolean;
  /** Relative path segments under assets root for poster/preview lookup. */
  pathSegments: string[];
  previewKey: string;
  group: PackLeafGroup;
};

export type PackTreeFolderNode = {
  kind: "folder";
  id: string;
  label: string;
  path: string[];
  count: number;
  newCount: number;
  premiumCount: number;
  icon: PackTreeIcon;
  children: PackTreeNode[];
};

export type PackTreeGroupNode = {
  kind: "group";
  id: string;
  label: string;
  path: string[];
  /** Legacy data-view key joined with INSTANCE_GROUP_JOIN_CHAR. */
  viewId: string;
  count: number;
  newCount: number;
  premiumCount: number;
  icon: PackTreeIcon;
  isNew: boolean;
  group: PackLeafGroup;
  items: PackTreeItem[];
};

export type PackTreeNode = PackTreeFolderNode | PackTreeGroupNode;

export type InstalledPackMeta = {
  name: string;
  c_name?: string;
  author: string;
  version: string;
  load?: string;
  path: string;
  engine?: string;
  appID?: string;
  appVersion?: string;
  favorites?: string;
  packprint?: string;
  pcsc?: string;
  abs?: boolean;
  hbs?: string;
};
