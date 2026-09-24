import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowLeft, AudioWaveform, Download } from "lucide-react";
import { useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import "./CaptionsTab.scss";
import { EditableCaption } from "./EditableCaption";
import { LanguageRow } from "./LanguageRow";
import { PresetGrid } from "./PresetGrid";
import { StyleTab } from "./StyleTab";
export const CaptionsTab = ({ captions, meta, progress, loadingCaptions = false, sentenceCount, fontSize, highlightIndex, screen, onLoad, onDescribe, transcribeLabel = "Transcribe", onBack, onSaveCaption, onSeek, onSplit, onMerge, onMoveWord, onSplitWords, onUpdateResegment, appliedResegmentConfig, resegmenting, }) => {
    const [subTab, setSubTab] = useState("transcribe");
    const { srcLang, translateTo, updateSrcLang, updateTranslateTo } = useConfiguration();
    // лендинг — явный screen из App (не деривируем из captions.length), чтобы
    // Back мог вернуть сюда без сброса данных
    if (screen === "landing") {
        return (_jsxs("div", { className: "captions-tab captions-tab--landing", children: [_jsx("div", { className: "captions-tab__landing-body thin-scroll", children: _jsx(PresetGrid, {}) }), _jsxs("div", { className: "captions-tab__landing-footer", children: [_jsx(LanguageRow, { srcLang: srcLang, translateTo: translateTo, onSrcLang: updateSrcLang, onTranslateTo: updateTranslateTo, showArrow: true }), _jsxs("div", { className: "captions-tab__landing-actions", children: [_jsxs("button", { type: "button", className: "btn btn--primary captions-tab__transcribe-btn", onClick: onDescribe, disabled: !!progress, children: [progress ? _jsx("span", { className: "spinner" }) : _jsx(AudioWaveform, { size: 15 }), progress ? "Working…" : transcribeLabel] }), _jsxs("button", { type: "button", className: "btn btn--ghost captions-tab__load-btn", onClick: onLoad, disabled: !!progress || loadingCaptions, "aria-label": "Load", children: [loadingCaptions ? _jsx("span", { className: "spinner" }) : _jsx(Download, { size: 15 }), loadingCaptions ? "Loading…" : "Load"] })] })] })] }));
    }
    return (_jsxs("div", { className: "captions-tab", children: [_jsxs("div", { className: "tabs", children: [_jsx("button", { type: "button", className: "icon-btn captions-tab__back", onClick: onBack, "aria-label": "Back to main screen", children: _jsx(ArrowLeft, { size: 15 }) }), _jsx("button", { className: `tab ${subTab === "transcribe" ? "tab--active" : ""}`, "aria-selected": subTab === "transcribe", onClick: () => setSubTab("transcribe"), children: "Transcribe" }), _jsx("button", { className: `tab ${subTab === "style" ? "tab--active" : ""}`, "aria-selected": subTab === "style", onClick: () => setSubTab("style"), children: "Styles" })] }), _jsx("div", { className: "captions-tab__panel", children: subTab === "style" ? (_jsx(StyleTab, { onUpdateResegment: onUpdateResegment, appliedResegmentConfig: appliedResegmentConfig, resegmenting: resegmenting })) : (_jsxs("div", { className: "captions-tab__list", children: [_jsx("div", { className: "captions-tab__transcript-head", children: _jsxs("span", { className: "captions-tab__section-label", children: ["TRANSCRIPT \u00B7 ", captions.length, " SEGMENT", captions.length === 1 ? "" : "S"] }) }), captions.map((caption, index) => (_jsx(EditableCaption, { index: index, caption: caption, fontSize: fontSize, offset: meta.offset, sentenceCount: sentenceCount, captionCount: captions.length, highlighted: index === highlightIndex, onSave: (c, text) => onSaveCaption(c, index, text), onSeek: (c) => onSeek(c, index), onSplit: onSplit, onMerge: onMerge, onMoveWord: onMoveWord, onSplitWords: onSplitWords }, index)))] })) })] }));
};
