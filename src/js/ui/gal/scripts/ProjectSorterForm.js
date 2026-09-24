import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { MotionFlow } from "@/sdk";
import { loadSorterSettings, saveSorterSettings, } from "./sorter-settings";
export function ProjectSorterForm({ onMessage, subscribed }) {
    const [settings, setSettings] = useState(() => loadSorterSettings());
    const [removeUsersFolders, setRemoveUsersFolders] = useState(false);
    const [sortUsersFolders, setSortUsersFolders] = useState(true);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        saveSorterSettings(settings);
    }, [settings]);
    async function run() {
        if (!subscribed) {
            onMessage({ tone: "warning", text: "Subscription required" });
            return;
        }
        setBusy(true);
        const host = MotionFlow.host;
        const api = host === "PPRO" ? MotionFlow.PPRO : MotionFlow.AE;
        const res = await api.project.sort(settings, removeUsersFolders, sortUsersFolders);
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
    return (_jsxs("div", { className: "gal-script-form", children: [_jsxs("label", { className: "gal-script-form__row", children: [_jsx("span", { children: "Sequences folder" }), _jsx("input", { value: settings.sequences, onChange: (e) => setSettings((s) => ({ ...s, sequences: e.target.value })) })] }), ["video", "audio", "images", "graphics"].map((key) => (_jsxs("label", { className: "gal-script-form__row", children: [_jsxs("span", { children: [key, " folder"] }), _jsx("input", { value: settings[key].folder, onChange: (e) => setSettings((s) => ({
                            ...s,
                            [key]: { ...s[key], folder: e.target.value },
                        })) })] }, key))), _jsxs("label", { className: "gal-script-form__check", children: [_jsx("input", { type: "checkbox", checked: sortUsersFolders, onChange: (e) => setSortUsersFolders(e.target.checked) }), "Sort user folders"] }), _jsxs("label", { className: "gal-script-form__check", children: [_jsx("input", { type: "checkbox", checked: removeUsersFolders, onChange: (e) => setRemoveUsersFolders(e.target.checked) }), "Remove empty user folders"] }), _jsx("button", { type: "button", className: "gal-script-form__run", disabled: busy, onClick: () => void run(), children: busy ? "Sorting…" : "Sort Project" })] }));
}
