import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../utils/clipboard";
import "./TitleSuggestions.scss";
export const TitleSuggestions = ({ titles, onEditTitle, onRegenerate, regenerating, canRegenerate = true, }) => {
    const [copiedIndex, setCopiedIndex] = useState(null);
    const handleCopy = async (index, title) => {
        if (!title.trim())
            return;
        const ok = await copyToClipboard(title);
        if (!ok)
            return;
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
    };
    const regenerateDisabled = regenerating || !canRegenerate;
    return (_jsxs("div", { className: "title-suggestions", children: [_jsxs("div", { className: "title-suggestions__head", children: [_jsx("span", { className: "chapters-tab__section-label", children: "VIDEO TITLES" }), _jsxs("button", { type: "button", className: "btn btn--ghost title-suggestions__regenerate", onClick: onRegenerate, disabled: regenerateDisabled, title: !canRegenerate
                            ? "No generations left"
                            : regenerating
                                ? "Regenerating…"
                                : "Uses 1 generation", children: [regenerating ? _jsx("span", { className: "spinner" }) : _jsx(RefreshCw, { size: 12 }), "Regenerate"] })] }), _jsx("div", { className: "title-suggestions__options", children: titles.map((title, i) => (_jsxs("div", { className: "title-suggestions__row", children: [_jsx("input", { className: "title-suggestions__input", value: title, onChange: (e) => onEditTitle(i, e.target.value), placeholder: `Title option ${i + 1}`, "aria-label": `Video title option ${i + 1}` }), _jsx("button", { type: "button", className: "icon-btn title-suggestions__copy", onClick: () => handleCopy(i, title), disabled: !title.trim(), "data-tooltip": copiedIndex === i ? "Copied!" : "Copy title", "aria-label": `Copy title option ${i + 1}`, children: copiedIndex === i ? _jsx(Check, { size: 14 }) : _jsx(Copy, { size: 14 }) })] }, i))) })] }));
};
