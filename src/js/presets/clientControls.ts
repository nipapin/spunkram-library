import type {
  ClientControl,
  ControlTreeNode,
  ControlValue,
  ControlValues,
  LocalizedStr,
  MogrtDefinition,
  PointValue,
  UiOrderNode,
} from "./types";
import { ControlType } from "./types";
import { CEP_WRITTEN_SYSTEM_NAMES } from "../../shared/caption-system";
import rawUiOrder from "./ui-order.json";

const asUiOrder = (raw: unknown): UiOrderNode[] => {
  if (Array.isArray(raw)) return raw as UiOrderNode[];
  if (raw && typeof raw === "object" && "default" in raw) {
    const nested = (raw as { default: unknown }).default;
    if (Array.isArray(nested)) return nested as UiOrderNode[];
  }
  return [];
};

export const PRESET_UI_ORDER = asUiOrder(rawUiOrder);

export const uiName = (control: ClientControl, locale = "en_US"): string => {
  const db = control.uiName?.strDB;
  if (!db?.length) return control.id;
  return db.find((e) => e.localeString === locale)?.str ?? db[0]?.str ?? control.id;
};

export const isGroup = (c: ClientControl) => c.type === ControlType.Group;

/** Группа с `hidden` в uiName — не показываем её и всех детей. */
export const isHiddenUiGroup = (control: ClientControl): boolean =>
  isGroup(control) && uiName(control).toLowerCase().includes("hidden");

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

const normName = (name: string): string => name.trim().toLowerCase();

const findOrderNode = (order: UiOrderNode[] | undefined, name: string): UiOrderNode | undefined =>
  order?.find((n) => normName(n.name) === normName(name));

const childOrder = (order: UiOrderNode[] | undefined, name: string): UiOrderNode[] | undefined =>
  findOrderNode(order, name)?.children;

/** Достаём детей группы из definition, затем расставляем по ui-order (не sort). */
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

const pickInOrder = (controls: ClientControl[], order?: UiOrderNode[]): ClientControl[] => {
  if (!order?.length) return controls;
  const remaining = [...controls];
  const out: ClientControl[] = [];
  for (const node of order) {
    const i = remaining.findIndex((c) => normName(uiName(c)) === normName(node.name));
    if (i >= 0) out.push(remaining.splice(i, 1)[0]);
  }
  return out.concat(remaining);
};

const buildNode = (
  control: ClientControl,
  byId: Map<string, ClientControl>,
  order?: UiOrderNode[],
): ControlTreeNode => {
  if (!isGroup(control) || !Array.isArray(control.value)) {
    return { kind: "control", control };
  }
  const children: ControlTreeNode[] = [];
  for (const child of pickInOrder(groupChildren(control, byId), order)) {
    if (isHiddenUiGroup(child)) continue;
    children.push(buildNode(child, byId, childOrder(order, uiName(child))));
  }
  return { kind: "group", control, children };
};

/**
 * Дерево Styles UI: типы/id из definition, порядок siblings из ui-order.json (дамп AE EP).
 * Имя из order без контрола в definition пропускается; лишний контрол — в конец группы.
 * Группы с `hidden` в названии (и все их дети) не показываем.
 */
export const buildUiTree = (
  definition: MogrtDefinition,
  order: UiOrderNode[] = PRESET_UI_ORDER,
): ControlTreeNode[] => {
  const byId = indexControls(definition);
  const roots = pickInOrder(
    getRootGroups(definition).filter((g) => !isHiddenUiGroup(g)),
    order,
  );
  return roots.map((g) => buildNode(g, byId, childOrder(order, uiName(g))));
};

/** id контролов внутри hidden-групп — не Styles UI и не preset.values. */
const hiddenControlIds = (definition: MogrtDefinition): Set<string> => {
  const byId = indexControls(definition);
  const skip = new Set<string>();
  const mark = (control: ClientControl) => {
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

/** Дефолтные значения по UUID (группы, hidden и CEP-written System props пропускаем). */
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

/** Найти контрол по цепочке uiName, напр. ["Static Segment","Fill"]. */
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

/** First matching path — new mogrt uses Static Segment; legacy used Segment Static. */
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
};

export const stylePropsFromValues = (
  definition: MogrtDefinition,
  values: ControlValues,
): StylePropPayload[] => {
  const byId = indexControls(definition);
  const out: StylePropPayload[] = [];
  const leafCounts: Record<string, number> = {};

  const walk = (control: ClientControl, path: string[]) => {
    if (isHiddenUiGroup(control)) return;
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
    // captions_batch_* / system text — не Styles; Caption Font оставляем
    if ((CEP_WRITTEN_SYSTEM_NAMES as readonly string[]).includes(name)) return;
    const current = values[control.id];
    const leafIndex = leafCounts[name] ?? 0;
    leafCounts[name] = leafIndex + 1;
    out.push({
      path: nextPath,
      type: control.type,
      value: current !== undefined ? current : cloneValue(control.value as ControlValue),
      leafIndex,
    });
  };

  const roots = getRootGroups(definition);
  for (let i = 0; i < roots.length; i++) {
    walk(roots[i], []);
  }

  return out;
};

const stylePropKey = (prop: StylePropPayload): string => prop.path.join("\0");

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
