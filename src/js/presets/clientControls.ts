import type {
  ClientControl,
  ControlTreeNode,
  ControlValue,
  ControlValues,
  LocalizedStr,
  MogrtDefinition,
  PointValue,
} from "./types";
import { ControlType } from "./types";
import { CEP_WRITTEN_SYSTEM_NAMES } from "../../shared/caption-system";

export const uiName = (control: ClientControl, locale = "en_US"): string => {
  const db = control.uiName?.strDB;
  if (!db?.length) return control.id;
  return db.find((e) => e.localeString === locale)?.str ?? db[0]?.str ?? control.id;
};

export const isGroup = (c: ClientControl) => c.type === ControlType.Group;

/**
 * Hidden from Styles UI (flag from controls.json, or legacy name containing "hidden").
 * Values are still applied to the shared master template.
 */
export const isHiddenUiGroup = (control: ClientControl): boolean => {
  if (!isGroup(control)) return false;
  if (control.hidden === true) return true;
  return uiName(control).toLowerCase().includes("hidden");
};

const isCepWrittenControl = (control: ClientControl): boolean =>
  (CEP_WRITTEN_SYSTEM_NAMES as readonly string[]).includes(uiName(control));

export const isPointValue = (v: unknown): v is PointValue =>
  !!v && typeof v === "object" && !Array.isArray(v) && "x" in v && "y" in v;

export const isColorArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length >= 3 && v.every((n) => typeof n === "number");

export const isLocalizedStr = (v: unknown): v is LocalizedStr =>
  !!v && typeof v === "object" && "strDB" in (v as object);

const cloneValue = (value: ControlValue): ControlValue => {
  if (Array.isArray(value)) return [...value];
  if (isPointValue(value)) return { ...value };
  if (isLocalizedStr(value)) return JSON.parse(JSON.stringify(value)) as LocalizedStr;
  return value;
};

/** Плоский индекс всех clientControls по id. */
export const indexControls = (definition: MogrtDefinition): Map<string, ClientControl> => {
  const map = new Map<string, ClientControl>();
  for (const c of definition.clientControls ?? []) map.set(c.id, c);
  return map;
};

/** id, на которые ссылаются группы. */
const referencedIds = (controls: ClientControl[]): Set<string> => {
  const refs = new Set<string>();
  for (const c of controls) {
    if (!isGroup(c) || !Array.isArray(c.value)) continue;
    for (const id of c.value) {
      if (typeof id === "string") refs.add(id);
    }
  }
  return refs;
};

/** Корневые группы (не вложены в другие). */
export const getRootGroups = (definition: MogrtDefinition): ClientControl[] => {
  const controls = definition.clientControls ?? [];
  const refs = referencedIds(controls);
  return controls.filter((c) => isGroup(c) && !refs.has(c.id));
};

const groupChildren = (control: ClientControl, byId: Map<string, ClientControl>): ClientControl[] => {
  if (!isGroup(control) || !Array.isArray(control.value)) return [];
  const kids: ClientControl[] = [];
  for (const id of control.value) {
    if (typeof id === "string") {
      const child = byId.get(id);
      if (child) kids.push(child);
    }
  }
  return kids;
};

const buildNode = (
  control: ClientControl,
  byId: Map<string, ClientControl>,
  seen: Set<string> = new Set(),
): ControlTreeNode => {
  if (!isGroup(control) || !Array.isArray(control.value)) {
    return { kind: "control", control };
  }
  if (seen.has(control.id)) {
    return { kind: "group", control, children: [] };
  }
  const nextSeen = new Set(seen);
  nextSeen.add(control.id);
  const children: ControlTreeNode[] = [];
  for (const child of groupChildren(control, byId)) {
    if (isHiddenUiGroup(child)) continue;
    if (!isGroup(child) && isCepWrittenControl(child)) continue;
    const node = buildNode(child, byId, nextSeen);
    if (node.kind === "group" && !node.children.length) continue;
    children.push(node);
  }
  return { kind: "group", control, children };
};

/** Styles tree — order is the groups array in controls.json. Hidden groups omitted. */
export const buildUiTree = (definition: MogrtDefinition): ControlTreeNode[] => {
  const byId = indexControls(definition);
  return getRootGroups(definition)
    .filter((g) => !isHiddenUiGroup(g))
    .map((g) => buildNode(g, byId))
    .filter((n) => n.kind !== "group" || n.children.length > 0);
};

/**
 * Default values for every leaf that should be written to the host.
 * Includes hidden-group leaves (shared master look). Skips CEP-written system props.
 * `init` overlays matching EP names so Styles sliders match the create/style-change write.
 */
export const defaultsFromDefinition = (definition: MogrtDefinition): ControlValues => {
  const values: ControlValues = {};
  for (const c of definition.clientControls ?? []) {
    if (isGroup(c)) continue;
    if ((CEP_WRITTEN_SYSTEM_NAMES as readonly string[]).includes(uiName(c))) continue;
    values[c.id] = cloneValue(c.value as ControlValue);
  }
  return withInitApplyValues(values, definition);
};

export const getControlValue = (values: ControlValues, control: ClientControl): ControlValue => {
  const current = values[control.id];
  if (current !== undefined) return current;
  return cloneValue(control.value as ControlValue);
};

/** PostScript system name for Caption Font EP — plain string only. */
export const fontIdFromValue = (value: ControlValue | undefined): string => {
  if (typeof value === "string") return value.trim();
  if (isLocalizedStr(value)) return (value.strDB?.[0]?.str ?? "").trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    for (const key of ["systemName", "fontEditValue", "postscriptName", "postScriptName", "fontName", "font"]) {
      const raw = rec[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
  }
  return "";
};

export const isFontControl = (control: ClientControl): boolean => {
  if (control.type === ControlType.FontMenu) return true;
  if (control.fonteditinfo) return true;
  const name = uiName(control).toLowerCase();
  if (name === "caption font" || name === "font") return true;
  const source = String(control.source || control.essentialName || "").toLowerCase();
  return source.startsWith("caption font");
};

export const findFontControl = (definition?: MogrtDefinition | null): ClientControl | null => {
  if (!definition) return null;
  for (const c of definition.clientControls ?? []) {
    if (isGroup(c)) continue;
    if (isFontControl(c)) return c;
  }
  return null;
};

/** Найти контрол по цепочке uiName, напр. ["Follow", "Background", "Fill"]. */
export const findControlByNames = (
  definition: MogrtDefinition,
  names: string[],
): ClientControl | null => {
  // Walk full tree including hidden groups (swatches / lookups may target them).
  const byId = indexControls(definition);
  let current: ClientControl[] = getRootGroups(definition);
  let found: ClientControl | null = null;

  for (const name of names) {
    const match = current.find((c) => uiName(c) === name);
    if (!match) return null;
    found = match;
    current = isGroup(match) ? groupChildren(match, byId) : [];
  }
  return found;
};

/** First matching path in the Styles tree, e.g. ["Follow", "Background", "Fill"]. */
export const findControlByAnyNames = (
  definition: MogrtDefinition,
  paths: string[][],
): ClientControl | null => {
  for (let i = 0; i < paths.length; i++) {
    const found = findControlByNames(definition, paths[i]);
    if (found) return found;
  }
  return null;
};

/** Плоский список leaf-контролов с путём uiName — для применения в AE/PPro. */
export type StylePropPayload = {
  path: string[];
  type: number;
  value: ControlValue;
  /**
   * Порядковый индекс среди листьев с тем же display-именем в порядке definition
   * (0 = первый Fill, 1 = второй Fill, …). Нужен Premiere: mogrt отдаёт плоский
   * список имён без групп, и delta-apply не может надёжно матчить «первый unused».
   */
  leafIndex: number;
  /** controls.json: layer/effect path, e.g. Captions_Settings/Effects/Position. */
  essentialName?: string;
  source?: string;
};

/**
 * Flat list of leaf props for host apply.
 * Includes hidden-group leaves (Enabled, Global, Follow, animation, reveal).
 * Skips CEP-written system props (Segment Type, batches, …).
 */
export const stylePropsFromValues = (
  definition: MogrtDefinition,
  values: ControlValues,
): StylePropPayload[] => {
  const byId = indexControls(definition);
  const out: StylePropPayload[] = [];
  const leafCounts: Record<string, number> = {};

  const walk = (control: ClientControl, path: string[], seen: Set<string>) => {
    if (seen.has(control.id)) return;
    const nextSeen = new Set(seen);
    nextSeen.add(control.id);
    const name = uiName(control);
    const nextPath = path.concat([name]);
    if (isGroup(control)) {
      if (!Array.isArray(control.value)) return;
      for (let i = 0; i < control.value.length; i++) {
        const id = control.value[i];
        if (typeof id !== "string") continue;
        const child = byId.get(id);
        if (child) walk(child, nextPath, nextSeen);
      }
      return;
    }
    // captions_batch_* / Segment Type / Line Count / … — CEP-owned
    if ((CEP_WRITTEN_SYSTEM_NAMES as readonly string[]).includes(name)) return;
    const current = values[control.id];
    const raw = current !== undefined ? current : cloneValue(control.value as ControlValue);
    const font = isFontControl(control);
    const fontId = font ? fontIdFromValue(raw) : "";
    if (font && !fontId) return;
    const leafIndex = leafCounts[name] ?? 0;
    leafCounts[name] = leafIndex + 1;
    // Flat mogrt: match key is controls.json `source` (Layer>Effects>Name>Kind).
    const matchKey = control.source || control.essentialName || "";
    const essentialPath = matchKey
      ? String(matchKey)
          .replace(/>/g, "/")
          .split("/")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (font) {
      out.push({
        path: ["Caption Font"],
        type: ControlType.FontMenu,
        value: fontId,
        leafIndex,
        essentialName: "Caption Font",
        source: "Caption Font",
      });
      return;
    }
    const value = isLocalizedStr(raw) ? fontId || raw : raw;
    out.push({
      path: essentialPath.length ? essentialPath : nextPath,
      type: control.type,
      value,
      leafIndex,
      essentialName: matchKey || control.essentialName,
      source: control.source || matchKey || undefined,
    });
  };

  const roots = getRootGroups(definition);
  if (roots.length) {
    for (let i = 0; i < roots.length; i++) {
      walk(roots[i], [], new Set());
    }
  } else {
    const controls = definition.clientControls ?? [];
    for (let i = 0; i < controls.length; i++) {
      if (!isGroup(controls[i])) walk(controls[i], [], new Set());
    }
  }

  return out;
};

/** Host-only layout for catalog (non-user) styles — not the dumped controls.json defaults. */
export const CATALOG_LAYOUT_OVERRIDES: { source: string; value: number }[] = [
  { source: "Captions_Settings>Effects>Padding>Slider", value: 350 },
  { source: "Captions_Settings>Effects>Scale>Slider", value: 200 },
];

const normalizeSourceKey = (s: string): string =>
  String(s || "")
    .replace(/\//g, ">")
    .replace(/\s+/g, "")
    .toLowerCase();

export const findControlBySource = (
  definition: MogrtDefinition,
  source: string,
): ClientControl | null => {
  const want = normalizeSourceKey(source);
  if (!want) return null;
  for (const c of definition.clientControls ?? []) {
    if (isGroup(c)) continue;
    if (normalizeSourceKey(String(c.source || c.essentialName || "")) === want) return c;
  }
  return null;
};

/**
 * Catalog / downloaded apply (legacy dumps without `init`):
 * font from controls.json, plus Padding=350 / Scale=200.
 */
export const withCatalogApplyValues = (
  values: ControlValues,
  definition: MogrtDefinition,
): ControlValues => {
  const next = { ...values };
  const font = findFontControl(definition);
  if (font) {
    const fontId = fontIdFromValue(font.value as ControlValue);
    if (fontId) next[font.id] = fontId;
  }
  for (const item of CATALOG_LAYOUT_OVERRIDES) {
    const control = findControlBySource(definition, item.source);
    if (control) next[control.id] = item.value;
  }
  return next;
};

const KIND_TYPE: Record<string, number> = {
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

const isCepWrittenName = (name: string): boolean =>
  (CEP_WRITTEN_SYSTEM_NAMES as readonly string[]).includes(name);

const initValueToControlValue = (value: unknown, type: number): ControlValue => {
  if (type === ControlType.Point) {
    if (isPointValue(value)) return { ...value };
    if (Array.isArray(value) && value.length >= 2) {
      return { x: Number(value[0]) || 0, y: Number(value[1]) || 0 };
    }
    return { x: 0, y: 0 };
  }
  if (type === ControlType.Checkbox) return value === true || value === 1 || value === "1";
  if (type === ControlType.Color && Array.isArray(value)) return value.map((n) => Number(n) || 0);
  if (type === ControlType.FontMenu) {
    const fontId = fontIdFromValue(value as ControlValue);
    return fontId || (typeof value === "string" ? value : "");
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  if (Array.isArray(value)) return value as number[];
  if (isPointValue(value)) return { ...value };
  return 0;
};

const typeForInitName = (
  name: string,
  kind: string | undefined,
  value: unknown,
  matched?: ClientControl,
): number => {
  if (name === "Caption Font" || name === "Font") return ControlType.FontMenu;
  if (matched) return matched.type;
  const fromKind = KIND_TYPE[String(kind || "").toLowerCase()];
  if (fromKind) return fromKind;
  if (typeof value === "boolean") return ControlType.Checkbox;
  if (isColorArray(value)) return ControlType.Color;
  if (isPointValue(value)) return ControlType.Point;
  if (Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number")) {
    return ControlType.Point;
  }
  if (typeof value === "string") return ControlType.Text;
  return ControlType.Slider;
};

export const matchControlForInit = (
  definition: MogrtDefinition,
  name: string,
  occ: number,
): ClientControl | undefined => {
  const hits: ClientControl[] = [];
  for (const c of definition.clientControls ?? []) {
    if (isGroup(c)) continue;
    if (uiName(c) === name) hits.push(c);
  }
  if (hits[occ]) return hits[occ];
  const bySource = findControlBySource(definition, name);
  if (bySource) return bySource;
  return hits[0];
};

/**
 * Overlay controls.json `init` onto Styles values (match by Essential Graphics name).
 */
export const withInitApplyValues = (values: ControlValues, definition: MogrtDefinition): ControlValues => {
  const init = definition.init;
  if (!init?.length) return values;
  const next = { ...values };
  const nameCounts: Record<string, number> = {};
  for (let i = 0; i < init.length; i++) {
    const name = String(init[i].name || "").trim();
    if (!name || isCepWrittenName(name)) continue;
    const occ = nameCounts[name] ?? 0;
    nameCounts[name] = occ + 1;
    const matched = matchControlForInit(definition, name, occ);
    if (!matched) continue;
    const type = typeForInitName(name, init[i].kind, init[i].value, matched);
    next[matched.id] = initValueToControlValue(init[i].value, type);
  }
  return next;
};

/** Catalog apply: `init` snapshot when present, else legacy font/Padding/Scale. */
export const catalogApplyValues = (
  values: ControlValues,
  definition: MogrtDefinition,
): ControlValues => {
  if (definition.init?.length) return withInitApplyValues(values, definition);
  return withCatalogApplyValues(values, definition);
};

/**
 * Loop `controls.json` `init`: match Essential Graphics by `name`, write `value`.
 * Skips CEP-owned system props (batches, Segment Type, Line Count, …).
 */
export const stylePropsFromInit = (definition: MogrtDefinition): StylePropPayload[] => {
  const init = definition.init;
  if (!init?.length) return [];
  const nameCounts: Record<string, number> = {};
  const out: StylePropPayload[] = [];
  for (let i = 0; i < init.length; i++) {
    const item = init[i];
    const name = String(item.name || "").trim();
    if (!name || isCepWrittenName(name)) continue;
    const occ = nameCounts[name] ?? 0;
    nameCounts[name] = occ + 1;
    const matched = matchControlForInit(definition, name, occ);
    const type = typeForInitName(name, item.kind, item.value, matched);
    const value = initValueToControlValue(item.value, type);
    if (type === ControlType.FontMenu) {
      const fontId = fontIdFromValue(value);
      if (!fontId) continue;
      out.push({
        path: ["Caption Font"],
        type: ControlType.FontMenu,
        value: fontId,
        leafIndex: occ,
        essentialName: "Caption Font",
        source: "Caption Font",
      });
      continue;
    }
    out.push({
      path: [name],
      type,
      value,
      leafIndex: occ,
      essentialName: name,
      source: name,
    });
  }
  return out;
};

const stylePropKey = (prop: StylePropPayload): string =>
  prop.source || prop.essentialName || prop.path.join("\0");

/** Только изменившиеся листья — полный список на каждый слайдер вешает Premiere. */
export const diffStyleProps = (
  previous: StylePropPayload[] | null | undefined,
  next: StylePropPayload[],
): StylePropPayload[] => {
  if (!previous || !previous.length) return next;
  const prevByKey: Record<string, string> = {};
  for (let i = 0; i < previous.length; i++) {
    prevByKey[stylePropKey(previous[i])] = JSON.stringify(previous[i].value);
  }
  const changed: StylePropPayload[] = [];
  for (let i = 0; i < next.length; i++) {
    const key = stylePropKey(next[i]);
    if (prevByKey[key] !== JSON.stringify(next[i].value)) changed.push(next[i]);
  }
  return changed;
};
