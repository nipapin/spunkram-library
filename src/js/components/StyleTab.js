import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useConfiguration, isPresetDirty, isPresetValuesDirty } from "../../context/ConfigurationWrapper";
import { useStyleUndo } from "../hooks/useStyleUndo";
import { PresetFields } from "./PresetFields";
import { ChangePresetDialog } from "./ChangePresetDialog";
import { ResegmentGroup } from "./ResegmentGroup";
import { friendlyErrorMessage } from "../utils/user-error";
import "./StyleTab.scss";
const EMPTY_PRESET = {
    id: "",
    name: "",
    favorite: false,
    styleId: "",
    styleVersion: "",
    source: "user",
    values: {},
    origin: { name: "", values: {} },
};
export const StyleTab = ({ onUpdateResegment, appliedResegmentConfig, resegmenting, }) => {
    const { presets, selectedPresetId, updateSelectedPreset, addPreset, definitions, stylesStatus, ensureDefinitionLoaded, acquireStatus, } = useConfiguration();
    const selected = presets.find((p) => p.id === selectedPresetId) ?? presets[0];
    const definition = selected ? definitions[selected.source === "user" ? selected.id : selected.styleId] : undefined;
    const hasControls = !!(definition?.clientControls?.length);
    const [loadingDefinition, setLoadingDefinition] = useState(false);
    const [definitionError, setDefinitionError] = useState(null);
    useEffect(() => {
        if (!selected?.id || hasControls)
            return;
        let cancelled = false;
        setLoadingDefinition(true);
        setDefinitionError(null);
        ensureDefinitionLoaded(selected.id)
            .then((def) => {
            if (cancelled)
                return;
            if (!def?.clientControls?.length) {
                setDefinitionError("No style controls in controls.json for this caption.");
            }
        })
            .catch((e) => {
            if (cancelled)
                return;
            setDefinitionError(friendlyErrorMessage(e));
        })
            .finally(() => {
            if (!cancelled)
                setLoadingDefinition(false);
        });
        return () => {
            cancelled = true;
        };
    }, [selected?.id, hasControls, ensureDefinitionLoaded]);
    const { onChange } = useStyleUndo(selected ?? EMPTY_PRESET, updateSelectedPreset);
    const dirty = selected ? isPresetDirty(selected) : false;
    const valuesDirty = selected ? isPresetValuesDirty(selected) : false;
    const [pickerOpen, setPickerOpen] = useState(false);
    const otherPresets = presets.filter((p) => p.id !== selected?.id).length;
    const busy = acquireStatus === "downloading" || acquireStatus === "applying";
    const busyOverlay = busy ? (_jsxs("div", { className: "style-tab__busy", "aria-live": "polite", children: [_jsx("span", { className: "spinner" }), acquireStatus === "downloading" ? "Downloading style…" : "Applying style…"] })) : null;
    const changePreset = (_jsxs("button", { type: "button", className: "btn btn--ghost style-tab__change-preset", disabled: otherPresets === 0 || acquireStatus === "downloading" || acquireStatus === "applying", onClick: () => setPickerOpen(true), children: [_jsx(LayoutGrid, { size: 13 }), "Change Preset"] }));
    const picker = selected ? (_jsx(ChangePresetDialog, { open: pickerOpen, currentId: selected.id, currentName: selected.name, onClose: () => setPickerOpen(false) })) : null;
    const resegment = (_jsx(ResegmentGroup, { appliedConfig: appliedResegmentConfig, resegmenting: resegmenting, onUpdate: onUpdateResegment }));
    const frame = (children) => (_jsxs("div", { className: `style-tab thin-scroll${busy ? " style-tab--busy" : ""}`, tabIndex: -1, children: [busyOverlay, children] }));
    if (stylesStatus === "loading" || stylesStatus === "idle") {
        return frame(_jsxs(_Fragment, { children: [resegment, _jsxs("div", { className: "style-tab__fill", children: [_jsx("span", { className: "spinner" }), "Loading styles\u2026"] })] }));
    }
    if (!selected) {
        return frame(_jsxs(_Fragment, { children: [resegment, _jsxs("div", { className: "style-tab__fill", children: [_jsx("p", { children: "No style selected." }), _jsx("p", { className: "style-tab__hint", children: "Choose a caption style on the main screen." })] })] }));
    }
    if (hasControls && definition) {
        return frame(_jsxs(_Fragment, { children: [_jsxs("div", { className: "style-tab__editing-head", children: [_jsxs("span", { className: "style-tab__section-label", children: ["EDITING \u00B7 ", selected.name] }), _jsxs("span", { className: "style-tab__editing-actions", children: [selected.updateAvailable && _jsx("span", { className: "style-tab__update-pill", children: "Update available" }), changePreset] })] }), picker, acquireStatus === "error" && (_jsx("p", { className: "style-tab__hint", children: "Couldn\u2019t apply this style to the selected caption." })), _jsx(PresetFields, { value: selected, definition: definition, onChange: onChange, dirty: dirty, nameEditable: valuesDirty, leading: resegment, onReset: () => onChange({
                        name: selected.origin.name,
                        values: JSON.parse(JSON.stringify(selected.origin.values)),
                    }), onSaveAsNew: () => addPreset({
                        name: `${selected.name} Copy`,
                        values: selected.values,
                        favorite: false,
                        styleId: selected.styleId,
                        styleVersion: selected.styleVersion,
                        preview: selected.preview,
                        tags: selected.tags,
                        categoryName: selected.categoryName,
                    }) })] }));
    }
    if (loadingDefinition) {
        return frame(_jsxs(_Fragment, { children: [resegment, _jsxs("div", { className: "style-tab__fill", children: [_jsx("span", { className: "spinner" }), "Loading style controls\u2026"] })] }));
    }
    return frame(_jsxs(_Fragment, { children: [resegment, _jsxs("div", { className: "style-tab__fill", children: [_jsx("p", { children: selected.name }), _jsx("p", { className: "style-tab__hint", children: definitionError ||
                            "Style controls aren’t available for this caption (missing controls.json)." }), changePreset, picker, acquireStatus === "error" && (_jsx("p", { className: "style-tab__hint", children: "Couldn\u2019t apply this style to the selected caption." }))] })] }));
};
