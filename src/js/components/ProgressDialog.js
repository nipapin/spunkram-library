import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check } from "lucide-react";
import "./ProgressDialog.scss";
export const LOAD_CAPTIONS_PROGRESS_STEPS = [
    { stage: "loading", label: "Loading captions", hint: "Reading captions from the selected MOGRT" },
];
export const CAPTIONS_PROGRESS_STEPS = [
    { stage: "rendering", label: "Rendering", hint: "Exporting composition to file" },
    { stage: "converting", label: "Converting audio", hint: "Transcoding to mp3" },
    { stage: "transcribing", label: "Transcribing", hint: "Speech recognition" },
    { stage: "creating", label: "Creating captions", hint: "Inserting captions into the project" },
];
export const CHAPTERS_PROGRESS_STEPS = [
    { stage: "rendering", label: "Rendering", hint: "Exporting composition to file" },
    { stage: "converting", label: "Converting audio", hint: "Transcoding to mp3" },
    { stage: "transcribing", label: "Transcribing", hint: "Speech recognition" },
    { stage: "summarizing", label: "Generating chapters", hint: "Summarizing by timings" },
];
export const ProgressDialog = ({ progress, onCancel, title = "Generating…", steps = CAPTIONS_PROGRESS_STEPS, }) => {
    if (!progress)
        return null;
    const activeIndex = steps.findIndex((s) => s.stage === progress.stage);
    const step = steps[activeIndex] ?? steps[0];
    return (_jsx("div", { className: "modal-overlay", children: _jsxs("div", { className: "progress-dialog", children: [_jsxs("div", { className: "progress-dialog__head", children: [_jsx("p", { className: "progress-dialog__title", children: title }), _jsxs("p", { className: "progress-dialog__subtitle", children: ["Step ", activeIndex + 1, " of ", steps.length] })] }), _jsx("div", { className: "progress-dialog__steps", children: steps.map((s, i) => {
                        const done = i < activeIndex;
                        const active = i === activeIndex;
                        return (_jsxs("div", { className: `progress-dialog__step ${done ? "progress-dialog__step--done" : ""} ${active ? "progress-dialog__step--active" : ""}`, children: [_jsxs("div", { className: "progress-dialog__step-rail", children: [_jsx("div", { className: "progress-dialog__step-dot", children: done ? _jsx(Check, { size: 12 }) : i + 1 }), i < steps.length - 1 && _jsx("div", { className: "progress-dialog__step-line" })] }), _jsxs("div", { className: "progress-dialog__step-body", children: [_jsx("p", { className: "progress-dialog__step-label", children: s.label }), _jsx("p", { className: "progress-dialog__step-hint", children: s.hint })] })] }, s.stage));
                    }) }), _jsxs("div", { children: [_jsxs("p", { className: "progress-dialog__current", children: [step.label, "\u2026"] }), _jsx("div", { className: "progress-bar", children: _jsx("div", { className: "progress-bar__fill" }) })] }), onCancel && (_jsx("button", { type: "button", className: "btn btn--ghost progress-dialog__cancel", onClick: onCancel, children: "Cancel" }))] }) }));
};
