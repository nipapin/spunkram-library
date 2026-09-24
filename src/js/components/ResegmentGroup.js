import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { rangeFillStyle } from "../utils/rangeFillStyle";
import "./ResegmentGroup.scss";
const SEG_MODES = [
    { value: "words", label: "Words" },
    { value: "custom", label: "Custom" },
];
export const ResegmentGroup = ({ appliedConfig, resegmenting, onUpdate }) => {
    const [open, setOpen] = useState(true);
    const { mode, lines, characters, updateMode, updateLines, updateCharacters } = useConfiguration();
    const isApplied = !!appliedConfig &&
        appliedConfig.mode === mode &&
        (mode !== "custom" || (appliedConfig.lines === lines && appliedConfig.characters === characters));
    return (_jsxs("div", { className: "preset-fields__collapse preset-fields__collapse--depth-0", children: [_jsxs("button", { type: "button", className: "preset-fields__collapse-head", "aria-expanded": open, onClick: () => setOpen((v) => !v), children: [_jsx("span", { className: "preset-fields__collapse-title", children: "Re-segment" }), _jsx(ChevronDown, { size: 14, className: `preset-fields__collapse-chevron ${open ? "preset-fields__collapse-chevron--open" : ""}` })] }), open && (_jsxs("div", { className: "preset-fields__collapse-body resegment-group", children: [_jsx("div", { className: "btn-group resegment-group__modes", children: SEG_MODES.map((m) => (_jsx("button", { type: "button", className: `btn-group__item ${mode === m.value ? "btn-group__item--active-fill" : ""}`, onClick: () => updateMode(m.value), children: m.label }, m.value))) }), mode === "custom" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "resegment-group__row", children: [_jsx("span", { className: "resegment-group__label", children: "Lines / caption" }), _jsx("input", { type: "range", className: "range", min: 1, max: 4, value: lines, onChange: (e) => updateLines(Number(e.target.value)), style: rangeFillStyle(lines, 1, 4) }), _jsx("span", { className: "resegment-group__value", children: lines })] }), _jsxs("div", { className: "resegment-group__row", children: [_jsx("span", { className: "resegment-group__label", children: "Characters / line" }), _jsx("input", { type: "range", className: "range", min: 4, max: 40, value: characters, onChange: (e) => updateCharacters(Number(e.target.value)), style: rangeFillStyle(characters, 4, 40) }), _jsx("span", { className: "resegment-group__value", children: characters })] })] })), !isApplied && (_jsx("button", { type: "button", className: "btn btn--primary btn--full resegment-group__update", onClick: onUpdate, disabled: resegmenting, children: resegmenting ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "spinner" }), "Updating\u2026"] })) : ("Update") }))] }))] }));
};
