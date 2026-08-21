import {
  INSTANCE_GROUP_JOIN_CHAR,
  type PackLeafGroup,
  type PackPreviewItem,
  type PackStructureMap,
  type PackStructureNode,
  type PackTreeGroupNode,
  type PackTreeIcon,
  type PackTreeItem,
  type PackTreeNode,
} from "./pack-types";

export function instanceGroupJoin(pathSegments: string[]): string {
  return pathSegments.join(INSTANCE_GROUP_JOIN_CHAR);
}

export function instanceGroupSplit(viewId: string): string[] {
  if (!viewId) return [];
  return viewId.split(INSTANCE_GROUP_JOIN_CHAR).filter(Boolean);
}

function isLeafGroup(node: PackStructureNode): node is PackLeafGroup {
  return (
    !!node &&
    typeof node === "object" &&
    "preview" in node &&
    node.preview !== undefined &&
    typeof node.preview === "object"
  );
}

function resolveGroupIcon(group: PackLeafGroup): PackTreeIcon {
  if (group.is_audio) return "SFX";
  if (group.is_footage) return "FOOTAGE";
  if (group.is_presets) return "PRESETS";
  return "group";
}

function buildItems(
  group: PackLeafGroup,
  pathSegments: string[],
): PackTreeItem[] {
  const preview = group.preview ?? {};
  const items: PackTreeItem[] = [];

  for (const previewKey of Object.keys(preview)) {
    const entry = preview[previewKey] as PackPreviewItem;
    if (!entry) continue;
    items.push({
      id: `${instanceGroupJoin(pathSegments)}${INSTANCE_GROUP_JOIN_CHAR}${previewKey}`,
      name: entry.name || previewKey,
      enabled: entry.enabled !== false,
      pathSegments: [...pathSegments],
      previewKey,
      group,
    });
  }

  return items;
}

function nodeIsAudio(node: PackStructureNode): boolean {
  return !!(node as { is_audio?: boolean }).is_audio;
}

function processNode(
  node: PackStructureNode,
  label: string,
  pathSegments: string[],
  inheritedAudio = false,
): PackTreeNode {
  const isAudio = inheritedAudio || nodeIsAudio(node);

  if (isLeafGroup(node)) {
    const group: PackLeafGroup =
      isAudio && !node.is_audio ? { ...node, is_audio: true } : node;
    const items = buildItems(group, pathSegments);
    const enabledItems = items.filter((item) => item.enabled);
    const count = enabledItems.length;
    const isNew = !!group.is_new_mark;
    const premiumCount =
      group.premium || group.enabled_only
        ? enabledItems.filter((item) => item.enabled).length
        : 0;

    const groupNode: PackTreeGroupNode = {
      kind: "group",
      id: instanceGroupJoin(pathSegments),
      label,
      path: pathSegments,
      viewId: instanceGroupJoin(pathSegments),
      count,
      newCount: isNew ? 1 : 0,
      premiumCount,
      icon: resolveGroupIcon(group),
      isNew,
      group,
      items: enabledItems,
    };
    return groupNode;
  }

  const children: PackTreeNode[] = [];
  let count = 0;
  let newCount = 0;
  let premiumCount = 0;

  for (const childKey of Object.keys(node as PackStructureMap)) {
    const child = (node as PackStructureMap)[childKey];
    if (!child || typeof child !== "object") continue;
    const childNode = processNode(child, childKey, [...pathSegments, childKey], isAudio);
    children.push(childNode);
    count += childNode.count;
    newCount += childNode.newCount;
    premiumCount += childNode.premiumCount;
  }

  return {
    kind: "folder",
    id: instanceGroupJoin(pathSegments),
    label,
    path: pathSegments,
    count,
    newCount,
    premiumCount,
    icon: "folder",
    children,
  };
}

/**
 * Build a typed sidebar tree from pack `structure`.
 * Port of Spunkram Beta `mainItemParserLoop` / `processItemRecursively`,
 * returning data nodes instead of HTML.
 */
export function buildPackTree(structure: PackStructureMap): PackTreeNode[] {
  if (!structure || typeof structure !== "object") return [];

  const roots: PackTreeNode[] = [];
  for (const key of Object.keys(structure)) {
    const node = structure[key];
    if (!node || typeof node !== "object") continue;
    roots.push(processNode(node, key, [key]));
  }
  return roots;
}

/** Flatten all leaf groups in tree order. */
export function flattenPackGroups(
  nodes: PackTreeNode[],
): PackTreeGroupNode[] {
  const groups: PackTreeGroupNode[] = [];
  const walk = (list: PackTreeNode[]) => {
    for (const node of list) {
      if (node.kind === "group") groups.push(node);
      else walk(node.children);
    }
  };
  walk(nodes);
  return groups;
}

export type PackContentSection = {
  id: string;
  /** Relative path under the selected folder, e.g. "Bokeh / Fast". Empty for leaf selection. */
  title: string;
  items: PackTreeItem[];
};

/**
 * Build content sections for the grid.
 * - Leaf group → one untitled section with its items.
 * - Folder → one section per descendant leaf group, titled by path relative to the folder.
 */
export function collectContentSections(node: PackTreeNode): PackContentSection[] {
  if (node.kind === "group") {
    return [
      {
        id: node.id,
        title: "",
        items: node.items,
      },
    ];
  }

  const rootLen = node.path.length;
  return flattenPackGroups(node.children).map((group) => ({
    id: group.id,
    title: group.path.slice(rootLen).join(" / "),
    items: group.items,
  }));
}

/**
 * All leaf groups across the pack, titled with full path
 * (e.g. "Transitions / Bokeh / Fast") for global search results.
 */
export function collectAllContentSections(
  tree: PackTreeNode[],
): PackContentSection[] {
  return flattenPackGroups(tree).map((group) => ({
    id: group.id,
    title: group.path.join(" / "),
    items: group.items,
  }));
}

/**
 * Filter sections/items by name query. Empty query returns sections unchanged
 * (empty sections dropped).
 */
export function filterContentSections(
  sections: PackContentSection[],
  query: string,
): PackContentSection[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return sections.filter((section) => section.items.length > 0);
  }

  return sections
    .map((section) => {
      const titleHit = section.title.toLowerCase().includes(q);
      return {
        ...section,
        items: titleHit
          ? section.items
          : section.items.filter((item) => item.name.toLowerCase().includes(q)),
      };
    })
    .filter((section) => section.items.length > 0);
}

/** Keep only favorited items across sections. */
export function filterFavoriteSections(
  sections: PackContentSection[],
  favoriteIds: ReadonlySet<string>,
): PackContentSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => favoriteIds.has(item.id)),
    }))
    .filter((section) => section.items.length > 0);
}

/** First root node (folder or group) — preferred default selection. */
export function getFirstPackRoot(
  nodes: PackTreeNode[],
): PackTreeNode | undefined {
  return nodes[0];
}

/** Find a node by viewId / id. */
export function findPackTreeNode(
  nodes: PackTreeNode[],
  id: string,
): PackTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id || (node.kind === "group" && node.viewId === id)) {
      return node;
    }
    if (node.kind === "folder") {
      const found = findPackTreeNode(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** First selectable leaf group in the tree. */
export function getFirstPackGroup(
  nodes: PackTreeNode[],
): PackTreeGroupNode | undefined {
  return flattenPackGroups(nodes)[0];
}

/**
 * Resolve CSS aspect-ratio from pack group `custom_preview_res_thumbnail`.
 * DEFAULT → 16/9, VERTICAL → 9/16, BOX_MIN/BOX_MAX → 1/1.
 */
export function resolvePreviewAspectRatio(
  group: { custom_preview_res_thumbnail?: string; is_audio?: boolean },
): string {
  // Audio previews are square in legacy (BOX_MIN / BOX_MAX).
  if (group.is_audio) return "1 / 1";

  switch (group.custom_preview_res_thumbnail) {
    case "VERTICAL":
      return "9 / 16";
    case "BOX_MIN":
    case "BOX_MAX":
      return "1 / 1";
    case "DEFAULT":
    default:
      return "16 / 9";
  }
}

/**
 * Resolve poster/preview basename segments for an item
 * (mirrors legacy `createContentItem` path logic).
 */
export function resolveItemAssetSegments(item: PackTreeItem): string[] {
  const { group, pathSegments, previewKey } = item;
  const customFolder =
    typeof group.custom_folder === "string" ? group.custom_folder : undefined;
  const leafFolder =
    customFolder || pathSegments[pathSegments.length - 1] || "";

  const nameInsteadId = !!group.preview_name_instead_id;
  const previewEntry = group.preview?.[previewKey];
  const fileStem = nameInsteadId
    ? previewEntry?.name || previewKey
    : previewKey;

  const parents = pathSegments.slice(0, -1);
  return [...parents, leafFolder, fileStem];
}
