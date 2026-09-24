import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { hexToRgba, rgbaToHex } from "../presets";
import "./ColorField.scss";
const normalizeHex = (raw) => {
    let s = raw.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(s)) {
        s = s
            .split("")
            .map((c) => c + c)
            .join("");
    }
    if (/^[0-9a-f]{6}$/i.test(s))
        return `#${s.toLowerCase()}`;
    return null;
};
/** Native color picker + редактируемый hex. */
export const ColorField = ({ rgba, onChange }) => {
    const hex = rgbaToHex(rgba);
    const alpha = rgba[3] ?? 1;
    const [draft, setDraft] = useState(hex);
    useEffect(() => {
        setDraft(hex);
    }, [hex]);
    const commitHex = (raw) => {
        const next = normalizeHex(raw);
        if (!next) {
            setDraft(hex);
            return;
        }
        setDraft(next);
        onChange(hexToRgba(next, alpha));
    };
    return (_jsxs("div", { className: "color-field color-field--compact", children: [_jsx("input", { type: "color", value: hex, "aria-label": "Color picker", onChange: (e) => {
                    const next = e.target.value.toLowerCase();
                    setDraft(next);
                    onChange(hexToRgba(next, alpha));
                } }), _jsx("input", { className: "color-field__hex", value: draft, spellCheck: false, "aria-label": "Hex color", onChange: (e) => {
                    const v = e.target.value;
                    setDraft(v);
                    const next = normalizeHex(v);
                    if (next)
                        onChange(hexToRgba(next, alpha));
                }, onBlur: () => commitHex(draft), onKeyDown: (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        commitHex(draft);
                        e.target.blur();
                    }
                } })] }));
};
