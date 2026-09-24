import { ControlType } from "./types";
import { CEP_WRITTEN_SYSTEM_NAMES } from "../../shared/caption-system";
export const uiName = (control, locale = "en_US") => {
    const db = control.uiName?.strDB;
    if (!db?.length)
        return control.id;
    return db.find((e) => e.localeString === locale)?.str ?? db[0]?.str ?? control.id;
};
export const isGroup = (c) => c.type === ControlType.Group;
/**
 * Hidden from Styles UI (flag from controls.json, or legacy name containing "hidden").
 * Values are still applied to the shared master template.
 */
export const isHiddenUiGroup = (control) => {
    if (!isGroup(control))
        return false;
    if (control.hidden === true)
        return true;
    return uiName(control).toLowerCase().includes("hidden");
};
const isCepWrittenControl = (control) => CEP_WRITTEN_SYSTEM_NAMES.includes(uiName(control));
export const isPointValue = (v) => !!v && typeof v === "object" && !Array.isArray(v) && "x" in v && "y" in v;
export const isColorArray = (v) => Array.isArray(v) && v.length >= 3 && v.every((n) => typeof n === "number");
export const isLocalizedStr = (v) => !!v && typeof v === "object" && "strDB" in v;
const cloneValue = (value) => {
    if (Array.isArray(value))
        return [...value];
    if (isPointValue(value))
        return { ...value };
    if (isLocalizedStr(value))
        return JSON.parse(JSON.stringify(value));
    return value;
};
/** Плоский индекс всех clientControls по id. */
export const indexControls = (definition) => {
    const map = new Map();
    for (const c of definition.clientControls ?? [])
        map.set(c.id, c);
    return map;
};
/** id, на которые ссылаются группы. */
const referencedIds = (controls) => {
    const refs = new Set();
    for (const c of controls) {
        if (!isGroup(c) || !Array.isArray(c.value))
            continue;
        for (const id of c.value) {
            if (typeof id === "string")
                refs.add(id);
        }
    }
    return refs;
};
/** Корневые группы (не вложены в другие). */
export const getRootGroups = (definition) => {
    const controls = definition.clientControls ?? [];
    const refs = referencedIds(controls);
    return controls.filter((c) => isGroup(c) && !refs.has(c.id));
};
const groupChildren = (control, byId) => {
    if (!isGroup(control) || !Array.isArray(control.value))
        return [];
    const kids = [];
    for (const id of control.value) {
        if (typeof id === "string") {
            const child = byId.get(id);
            if (child)
                kids.push(child);
        }
    }
    return kids;
};
const buildNode = (control, byId, seen = new Set()) => {
    if (!isGroup(control) || !Array.isArray(control.value)) {
        return { kind: "control", control };
    }
    if (seen.has(control.id)) {
        return { kind: "group", control, children: [] };
    }
    const nextSeen = new Set(seen);
    nextSeen.add(control.id);
    const children = [];
    for (const child of groupChildren(control, byId)) {
        if (isHiddenUiGroup(child))
            continue;
        if (!isGroup(child) && isCepWrittenControl(child))
            continue;
        const node = buildNode(child, byId, nextSeen);
        if (node.kind === "group" && !node.children.length)
            continue;
        children.push(node);
    }
    return { kind: "group", control, children };
};
/** Styles tree — order is the groups array in controls.json. Hidden groups omitted. */
export const buildUiTree = (definition) => {
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
export const defaultsFromDefinition = (definition) => {
    const values = {};
    for (const c of definition.clientControls ?? []) {
        if (isGroup(c))
            continue;
        if (CEP_WRITTEN_SYSTEM_NAMES.includes(uiName(c)))
            continue;
        values[c.id] = cloneValue(c.value);
    }
    return withInitApplyValues(values, definition);
};
export const getControlValue = (values, control) => {
    const current = values[control.id];
    if (current !== undefined)
        return current;
    return cloneValue(control.value);
};
/** PostScript system name for Caption Font EP — plain string only. */
export const fontIdFromValue = (value) => {
    if (typeof value === "string")
        return value.trim();
    if (isLocalizedStr(value))
        return (value.strDB?.[0]?.str ?? "").trim();
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const rec = value;
        for (const key of ["systemName", "fontEditValue", "postscriptName", "postScriptName", "fontName", "font"]) {
            const raw = rec[key];
            if (typeof raw === "string" && raw.trim())
                return raw.trim();
        }
    }
    return "";
};
export const isFontControl = (control) => {
    if (control.type === ControlType.FontMenu)
        return true;
    if (control.fonteditinfo)
        return true;
    const name = uiName(control).toLowerCase();
    if (name === "caption font" || name === "font")
        return true;
    const source = String(control.source || control.essentialName || "").toLowerCase();
    return source.startsWith("caption font");
};
export const findFontControl = (definition) => {
    if (!definition)
        return null;
    for (const c of definition.clientControls ?? []) {
        if (isGroup(c))
            continue;
        if (isFontControl(c))
            return c;
    }
    return null;
};
/** Найти контрол по цепочке uiName, напр. ["Follow", "Background", "Fill"]. */
export const findControlByNames = (definition, names) => {
    // Walk full tree including hidden groups (swatches / lookups may target them).
    const byId = indexControls(definition);
    let current = getRootGroups(definition);
    let found = null;
    for (const name of names) {
        const match = current.find((c) => uiName(c) === name);
        if (!match)
            return null;
        found = match;
        current = isGroup(match) ? groupChildren(match, byId) : [];
    }
    return found;
};
/** First matching path in the Styles tree, e.g. ["Follow", "Background", "Fill"]. */
export const findControlByAnyNames = (definition, paths) => {
    for (let i = 0; i < paths.length; i++) {
        const found = findControlByNames(definition, paths[i]);
        if (found)
            return found;
    }
    return null;
};
/**
 * Flat list of leaf props for host apply.
 * Includes hidden-group leaves (Enabled, Global, Follow, animation, reveal).
 * Skips CEP-written system props (Segment Type, batches, …).
 */
export const stylePropsFromValues = (definition, values) => {
    const byId = indexControls(definition);
    const out = [];
    const leafCounts = {};
    const walk = (control, path, seen) => {
        if (seen.has(control.id))
            return;
        const nextSeen = new Set(seen);
        nextSeen.add(control.id);
        const name = uiName(control);
        const nextPath = path.concat([name]);
        if (isGroup(control)) {
            if (!Array.isArray(control.value))
                return;
            for (let i = 0; i < control.value.length; i++) {
                const id = control.value[i];
                if (typeof id !== "string")
                    continue;
                const child = byId.get(id);
                if (child)
                    walk(child, nextPath, nextSeen);
            }
            return;
        }
        // captions_batch_* / Segment Type / Line Count / … — CEP-owned
        if (CEP_WRITTEN_SYSTEM_NAMES.includes(name))
            return;
        const current = values[control.id];
        const raw = current !== undefined ? current : cloneValue(control.value);
        const font = isFontControl(control);
        const fontId = font ? fontIdFromValue(raw) : "";
        if (font && !fontId)
            return;
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
    }
    else {
        const controls = definition.clientControls ?? [];
        for (let i = 0; i < controls.length; i++) {
            if (!isGroup(controls[i]))
                walk(controls[i], [], new Set());
        }
    }
    return out;
};
/** Host-only layout for catalog (non-user) styles — not the dumped controls.json defaults. */
export const CATALOG_LAYOUT_OVERRIDES = [
    { source: "Captions_Settings>Effects>Padding>Slider", value: 350 },
    { source: "Captions_Settings>Effects>Scale>Slider", value: 200 },
];
const normalizeSourceKey = (s) => String(s || "")
    .replace(/\//g, ">")
    .replace(/\s+/g, "")
    .toLowerCase();
export const findControlBySource = (definition, source) => {
    const want = normalizeSourceKey(source);
    if (!want)
        return null;
    for (const c of definition.clientControls ?? []) {
        if (isGroup(c))
            continue;
        if (normalizeSourceKey(String(c.source || c.essentialName || "")) === want)
            return c;
    }
    return null;
};
/**
 * Catalog / downloaded apply (legacy dumps without `init`):
 * font from controls.json, plus Padding=350 / Scale=200.
 */
export const withCatalogApplyValues = (values, definition) => {
    const next = { ...values };
    const font = findFontControl(definition);
    if (font) {
        const fontId = fontIdFromValue(font.value);
        if (fontId)
            next[font.id] = fontId;
    }
    for (const item of CATALOG_LAYOUT_OVERRIDES) {
        const control = findControlBySource(definition, item.source);
        if (control)
            next[control.id] = item.value;
    }
    return next;
};
const KIND_TYPE = {
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
const isCepWrittenName = (name) => CEP_WRITTEN_SYSTEM_NAMES.includes(name);
const initValueToControlValue = (value, type) => {
    if (type === ControlType.Point) {
        if (isPointValue(value))
            return { ...value };
        if (Array.isArray(value) && value.length >= 2) {
            return { x: Number(value[0]) || 0, y: Number(value[1]) || 0 };
        }
        return { x: 0, y: 0 };
    }
    if (type === ControlType.Checkbox)
        return value === true || value === 1 || value === "1";
    if (type === ControlType.Color && Array.isArray(value))
        return value.map((n) => Number(n) || 0);
    if (type === ControlType.FontMenu) {
        const fontId = fontIdFromValue(value);
        return fontId || (typeof value === "string" ? value : "");
    }
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "string")
        return value;
    if (Array.isArray(value))
        return value;
    if (isPointValue(value))
        return { ...value };
    return 0;
};
const typeForInitName = (name, kind, value, matched) => {
    if (name === "Caption Font" || name === "Font")
        return ControlType.FontMenu;
    if (matched)
        return matched.type;
    const fromKind = KIND_TYPE[String(kind || "").toLowerCase()];
    if (fromKind)
        return fromKind;
    if (typeof value === "boolean")
        return ControlType.Checkbox;
    if (isColorArray(value))
        return ControlType.Color;
    if (isPointValue(value))
        return ControlType.Point;
    if (Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number")) {
        return ControlType.Point;
    }
    if (typeof value === "string")
        return ControlType.Text;
    return ControlType.Slider;
};
export const matchControlForInit = (definition, name, occ) => {
    const hits = [];
    for (const c of definition.clientControls ?? []) {
        if (isGroup(c))
            continue;
        if (uiName(c) === name)
            hits.push(c);
    }
    if (hits[occ])
        return hits[occ];
    const bySource = findControlBySource(definition, name);
    if (bySource)
        return bySource;
    return hits[0];
};
/**
 * Overlay controls.json `init` onto Styles values (match by Essential Graphics name).
 */
export const withInitApplyValues = (values, definition) => {
    const init = definition.init;
    if (!init?.length)
        return values;
    const next = { ...values };
    const nameCounts = {};
    for (let i = 0; i < init.length; i++) {
        const name = String(init[i].name || "").trim();
        if (!name || isCepWrittenName(name))
            continue;
        const occ = nameCounts[name] ?? 0;
        nameCounts[name] = occ + 1;
        const matched = matchControlForInit(definition, name, occ);
        if (!matched)
            continue;
        const type = typeForInitName(name, init[i].kind, init[i].value, matched);
        next[matched.id] = initValueToControlValue(init[i].value, type);
    }
    return next;
};
/** Catalog apply: `init` snapshot when present, else legacy font/Padding/Scale. */
export const catalogApplyValues = (values, definition) => {
    if (definition.init?.length)
        return withInitApplyValues(values, definition);
    return withCatalogApplyValues(values, definition);
};
/**
 * Loop `controls.json` `init`: match Essential Graphics by `name`, write `value`.
 * Skips CEP-owned system props (batches, Segment Type, Line Count, …).
 */
export const stylePropsFromInit = (definition) => {
    const init = definition.init;
    if (!init?.length)
        return [];
    const nameCounts = {};
    const out = [];
    for (let i = 0; i < init.length; i++) {
        const item = init[i];
        const name = String(item.name || "").trim();
        if (!name || isCepWrittenName(name))
            continue;
        const occ = nameCounts[name] ?? 0;
        nameCounts[name] = occ + 1;
        const matched = matchControlForInit(definition, name, occ);
        const type = typeForInitName(name, item.kind, item.value, matched);
        const value = initValueToControlValue(item.value, type);
        if (type === ControlType.FontMenu) {
            const fontId = fontIdFromValue(value);
            if (!fontId)
                continue;
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
const stylePropKey = (prop) => prop.source || prop.essentialName || prop.path.join("\0");
/** Только изменившиеся листья — полный список на каждый слайдер вешает Premiere. */
export const diffStyleProps = (previous, next) => {
    if (!previous || !previous.length)
        return next;
    const prevByKey = {};
    for (let i = 0; i < previous.length; i++) {
        prevByKey[stylePropKey(previous[i])] = JSON.stringify(previous[i].value);
    }
    const changed = [];
    for (let i = 0; i < next.length; i++) {
        const key = stylePropKey(next[i]);
        if (prevByKey[key] !== JSON.stringify(next[i].value))
            changed.push(next[i]);
    }
    return changed;
};
