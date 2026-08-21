import type { ClientControl, ControlValue, LocalizedStr, MogrtDefinition, PointValue } from "./types";
import { ControlType } from "./types";

/** Caption mogrt dump — the only Styles source. */
export const CONTROLS_FILE = "controls.json";

export type ControlsKind =
  | "checkbox"
  | "slider"
  | "angle"
  | "color"
  | "point"
  | "text"
  | "menu"
  | "font-menu";

export interface ControlsLeaf {
  name: string;
  kind?: string;
  type?: string;
  source?: string;
  uiPath?: string;
  essentialName?: string;
  value?: unknown;
  options?: unknown[];
  min?: number;
  max?: number;
  controls?: ControlsNode[];
}

export interface ControlsGroup {
  name: string;
  type: "group";
  controls?: ControlsNode[];
}

export type ControlsNode = ControlsGroup | ControlsLeaf;

export interface ControlsDocument {
  version?: number;
  composition?: string;
  templateName?: string;
  enabledLayers?: string[];
  groups?: ControlsGroup[];
  controls?: ControlsLeaf[];
}

const loc = (str: string): LocalizedStr => ({ strDB: [{ localeString: "en_US", str }] });

/** AE menu dumps often omit labels — keep 1-based values working in Styles. */
const MENU_FALLBACKS: Record<string, string[]> = {
  position: ["Top", "Center", "Bottom"],
  "segment type": ["Words", "Custom"],
  case: ["Lowercase", "Uppercase", "Capitalize"],
};

const KIND_TO_TYPE: Record<string, number> = {
  checkbox: ControlType.Checkbox,
  slider: ControlType.Slider,
  angle: ControlType.Angle,
  color: ControlType.Color,
  point: ControlType.Point,
  text: ControlType.Text,
  menu: ControlType.Menu,
  "font-menu": ControlType.FontMenu,
  fontmenu: ControlType.FontMenu,
  font: ControlType.FontMenu,
};

export const isControlsDocument = (raw: unknown): raw is ControlsDocument => {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  // Already-converted in-memory tree (persisted as controls.json).
  if (Array.isArray(o.clientControls)) return false;
  return Array.isArray(o.groups) || Array.isArray(o.controls);
};

const isGroupNode = (node: ControlsNode): node is ControlsGroup =>
  (node as ControlsGroup).type === "group" || Array.isArray((node as ControlsLeaf).controls);

const optionLabel = (opt: unknown): string => {
  if (typeof opt === "string") return opt;
  if (opt && typeof opt === "object") {
    const rec = opt as Record<string, unknown>;
    if (typeof rec.str === "string") return rec.str;
    if (typeof rec.name === "string") return rec.name;
    if (typeof rec.label === "string") return rec.label;
  }
  return String(opt ?? "");
};

const menucontentFor = (name: string, options: unknown[] | undefined): LocalizedStr[] | undefined => {
  const fromFile = (options ?? []).map(optionLabel).filter(Boolean);
  const labels = fromFile.length ? fromFile : MENU_FALLBACKS[name.trim().toLowerCase()] ?? [];
  if (!labels.length) return undefined;
  return labels.map(loc);
};

const asPoint = (value: unknown): PointValue => {
  if (value && typeof value === "object" && !Array.isArray(value) && "x" in value && "y" in value) {
    const p = value as { x: unknown; y: unknown };
    return { x: Number(p.x) || 0, y: Number(p.y) || 0 };
  }
  if (Array.isArray(value) && value.length >= 2) {
    return { x: Number(value[0]) || 0, y: Number(value[1]) || 0 };
  }
  return { x: 0, y: 0 };
};

const leafValue = (kind: string, value: unknown): ControlValue => {
  if (kind === "point") return asPoint(value);
  if (kind === "checkbox") return value === true || value === 1 || value === "1";
  if (kind === "color" && Array.isArray(value)) return value.map((n) => Number(n) || 0);
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value as number[];
  return 0;
};

const leafType = (kind: string): number => KIND_TO_TYPE[kind] ?? ControlType.Slider;

export const controlsToDefinition = (doc: ControlsDocument): MogrtDefinition => {
  const clientControls: ClientControl[] = [];
  const usedIds = new Set<string>();

  const uniqueId = (preferred: string): string => {
    const base = preferred.trim() || "control";
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return base;
    }
    let i = 2;
    while (usedIds.has(`${base} (${i})`)) i++;
    const next = `${base} (${i})`;
    usedIds.add(next);
    return next;
  };

  const convert = (node: ControlsNode, parentPath: string): string => {
    if (isGroupNode(node)) {
      const name = node.name || "Group";
      const path = parentPath ? `${parentPath} / ${name}` : name;
      const childIds: string[] = [];
      for (const child of node.controls ?? []) {
        childIds.push(convert(child, path));
      }
      const control: ClientControl = {
        id: uniqueId(`group:${path}`),
        type: ControlType.Group,
        uiName: loc(name),
        value: childIds,
        groupexpanded: false,
      };
      clientControls.push(control);
      return control.id;
    }

    const leaf = node;
    const name = leaf.name || "Control";
    const kind = String(leaf.kind || "").toLowerCase();
    const path = leaf.uiPath || (parentPath ? `${parentPath} / ${name}` : name);
    let min = typeof leaf.min === "number" ? leaf.min : undefined;
    let max = typeof leaf.max === "number" ? leaf.max : undefined;
    const value = leafValue(kind, leaf.value);
    if (typeof value === "number" && typeof min === "number" && typeof max === "number") {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const control: ClientControl = {
      id: uniqueId(path),
      type: leafType(kind),
      uiName: loc(name),
      value,
      min,
      max,
      menucontent: kind === "menu" ? menucontentFor(name, leaf.options) : undefined,
      essentialName: leaf.essentialName,
      source: leaf.source,
      uiPath: path,
    };
    clientControls.push(control);
    return control.id;
  };

  const roots: ControlsNode[] =
    doc.groups && doc.groups.length
      ? doc.groups
      : [{ name: "Style", type: "group", controls: doc.controls ?? [] }];

  for (const group of roots) convert(group, "");

  return {
    schema: "controls",
    capsuleName: doc.templateName || doc.composition,
    enabledLayers: doc.enabledLayers,
    clientControls,
  };
};

/** Parse `controls.json` into the in-memory Styles tree. */
export const normalizeDefinition = (raw: unknown): MogrtDefinition => {
  if (!raw || typeof raw !== "object") return { clientControls: [] };
  if (isControlsDocument(raw)) return controlsToDefinition(raw);
  const def = raw as MogrtDefinition;
  if (Array.isArray(def.clientControls)) {
    return def.schema === "controls" ? def : { ...def, schema: "controls" };
  }
  return { clientControls: [] };
};
