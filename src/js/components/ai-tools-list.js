import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Type, BookOpen, Scissors, Sparkles, Plus, Infinity as InfinityIcon } from "lucide-react";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
const AI_TOOLS = [
    { id: "captions", label: "Captions", desc: "Auto-generate subtitles", icon: Type, soon: false },
    { id: "chapter", label: "Chapters", desc: "Split into chapters", icon: BookOpen, soon: false },
    { id: "silence", label: "Silence Remover", desc: "Cut pauses between words", icon: Scissors, soon: false },
];
function Sheen() {
    return _jsx("span", { className: "ai-hub__sheen", "aria-hidden": true });
}
export function AiToolsList({ monthly, extra, monthlyLimit, isFreeUser, onOpenTool, }) {
    const showExtra = !isFreeUser;
    const totalLeft = monthly + extra;
    const limitLabel = monthlyLimit != null ? String(monthlyLimit) : "—";
    const monthlyCap = Math.max(0, monthlyLimit ?? 0);
    const monthlyPct = monthlyCap > 0 ? Math.max(0, Math.min(100, (Math.max(monthly, 0) / monthlyCap) * 100)) : 0;
    return (_jsxs("div", { className: "ai-tools-scope ai-hub", children: [_jsx("div", { className: "ai-hub__mesh" }), _jsx("div", { className: "ai-hub__grid" }), _jsx("div", { className: "ai-hub__body", children: _jsx("div", { className: "ai-hub__scroll", children: _jsxs("div", { className: "ai-hub__stack", children: [_jsxs("section", { className: "ai-hub__card", children: [_jsx(Sheen, {}), _jsxs("div", { className: "ai-hub__inner", children: [_jsxs("div", { className: "ai-hub__row", children: [_jsxs("p", { className: "ai-hub__kicker", children: [_jsx(Sparkles, { className: "size-3.5", strokeWidth: 2.25 }), "Generations left"] }), _jsx("span", { className: "ai-hub__count", children: totalLeft })] }), _jsx("div", { className: "ai-hub__track", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": monthlyCap || undefined, "aria-valuenow": monthly, "aria-label": `${monthly} of ${limitLabel} subscription generations left`, children: monthlyPct > 0 ? (_jsx("div", { className: "ai-hub__fill ai-hub__fill--monthly", style: { width: `${monthlyPct}%` }, title: `${monthly}/${limitLabel} monthly` })) : null }), _jsxs("div", { className: "ai-hub__legend", children: [_jsxs("span", { className: "ai-hub__legend-item", children: [_jsx("span", { className: "ai-hub__dot ai-hub__dot--monthly", "aria-hidden": true }), monthly, "/", limitLabel, " ", isFreeUser ? "free plan" : "monthly", isFreeUser ? "" : " · resets each month"] }), _jsxs("div", { className: "ai-hub__legend-right", children: [showExtra ? (_jsxs("span", { className: "ai-hub__legend-item", children: [_jsx("span", { className: "ai-hub__dot ai-hub__dot--extra", "aria-hidden": true }), _jsx(InfinityIcon, { className: "size-3" }), extra, " extra"] })) : null, _jsxs("button", { type: "button", className: "ai-hub-btn ai-hub-btn--primary ai-hub-btn--tiny", onClick: () => openMotionflowSubscribe(), children: [_jsx(Plus, { className: "size-3", strokeWidth: 2.5 }), "Get more"] })] })] })] })] }), _jsx("div", { className: "ai-hub__tools", children: AI_TOOLS.map((tool) => {
                                    const Icon = tool.icon;
                                    const disabled = tool.soon || totalLeft <= 0;
                                    return (_jsxs("button", { type: "button", disabled: disabled, onClick: () => onOpenTool(tool.id), className: disabled
                                            ? "ai-hub__card ai-hub__card--tool ai-hub__card--disabled"
                                            : "ai-hub__card ai-hub__card--tool ai-hub__card--click", children: [_jsx(Sheen, {}), _jsxs("span", { className: "ai-hub__inner ai-hub__tool", children: [_jsx("span", { className: tool.soon ? "ai-hub__icon ai-hub__icon--muted" : "ai-hub__icon", children: _jsx(Icon, { className: "size-4", strokeWidth: 2.25 }) }), _jsxs("span", { className: "ai-hub__tool-copy", children: [_jsxs("span", { className: "ai-hub__tool-title", children: [tool.label, tool.soon && _jsx("span", { className: "ai-hub__soon", children: "Coming soon" })] }), _jsx("span", { className: "ai-hub__tool-desc", children: tool.desc })] })] })] }, tool.id));
                                }) })] }) }) })] }));
}
