import type { PackTreeItem } from "./pack-types";

// AtomX content.js copies these from the leaf group into the composer args.
// Item layer options (timing, markers, blending, etc.) stay in custom_args.
const AE_GROUP_ARGUMENT_KEYS = [
  "aep_file_name",
  "label_color_num",
  "parent_folder",
  "change_auto_size_composition",
  "change_duplicate_origin_setting",
  "change_use_start_timeline_pointer",
  "change_layer_index_position",
  "change_auto_size_footage",
  "change_engine",
  "is_audio",
  "is_footage",
  "is_presets",
  "individual_comp",
] as const;

type AEGroupArgument = (typeof AE_GROUP_ARGUMENT_KEYS)[number];

export function resolveAEGroupArgument(item: PackTreeItem, key: AEGroupArgument): unknown {
  const entry = item.group.preview?.[item.previewKey];
  // Keep compatibility with packs that previously put group options on items.
  return item.group[key]
    ?? (entry as Record<string, unknown> | undefined)?.[key]
    ?? entry?.custom_args?.[key];
}

export function buildAEComposerArguments(item: PackTreeItem): Record<string, unknown> {
  const entry = item.group.preview?.[item.previewKey];
  const args: Record<string, unknown> = {
    ...(entry || { name: item.name }),
    label_color_num: 2,
    parent_folder: false,
    is_audio: false,
    is_footage: false,
    is_presets: false,
    individual_comp: false,
    custom_args: entry?.custom_args || {},
  };
  for (const key of AE_GROUP_ARGUMENT_KEYS) {
    const value = resolveAEGroupArgument(item, key);
    if (value != null) args[key] = value;
  }
  return args;
}
