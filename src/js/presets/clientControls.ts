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

export const uiName = (control: ClientControl, locale = "en_US"): string => {
  const db = control.uiName?.strDB;
  if (!db?.length) return control.id;
  return db.find((e) => e.localeString === locale)?.str ?? db[0]?.str ?? control.id;
};

export const isGroup = (c: ClientControl) => c.type === ControlType.Group;

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

/** Корневые группы (не вложены в другие) — Text, Background, Highlight, Global, System. */
export const getRootGroups = (definition: MogrtDefinition): ClientControl[] => {
  const controls = definition.clientControls ?? [];
  const refs = referencedIds(controls);
  return controls.filter((c) => isGroup(c) && !refs.has(c.id));
};

const buildNode = (control: ClientControl, byId: Map<string, ClientControl>): ControlTreeNode => {
  if (!isGroup(control) || !Array.isArray(control.value)) {
    return { kind: "control", control };
  }
  // в definition.json children группы записаны в обратном порядке (как в AE)
  const children: ControlTreeNode[] = [];
  for (const id of [...control.value].reverse()) {
    if (typeof id !== "string") continue;
    const child = byId.get(id);
    if (child) children.push(buildNode(child, byId));
  }
  return { kind: "group", control, children };
};

/**
 * Дерево UI прямо из definition.clientControls.
 * System-группу пропускаем — сырой транскрипт / Segment Type / Height пишет CEP.
 * Pause Gap / Hold Duration показываем отдельно в конце Styles (см. getStylesTrailingControls).
 */
export const buildUiTree = (definition: MogrtDefinition): ControlTreeNode[] => {
  const byId = indexControls(definition);
  return getRootGroups(definition)
    .filter((g) => uiName(g).toLowerCase() !== "system")
    .map((g) => buildNode(g, byId));
};

/** Имена System-слайдеров, которые редактируются на вкладке Styles (без группы). */
export const STYLES_TRAILING_SYSTEM_NAMES = ["Pause Gap", "Hold Duration"] as const;

const getSystemGroup = (definition: MogrtDefinition): ClientControl | null =>
  getRootGroups(definition).find((g) => uiName(g).toLowerCase() === "system") ?? null;

/**
 * Pause Gap / Hold Duration из System — плоский хвост Styles UI.
 * Порядок как в STYLES_TRAILING_SYSTEM_NAMES, не как в AE child list.
 */
export const getStylesTrailingControls = (definition: MogrtDefinition): ClientControl[] => {
  const system = getSystemGroup(definition);
  if (!system || !Array.isArray(system.value)) return [];
  const byId = indexControls(definition);
  const byName = new Map<string, ClientControl>();
  for (const id of system.value) {
    if (typeof id !== "string") continue;
    const child = byId.get(id);
    if (!child || isGroup(child)) continue;
    byName.set(uiName(child), child);
  }
  const out: ClientControl[] = [];
  for (const name of STYLES_TRAILING_SYSTEM_NAMES) {
    const c = byName.get(name);
    if (c) out.push(c);
  }
  return out;
};

/** Дефолтные значения по UUID (группы пропускаем). */
export const defaultsFromDefinition = (definition: MogrtDefinition): ControlValues => {
  const values: ControlValues = {};
  for (const c of definition.clientControls ?? []) {
    if (isGroup(c)) continue;
    values[c.id] = cloneValue(c.value as ControlValue);
  }
  return values;
};

export const getControlValue = (values: ControlValues, control: ClientControl): ControlValue => {
  const current = values[control.id];
  if (current !== undefined) return current;
  return cloneValue(control.value as ControlValue);
};

/** Найти контрол по цепочке uiName, напр. ["Text","Base","Fill"]. */
export const findControlByNames = (
  definition: MogrtDefinition,
  names: string[],
): ClientControl | null => {
  const byId = indexControls(definition);
  let nodes = getRootGroups(definition).map((g) => buildNode(g, byId));
  let found: ClientControl | null = null;

  for (const name of names) {
    const match = nodes.find((n) => uiName(n.control) === name);
    if (!match) return null;
    found = match.control;
    nodes = match.kind === "group" ? match.children : [];
  }
  return found;
};

/** Плоский список leaf-контролов с путём uiName — для применения в AE/PPro. */
export type StylePropPayload = {
  path: string[];
  type: number;
  value: ControlValue;
};

export const stylePropsFromValues = (
  definition: MogrtDefinition,
  values: ControlValues,
): StylePropPayload[] => {
  const byId = indexControls(definition);
  const out: StylePropPayload[] = [];

  const walk = (control: ClientControl, path: string[]) => {
    const name = uiName(control);
    const nextPath = path.concat([name]);
    if (isGroup(control)) {
      if (!Array.isArray(control.value)) return;
      for (let i = 0; i < control.value.length; i++) {
        const id = control.value[i];
        if (typeof id !== "string") continue;
        const child = byId.get(id);
        if (child) walk(child, nextPath);
      }
      return;
    }
    const current = values[control.id];
    out.push({
      path: nextPath,
      type: control.type,
      value: current !== undefined ? current : cloneValue(control.value as ControlValue),
    });
  };

  const roots = getRootGroups(definition);
  for (let i = 0; i < roots.length; i++) {
    if (uiName(roots[i]).toLowerCase() === "system") continue;
    walk(roots[i], []);
  }

  // Pause Gap / Hold Duration — в System для mogrt, в Styles UI без группы.
  // path с "System", чтобы AE Essential Properties находил группу.
  for (const control of getStylesTrailingControls(definition)) {
    const current = values[control.id];
    out.push({
      path: ["System", uiName(control)],
      type: control.type,
      value: current !== undefined ? current : cloneValue(control.value as ControlValue),
    });
  }

  return out;
};
