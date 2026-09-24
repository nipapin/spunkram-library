import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { openMotionflowPricing } from "@/api/motionflow-auth";
import "./AiToolsPlanDialog.scss";
/** Blocks AI Tools on accounts without a subscription. Back leaves the screen; it does not open the tools. */
export function AiToolsPlanDialog({ onBack }) {
    return (_jsxs("div", { className: "ai-plan-gate", children: [_jsxs("button", { type: "button", className: "ai-plan-dialog__back", onClick: onBack, children: [_jsx(ArrowLeft, { className: "size-3.5" }), "Back"] }), _jsxs("div", { className: "ai-plan-dialog", role: "dialog", "aria-labelledby": "ai-plan-dialog-title", children: [_jsx("h2", { id: "ai-plan-dialog-title", className: "ai-plan-dialog__title", children: "To Continue Please Upgrade" }), _jsxs("button", { type: "button", className: "ai-plan-dialog__cta", onClick: () => openMotionflowPricing(), children: ["Upgrade", _jsx(ArrowUpRight, { className: "size-3.5", strokeWidth: 2.5 })] })] })] }));
}
