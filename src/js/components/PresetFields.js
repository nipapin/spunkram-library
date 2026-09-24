import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDown, CopyPlus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { ControlType, buildUiTree, fontIdFromValue, getControlValue, isColorArray, isFontControl, isPointValue, uiName, } from "../presets";
import { CEP_WRITTEN_SYSTEM_NAMES } from "../../shared/caption-system";
import { rangeFillStyle } from "../utils/rangeFillStyle";
import { FontPicker } from "./FontPicker";
import { ScrubNumber } from "./ScrubNumber";
import { ColorField } from "./ColorField";
import { StyledSelect } from "./StyledSelect";
import "./PresetFields.scss";
const localizedText = (value) => {
    if (typeof value === "string")
        return value;
    if (value && typeof value === "object" && "strDB" in value) {
        const db = value.strDB;
        return db?.[0]?.str ?? "";
    }
    return "";
};
const withLocalizedText = (previous, text) => {
    if (previous && typeof previous === "object" && "strDB" in previous) {
        const db = previous.strDB;
        return { strDB: db.map((e, i) => (i === 0 ? { ...e, str: text } : e)) };
    }
    return { strDB: [{ localeString: "en_US", str: text }] };
};
const menuOptionLabel = (entry, locale = "en_US") => entry.strDB?.find((e) => e.localeString === locale)?.str ?? entry.strDB?.[0]?.str ?? "";
const Collapse = ({ title, depth, defaultOpen = false, children, }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (_jsxs("div", { className: `preset-fields__collapse preset-fields__collapse--depth-${Math.min(depth, 3)}`, children: [_jsxs("button", { type: "button", className: "preset-fields__collapse-head", "aria-expanded": open, onClick: () => setOpen((v) => !v), children: [_jsx("span", { className: "preset-fields__collapse-title", children: title }), _jsx(ChevronDown, { size: 14, className: `preset-fields__collapse-chevron ${open ? "preset-fields__collapse-chevron--open" : ""}` })] }), open && (_jsx("div", { className: "preset-fields__collapse-body", children: typeof children === "function" ? children() : children }))] }));
};
const ControlField = ({ control, values, onValue, }) => {
    const raw = getControlValue(values, control);
    const label = uiName(control);
    if (control.type === ControlType.Checkbox) {
        const checked = raw === true || raw === 1;
        return (_jsxs("div", { className: "preset-fields__param preset-fields__param--toggle", children: [_jsx("span", { className: "preset-fields__param-label", children: label }), _jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: !!checked, onChange: (e) => onValue(control.id, e.target.checked) }), _jsx("span", { className: "toggle__track" }), _jsx("span", { className: "toggle__thumb" })] })] }));
    }
    if (control.type === ControlType.Color && isColorArray(raw)) {
        return (_jsxs("div", { className: "preset-fields__param", children: [_jsx("span", { className: "preset-fields__param-label", children: label }), _jsx("div", { className: "preset-fields__param-controls", children: _jsx(ColorField, { rgba: raw, onChange: (next) => onValue(control.id, next) }) })] }));
    }
    if (control.type === ControlType.Point) {
        const point = isPointValue(raw)
            ? raw
            : Array.isArray(raw) && raw.length >= 2
                ? { x: Number(raw[0]) || 0, y: Number(raw[1]) || 0 }
                : null;
        if (!point)
            return null;
        return (_jsxs("div", { className: "preset-fields__param preset-fields__param--point", children: [_jsx("span", { className: "preset-fields__param-label", children: label }), _jsx("div", { className: "preset-fields__point", children: ["x", "y"].map((axis) => (_jsxs("label", { className: "preset-fields__point-axis", children: [_jsx("span", { children: axis.toUpperCase() }), _jsx(ScrubNumber, { value: point[axis], onChange: (n) => onValue(control.id, { ...point, [axis]: n }) })] }, axis))) })] }));
    }
    if (control.type === ControlType.Menu) {
        const options = control.menucontent?.length
            ? control.menucontent
            : Array.from({ length: Math.max(3, typeof raw === "number" ? Number(raw) : 1) }, (_, i) => ({
                strDB: [{ localeString: "en_US", str: String(i + 1) }],
            }));
        // AE / MOGRT dropdown: 1-based index into menucontent
        const selected = typeof raw === "number" ? raw : Number(raw) || 1;
        return (_jsxs("div", { className: "preset-fields__param", children: [_jsx("span", { className: "preset-fields__param-label", children: label }), _jsx(StyledSelect, { className: "preset-fields__menu", ariaLabel: label, value: String(selected), options: options.map((opt, i) => ({
                        value: String(i + 1),
                        label: menuOptionLabel(opt),
                    })), onChange: (v) => onValue(control.id, Number(v)) })] }));
    }
    if (isFontControl(control)) {
        const id = fontIdFromValue(raw) || localizedText(raw);
        return (_jsxs("div", { className: "preset-fields__param preset-fields__param--font", children: [_jsx("span", { className: "preset-fields__param-label", children: label }), _jsx(FontPicker, { value: id, onChange: (next) => onValue(control.id, next) })] }));
    }
    if (control.type === ControlType.Slider || control.type === ControlType.Angle) {
        const num = typeof raw === "number" ? raw : Number(raw) || 0;
        const hasRange = typeof control.min === "number" && typeof control.max === "number";
        const min = hasRange
            ? Math.min(control.min, num)
            : control.type === ControlType.Angle
                ? -360
                : 0;
        const max = hasRange
            ? Math.max(control.max, num)
            : control.type === ControlType.Angle
                ? 360
                : 100;
        const span = Math.max(0.0001, max - min);
        const step = span <= 1 ? 0.01 : span <= 10 ? 0.1 : span <= 100 ? 0.5 : 1;
        return (_jsxs("div", { className: "field-row preset-fields__slider-row", children: [_jsx("span", { className: "field-row__label preset-fields__param-label", children: label }), _jsx("input", { type: "range", className: "range", min: min, max: max, step: step, value: Math.min(max, Math.max(min, num)), onChange: (e) => onValue(control.id, Number(e.target.value)), style: rangeFillStyle(Math.min(max, Math.max(min, num)), min, max) }), _jsx(ScrubNumber, { value: num, onChange: (n) => onValue(control.id, n), min: min, max: max, step: step })] }));
    }
    if (control.type === ControlType.Text) {
        if (CEP_WRITTEN_SYSTEM_NAMES.includes(label))
            return null;
        const text = localizedText(raw);
        return (_jsxs("div", { className: "preset-fields__param", children: [_jsx("span", { className: "preset-fields__param-label", children: label }), _jsx("input", { className: "preset-fields__select", value: text, onChange: (e) => onValue(control.id, withLocalizedText(raw, e.target.value)) })] }));
    }
    return null;
};
const renderNodes = (nodes, depth, values, onValue) => nodes.map((node) => {
    if (node.kind === "group") {
        const name = uiName(node.control);
        return (_jsx(Collapse, { title: name, depth: depth, children: () => renderNodes(node.children, depth + 1, values, onValue) }, node.control.id));
    }
    return _jsx(ControlField, { control: node.control, values: values, onValue: onValue }, node.control.id);
});
export const PresetFields = ({ value: p, definition, onChange, dirty, nameEditable, onSaveAsNew, onReset, leading, }) => {
    const tree = useMemo(() => (definition ? buildUiTree(definition) : []), [definition]);
    const setValue = (id, next) => {
        // один жест слайдера/scrub = один Ctrl+Z
        onChange({ values: { ...p.values, [id]: next } }, { coalesceKey: id });
    };
    return (_jsxs("div", { className: "preset-fields", children: [_jsxs("div", { className: "preset-fields__name-row", children: [_jsx("input", { className: "preset-fields__name", value: p.name, disabled: !nameEditable, onChange: (e) => onChange({ name: e.target.value }, { coalesceKey: "name" }), "aria-label": "Preset name", title: nameEditable ? undefined : "Change preset settings to rename" }), dirty && (_jsxs("div", { className: "preset-fields__name-actions", children: [onReset && (_jsxs("button", { type: "button", className: "btn preset-fields__reset", onClick: onReset, "data-tooltip": "Reset to default", "aria-label": "Reset to default", children: [_jsx(RotateCcw, { size: 13 }), "Reset"] })), onSaveAsNew && (_jsxs("button", { type: "button", className: "btn preset-fields__save-as", onClick: onSaveAsNew, children: [_jsx(CopyPlus, { size: 13 }), "Save as New"] }))] }))] }), _jsxs("div", { className: "preset-fields__params", children: [leading, renderNodes(tree, 0, p.values, setValue)] })] }));
};
