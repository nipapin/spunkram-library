import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../utils/clipboard";
import "./GeneratedTextSection.scss";
/** Переиспользуемая секция "заголовок + Regenerate + textarea + Copy" для Description и Tags. */
export const GeneratedTextSection = ({ label, value, placeholder, rows = 3, onChange, onBlur, onRegenerate, regenerating, canRegenerate = true, }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        if (!value.trim())
            return;
        const ok = await copyToClipboard(value);
        if (!ok)
            return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    const regenerateDisabled = regenerating || !canRegenerate;
    return (_jsxs("div", { className: "generated-text-section", children: [_jsxs("div", { className: "generated-text-section__head", children: [_jsx("span", { className: "chapters-tab__section-label", children: label }), _jsxs("button", { type: "button", className: "btn btn--ghost generated-text-section__regenerate", onClick: onRegenerate, disabled: regenerateDisabled, title: !canRegenerate
                            ? "No generations left"
                            : regenerating
                                ? "Regenerating…"
                                : "Uses 1 generation", children: [regenerating ? _jsx("span", { className: "spinner" }) : _jsx(RefreshCw, { size: 12 }), "Regenerate"] })] }), _jsx("textarea", { className: "generated-text-section__input", value: value, onChange: (e) => onChange(e.target.value), onBlur: onBlur, placeholder: placeholder, rows: rows, "aria-label": label }), _jsx("div", { className: "generated-text-section__footer", children: _jsxs("button", { type: "button", className: "btn btn--ghost generated-text-section__copy", onClick: handleCopy, disabled: !value.trim(), children: [copied ? _jsx(Check, { size: 12 }) : _jsx(Copy, { size: 12 }), copied ? "Copied!" : "Copy"] }) })] }));
};
