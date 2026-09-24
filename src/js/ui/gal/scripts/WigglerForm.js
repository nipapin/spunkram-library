import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { MotionFlow } from "@/sdk";
export function WigglerForm({ onMessage, subscribed }) {
    const [tier, setTier] = useState("basic");
    const [amount, setAmount] = useState(10);
    const [speed, setSpeed] = useState(1);
    const [busy, setBusy] = useState(false);
    async function call(method, args) {
        if (!subscribed) {
            onMessage({ tone: "warning", text: "Subscription required" });
            return;
        }
        if (MotionFlow.host !== "AE") {
            onMessage({ tone: "error", text: "Wiggler is After Effects only" });
            return;
        }
        setBusy(true);
        const params = {
            amount,
            speed,
            axis: "all",
            octaves: 1,
            octMult: 0.5,
            loopEnabled: false,
            loopDuration: 10,
            baseSeed: 0,
            synchronizedWiggle: false,
            fadeEnabled: false,
            fadeIn: 1,
            fadeOut: 1,
        };
        const res = method === "apply"
            ? await MotionFlow.AE.wiggler.apply(tier, params)
            : await MotionFlow.AE.wiggler.call(method, args ?? []);
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
    return (_jsxs("div", { className: "gal-script-form", children: [_jsxs("div", { className: "gal-script-form__tabs", children: [_jsx("button", { type: "button", className: tier === "basic" ? "is-active" : undefined, onClick: () => setTier("basic"), children: "Basic" }), _jsx("button", { type: "button", className: tier === "advanced" ? "is-active" : undefined, onClick: () => setTier("advanced"), children: "Advanced" })] }), _jsxs("label", { className: "gal-script-form__row", children: [_jsx("span", { children: "Amount" }), _jsx("input", { type: "number", value: amount, onChange: (e) => setAmount(Number(e.target.value)) })] }), _jsxs("label", { className: "gal-script-form__row", children: [_jsx("span", { children: "Speed" }), _jsx("input", { type: "number", step: 0.1, value: speed, onChange: (e) => setSpeed(Number(e.target.value)) })] }), _jsxs("div", { className: "gal-script-form__actions", children: [_jsx("button", { type: "button", disabled: busy, onClick: () => void call("apply"), children: "Apply" }), _jsx("button", { type: "button", disabled: busy, onClick: () => void call("remove"), children: "Remove" }), _jsx("button", { type: "button", disabled: busy, onClick: () => void call("bake"), children: "Bake" })] })] }));
}
