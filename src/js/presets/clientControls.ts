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

/** Группа с `hidden` в uiName — не показываем её и всех детей. */
export const isHiddenUiGroup = (control: ClientControl): boolean =>
  isGroup(control) && uiName(control).toLowerCase().includes("hidden");

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
    if (typeof id !== "string") continue;
    const child = byId.get(id);
    if (child) kids.push(child);
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

/** Styles tree — order is the groups array in controls.json. */
export const buildUiTree = (definition: MogrtDefinition): ControlTreeNode[] => {
  const byId = indexControls(definition);
  return getRootGroups(definition)
    .filter((g) => !isHiddenUiGroup(g))
    .map((g) => buildNode(g, byId))
    .filter((n) => n.kind !== "group" || n.children.length > 0);
};

/** id контролов внутри hidden-групп — не Styles UI и не preset.values. */
const hiddenControlIds = (definition: MogrtDefinition): Set<string> => {
  const byId = indexControls(definition);
  const skip = new Set<string>();
  const mark = (control: ClientControl) => {
    if (skip.has(control.id)) return;
    skip.add(control.id);
    if (!isGroup(control) || !Array.isArray(control.value)) return;
    for (const id of control.value) {
      if (typeof id !== "string") continue;
      const child = byId.get(id);
      if (child) mark(child);
    }
  };
  for (const c of definition.clientControls ?? []) {
    if (isHiddenUiGroup(c)) mark(c);
  }
  return skip;
};

/** Дефолтные значения по uiPath (группы, hidden и CEP-written System props пропускаем). */
export const defaultsFromDefinition = (definition: MogrtDefinition): ControlValues => {
  const skipIds = hiddenControlIds(definition);
  const values: ControlValues = {};
  for (const c of definition.clientControls ?? []) {
    if (isGroup(c) || skipIds.has(c.id)) continue;
    if ((CEP_WRITTEN_SYSTEM_NAMES as readonly string[]).includes(uiName(c))) continue;
    values[c.id] = cloneValue(c.value as ControlValue);
  }
  return values;
};

export const getControlValue = (values: ControlValues, control: ClientControl): ControlValue => {
  const current = values[control.id];
  if (current !== undefined) return current;
  return cloneValue(control.value as ControlValue);
};

/** PostScript id stored by font-menu / Caption Font. */
export const fontIdFromValue = (value: ControlValue | undefined): string => {
  if (typeof value === "string") return value;
  if (isLocalizedStr(value)) return value.strDB?.[0]?.str ?? "";
  return "";
};

export const isFontControl = (control: ClientControl): boolean => {
  if (control.type === ControlType.FontMenu) return true;
  if (control.fonteditinfo) return true;
  const name = uiName(control).toLowerCase();
  return name === "caption font" || name === "font";
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
  let nodes = buildUiTree(definition);
  let found: ClientControl | null = null;

  for (const name of names) {
    const match = nodes.find((n) => uiName(n.control) === name);
    if (!match) return null;
    found = match.control;
    nodes = match.kind === "group" ? match.children : [];
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

export const stylePropsFromValues = (
  definition: MogrtDefinition,
  values: ControlValues,
): StylePropPayload[] => {
  const byId = indexControls(definition);
  const out: StylePropPayload[] = [];
  const leafCounts: Record<string, number> = {};

  const walk = (control: ClientControl, path: string[], seen: Set<string>) => {
    if (isHiddenUiGroup(control) || seen.has(control.id)) return;
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
    // captions_batch_* / system text — не Styles; Caption Font оставляем
    if ((CEP_WRITTEN_SYSTEM_NAMES as readonly string[]).includes(name)) return;
    const current = values[control.id];
    const raw = current !== undefined ? current : cloneValue(control.value as ControlValue);
    const font = isFontControl(control);
    const fontId = font ? fontIdFromValue(raw) : "";
    if (font && !fontId) return;
    const leafIndex = leafCounts[name] ?? 0;
    leafCounts[name] = leafIndex + 1;
    const essentialPath = control.essentialName
      ? String(control.essentialName)
          .replace(/>/g, "/")
          .split("/")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const value =
      font || isLocalizedStr(raw)
        ? fontId || raw
        : raw;
    out.push({
      path: essentialPath.length ? essentialPath : nextPath,
      type: control.type,
      value,
      leafIndex,
      essentialName: control.essentialName,
      source: control.source,
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

const stylePropKey = (prop: StylePropPayload): string =>
  prop.essentialName || prop.path.join("\0");

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
