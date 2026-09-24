import { ControlType } from "./types";
/** Caption mogrt dump — the only Styles source. */
export const CONTROLS_FILE = "controls.json";
const loc = (str) => ({ strDB: [{ localeString: "en_US", str }] });
/** AE menu dumps often omit labels — keep 1-based values working in Styles. */
const MENU_FALLBACKS = {
    position: ["Top", "Center", "Bottom"],
    "segment type": ["Words", "Custom"],
    case: ["Lowercase", "Uppercase", "Capitalize"],
};
const KIND_TO_TYPE = {
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
/** Trailing AE property-type tokens in `source` paths. */
const SOURCE_KIND_TAILS = new Set([
    "menu",
    "slider",
    "checkbox",
    "color",
    "point",
    "angle",
    "text",
    "source text",
]);
/**
 * Prefer the raw controls.json `source` as the host match key — flat mogrts
 * expose displayName exactly as `Layer>Effects>Name>Kind`.
 * Also keep a stripped `/`-path for nested Essential Properties (AE).
 */
export const sourceToEssentialName = (source) => {
    if (!source || typeof source !== "string")
        return undefined;
    const trimmed = source.trim();
    return trimmed || undefined;
};
/** Nested AE EP path without the trailing kind leaf (Menu/Slider/…). */
export const sourceToNestedPath = (source) => {
    if (!source || typeof source !== "string")
        return undefined;
    const parts = source
        .replace(/>/g, "/")
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
    if (!parts.length)
        return undefined;
    const last = parts[parts.length - 1].toLowerCase();
    if (SOURCE_KIND_TAILS.has(last) && parts.length > 1)
        parts.pop();
    return parts.join("/") || undefined;
};
export const isControlsDocument = (raw) => {
    if (!raw || typeof raw !== "object")
        return false;
    const o = raw;
    // Already-converted in-memory tree (persisted as controls.json).
    if (Array.isArray(o.clientControls))
        return false;
    return Array.isArray(o.groups) || Array.isArray(o.controls) || Array.isArray(o.ui);
};
const isGroupNode = (node) => node.type === "group" || Array.isArray(node.controls);
const optionLabel = (opt) => {
    if (typeof opt === "string")
        return opt;
    if (opt && typeof opt === "object") {
        const rec = opt;
        if (typeof rec.str === "string")
            return rec.str;
        if (typeof rec.name === "string")
            return rec.name;
        if (typeof rec.label === "string")
            return rec.label;
    }
    return String(opt ?? "");
};
const menucontentFor = (name, options) => {
    const fromFile = (options ?? []).map(optionLabel).filter(Boolean);
    const labels = fromFile.length ? fromFile : MENU_FALLBACKS[name.trim().toLowerCase()] ?? [];
    if (!labels.length)
        return undefined;
    return labels.map(loc);
};
const asPoint = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value) && "x" in value && "y" in value) {
        const p = value;
        return { x: Number(p.x) || 0, y: Number(p.y) || 0 };
    }
    if (Array.isArray(value) && value.length >= 2) {
        return { x: Number(value[0]) || 0, y: Number(value[1]) || 0 };
    }
    return { x: 0, y: 0 };
};
const leafValue = (kind, value) => {
    if (kind === "point")
        return asPoint(value);
    if (kind === "checkbox")
        return value === true || value === 1 || value === "1";
    if (kind === "color" && Array.isArray(value))
        return value.map((n) => Number(n) || 0);
    if (kind === "font-menu" || kind === "fontmenu" || kind === "font") {
        if (typeof value === "string")
            return value;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            const rec = value;
            if (typeof rec.systemName === "string")
                return rec.systemName;
            if (typeof rec.str === "string")
                return rec.str;
        }
        return "";
    }
    if (typeof value === "number")
        return value;
    if (typeof value === "boolean")
        return value;
    if (typeof value === "string")
        return value;
    if (Array.isArray(value))
        return value;
    return 0;
};
const leafType = (kind) => KIND_TO_TYPE[kind] ?? ControlType.Slider;
const namedValueAsControlValue = (value) => {
    if (typeof value === "string")
        return value;
    if (typeof value === "number")
        return value;
    if (typeof value === "boolean")
        return value;
    if (Array.isArray(value)) {
        if (value.length >= 2 && value.every((n) => typeof n === "number")) {
            return value.length === 2 ? { x: value[0], y: value[1] } : value;
        }
        return value;
    }
    return String(value ?? "");
};
const inferKindFromName = (name, value) => {
    if (typeof value === "string")
        return "text";
    if (Array.isArray(value) && value.length >= 3)
        return "color";
    if (Array.isArray(value) && value.length === 2)
        return "point";
    if (typeof value === "number")
        return "slider";
    return "text";
};
export const controlsToDefinition = (doc) => {
    const clientControls = [];
    const usedIds = new Set();
    const uniqueId = (preferred) => {
        const base = preferred.trim() || "control";
        if (!usedIds.has(base)) {
            usedIds.add(base);
            return base;
        }
        let i = 2;
        while (usedIds.has(`${base} (${i})`))
            i++;
        const next = `${base} (${i})`;
        usedIds.add(next);
        return next;
    };
    const convert = (node, parentPath, parentHidden) => {
        if (isGroupNode(node)) {
            const name = node.name || "Group";
            const path = parentPath ? `${parentPath} / ${name}` : name;
            const groupHidden = parentHidden === true || node.hidden === true;
            const childIds = [];
            for (const child of node.controls ?? []) {
                childIds.push(convert(child, path, groupHidden));
            }
            const control = {
                id: uniqueId(`group:${path}`),
                type: ControlType.Group,
                uiName: loc(name),
                value: childIds,
                groupexpanded: false,
                hidden: groupHidden,
                sourceLayer: node.sourceLayer,
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
        const rawSource = leaf.source || leaf.essentialName;
        const control = {
            id: uniqueId(path),
            type: leafType(kind),
            uiName: loc(name),
            value,
            min,
            max,
            menucontent: kind === "menu" ? menucontentFor(name, leaf.options) : undefined,
            // Flat mogrt displayName === source (with `>` and kind leaf).
            essentialName: leaf.essentialName || sourceToEssentialName(rawSource),
            source: rawSource,
            uiPath: path,
            hidden: parentHidden === true,
        };
        clientControls.push(control);
        return control.id;
    };
    const roots = doc.ui && doc.ui.length
        ? doc.ui
        : doc.groups && doc.groups.length
            ? doc.groups
            : [{ name: "Style", type: "group", controls: doc.controls ?? [] }];
    for (const group of roots)
        convert(group, "");
    // animation / revealConfig — not shown in Styles UI; applied with the preset.
    const appendNamed = (items, bucket) => {
        if (!items?.length)
            return;
        const childIds = [];
        for (const item of items) {
            if (!item || typeof item.name !== "string" || !item.name.trim())
                continue;
            const name = item.name.trim();
            const kind = inferKindFromName(name, item.value);
            const path = `${bucket} / ${name}`;
            const control = {
                id: uniqueId(path),
                type: leafType(kind),
                uiName: loc(name),
                value: namedValueAsControlValue(item.value),
                essentialName: name,
                uiPath: path,
                hidden: true,
            };
            clientControls.push(control);
            childIds.push(control.id);
        }
        if (!childIds.length)
            return;
        clientControls.push({
            id: uniqueId(`group:${bucket}`),
            type: ControlType.Group,
            uiName: loc(bucket),
            value: childIds,
            groupexpanded: false,
            hidden: true,
        });
    };
    appendNamed(doc.animation, "Animation");
    appendNamed(doc.revealConfig, "Reveal");
    const init = parseInit(doc.init);
    return {
        schema: "controls",
        capsuleName: doc.templateName || doc.composition,
        enabledLayers: doc.enabledLayers,
        clientControls,
        controlsDocument: doc,
        ...(init.length ? { init } : {}),
    };
};
const parseInit = (raw) => {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (!item || typeof item !== "object")
            continue;
        const rec = item;
        if (typeof rec.name !== "string")
            continue;
        const name = rec.name.trim();
        if (!name)
            continue;
        const entry = { name, value: rec.value };
        if (typeof rec.kind === "string" && rec.kind.trim())
            entry.kind = rec.kind.trim();
        if (typeof rec.source === "string" && rec.source.trim())
            entry.source = rec.source.trim();
        out.push(entry);
    }
    return out;
};
/** Parse `controls.json` into the in-memory Styles tree. */
export const normalizeDefinition = (raw) => {
    if (!raw || typeof raw !== "object")
        return { clientControls: [] };
    if (isControlsDocument(raw))
        return controlsToDefinition(raw);
    const def = raw;
    if (Array.isArray(def.clientControls)) {
        const init = Array.isArray(def.init) ? parseInit(def.init) : [];
        const next = def.schema === "controls" ? def : { ...def, schema: "controls" };
        const withInit = init.length ? { ...next, init } : next;
        if (isControlsDocument(raw) && !withInit.controlsDocument) {
            return { ...withInit, controlsDocument: raw };
        }
        return withInit;
    }
    return { clientControls: [] };
};
