import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { PresetGrid } from "./PresetGrid";
import "./ChangePresetDialog.scss";
export const ChangePresetDialog = ({ open, currentId, currentName, onClose, }) => {
    const { selectPreset } = useConfiguration();
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e) => {
            if (e.key === "Escape")
                onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);
    if (!open)
        return null;
    return createPortal(_jsx("div", { className: "change-preset-overlay", role: "dialog", "aria-modal": "true", "aria-labelledby": "change-preset-title", onMouseDown: onClose, children: _jsxs("div", { className: "change-preset-dialog", onMouseDown: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "change-preset-dialog__head", children: [_jsxs("div", { children: [_jsx("p", { id: "change-preset-title", className: "change-preset-dialog__title", children: "Change Preset" }), _jsxs("p", { className: "change-preset-dialog__hint", children: ["Edits to ", currentName || "the current preset", " stay on that style. The selected caption clip switches to the new template."] })] }), _jsx("button", { type: "button", className: "icon-btn", onClick: onClose, "aria-label": "Close", children: _jsx(X, { size: 15 }) })] }), _jsx(PresetGrid, { variant: "picker", excludeId: currentId, onSelect: (id) => {
                        selectPreset(id);
                        onClose();
                    } })] }) }), document.body);
};
