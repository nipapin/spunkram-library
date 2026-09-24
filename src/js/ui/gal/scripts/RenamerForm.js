import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { MotionFlow } from "@/sdk";
export function RenamerForm({ onMessage, subscribed }) {
    const [scope, setScope] = useState("project");
    const [prefix, setPrefix] = useState("");
    const [name, setName] = useState("");
    const [suffix, setSuffix] = useState("");
    const [numerate, setNumerate] = useState(true);
    const [saveOriginal, setSaveOriginal] = useState(false);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [mode, setMode] = useState("rename");
    const [busy, setBusy] = useState(false);
    async function run() {
        if (!subscribed) {
            onMessage({ tone: "warning", text: "Subscription required" });
            return;
        }
        setBusy(true);
        const host = MotionFlow.host;
        const api = host === "PPRO" ? MotionFlow.PPRO : MotionFlow.AE;
        const res = mode === "replace"
            ? await api.project.replace({ from, to, scope })
            : await api.project.rename({
                prefix,
                name,
                suffix,
                scope,
                saveOriginal,
                numerate,
            });
        setBusy(false);
        if (!res.ok) {
            onMessage({ tone: "error", text: res.error });
            return;
        }
        const data = res.data;
        onMessage({
            tone: data?.type === "success" ? "success" : data?.type === "warning" ? "warning" : "error",
            text: String(data?.message ?? data?.type ?? "Done"),
        });
    }
    return (_jsxs("div", { className: "gal-script-form", children: [_jsxs("label", { className: "gal-script-form__row", children: [_jsx("span", { children: "Rename in" }), _jsxs("select", { value: scope, onChange: (e) => setScope(e.target.value), children: [_jsx("option", { value: "project", children: "Project Panel" }), _jsx("option", { value: "clips", children: "Selected Clips" })] })] }), _jsxs("div", { className: "gal-script-form__tabs", children: [_jsx("button", { type: "button", className: mode === "rename" ? "is-active" : undefined, onClick: () => setMode("rename"), children: "Rename" }), _jsx("button", { type: "button", className: mode === "replace" ? "is-active" : undefined, onClick: () => setMode("replace"), children: "Replace" })] }), mode === "rename" ? (_jsxs(_Fragment, { children: [_jsxs("label", { className: "gal-script-form__row", children: [_jsx("span", { children: "Prefix" }), _jsx("input", { value: prefix, onChange: (e) => setPrefix(e.target.value) })] }), _jsxs("label", { className: "gal-script-form__row", children: [_jsx("span", { children: "Name" }), _jsx("input", { value: name, onChange: (e) => setName(e.target.value) })] }), _jsxs("label", { className: "gal-script-form__row", children: [_jsx("span", { children: "Suffix" }), _jsx("input", { value: suffix, onChange: (e) => setSuffix(e.target.value) })] }), _jsxs("label", { className: "gal-script-form__check", children: [_jsx("input", { type: "checkbox", checked: numerate, onChange: (e) => setNumerate(e.target.checked) }), "Numberable"] }), _jsxs("label", { className: "gal-script-form__check", children: [_jsx("input", { type: "checkbox", checked: saveOriginal, onChange: (e) => setSaveOriginal(e.target.checked) }), "Keep original name"] })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: "gal-script-form__row", children: [_jsx("span", { children: "Find" }), _jsx("input", { value: from, onChange: (e) => setFrom(e.target.value) })] }), _jsxs("label", { className: "gal-script-form__row", children: [_jsx("span", { children: "Replace" }), _jsx("input", { value: to, onChange: (e) => setTo(e.target.value) })] })] })), _jsx("button", { type: "button", className: "gal-script-form__run", disabled: busy, onClick: () => void run(), children: busy ? "Working…" : mode === "replace" ? "Replace" : "Rename" })] }));
}
