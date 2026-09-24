import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { AiToolsList } from "@/components/ai-tools-list";
import { CaptionsApp } from "@/ui/spunkram/apps/CaptionsApp";
import { ChaptersApp } from "@/ui/spunkram/apps/ChaptersApp";
import { SilenceRemoverApp } from "@/ui/spunkram/apps/SilenceRemoverApp";
import * as panelStore from "@/lib/userdata-store";
import "@/ai-tools.scss";
const TOOL_KEY = "spunkram-library-ai-active-tool";
const loadTool = () => {
    try {
        const stored = panelStore.getItem(TOOL_KEY);
        if (stored === "captions" || stored === "chapters" || stored === "silence")
            return stored;
    }
    catch {
        // ignore
    }
    return "hub";
};
export function AiToolsPanel({ monthly, extra, monthlyLimit, isFreeUser, onUse, }) {
    const [activeTool, setActiveTool] = useState(loadTool);
    const totalLeft = monthly + extra;
    const onUseRef = useRef(onUse);
    onUseRef.current = onUse;
    useEffect(() => {
        panelStore.setItem(TOOL_KEY, activeTool);
    }, [activeTool]);
    useEffect(() => {
        const onCreditsChanged = () => onUseRef.current();
        window.addEventListener("aitools-credits-changed", onCreditsChanged);
        return () => window.removeEventListener("aitools-credits-changed", onCreditsChanged);
    }, []);
    const openTool = (id) => {
        if (totalLeft <= 0)
            return;
        if (id === "captions")
            setActiveTool("captions");
        else if (id === "chapter" || id === "chapters")
            setActiveTool("chapters");
        else if (id === "silence")
            setActiveTool("silence");
    };
    if (activeTool === "captions" || activeTool === "chapters" || activeTool === "silence") {
        const title = activeTool === "captions"
            ? "Captions"
            : activeTool === "chapters"
                ? "Chapters"
                : "Silence Remover";
        return (_jsxs("div", { className: "ai-tools-scope tool-shell", children: [_jsxs("header", { className: "tool-shell__header", children: [_jsx("button", { type: "button", className: "tool-shell__back", onClick: () => setActiveTool("hub"), "aria-label": "Back to tools", children: _jsx(ArrowLeft, { size: 16 }) }), _jsx("span", { className: "tool-shell__title", children: title }), _jsxs("span", { className: "tool-shell__gens", title: "Generations left", children: [_jsx(Sparkles, { size: 12, style: { display: "inline", verticalAlign: "-1px", marginRight: 4 } }), totalLeft] })] }), _jsx("div", { className: "tool-shell__body", children: activeTool === "captions" ? (_jsx(CaptionsApp, { generationsLeft: totalLeft })) : activeTool === "chapters" ? (_jsx(ChaptersApp, { generationsLeft: totalLeft })) : (_jsx(SilenceRemoverApp, { generationsLeft: totalLeft })) })] }));
    }
    return (_jsx(AiToolsList, { monthly: monthly, extra: extra, monthlyLimit: monthlyLimit, isFreeUser: isFreeUser, onOpenTool: openTool }));
}
