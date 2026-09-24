import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, } from "react";
import { ArrowLeft, AudioLines, BookOpen, Download, Folder, Info, Infinity as InfinityIcon, Play, Plus, Sparkles, Spline, SquareArrowOutUpRight, Trash2, Type, X, } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
import { AiToolsPlanDialog } from "@/components/AiToolsPlanDialog";
import { useGenerationsBalance } from "@/hooks/use-generations-balance";
import { MotionFlow } from "@/sdk";
import { getResolvedHostSync } from "@/lib/utils/host-identity";
import { ensureFfmpeg } from "@/utils/ffmpeg";
import { preloadVoiceoverPreviews } from "@/api/voiceover";
import { CaptionsApp } from "@/ui/spunkram/apps/CaptionsApp";
import { ChaptersApp } from "@/ui/spunkram/apps/ChaptersApp";
import { VoiceoverApp } from "@/ui/spunkram/apps/VoiceoverApp";
import { scriptsForHost, } from "./definitions";
import { ProjectSorterForm } from "./ProjectSorterForm";
import { RenamerForm } from "./RenamerForm";
import { WigglerForm } from "./WigglerForm";
import { runHandyCollect, runReduceProject } from "./pipelines";
import "@/ai-tools.scss";
import "./gal-scripts.scss";
const AI_TOOLS = [
    {
        id: "captions",
        name: "Captions",
        description: "Auto-generate subtitles",
        color: "#7c4dff",
        info: "Transcribe timeline audio and apply Gal caption styles. Uses AI generation credits from your Gal account.",
        icon: _jsx(Type, { strokeWidth: 1.25 }),
    },
    {
        id: "chapters",
        name: "Chapters",
        description: "Split into chapters",
        color: "#2bb0ed",
        info: "Generate YouTube-style chapters from transcript timings. Uses AI generation credits from your Gal account.",
        icon: _jsx(BookOpen, { strokeWidth: 1.25 }),
    },
    {
        id: "voiceover",
        name: "Voiceover",
        description: "AI narration with Minimax",
        color: "#e85d9a",
        info: "Generate AI narration audio and import it into the project. Uses AI generation credits from your Gal account.",
        icon: _jsx(AudioLines, { strokeWidth: 1.25 }),
    },
];
function resolveHost() {
    const fromSdk = MotionFlow.host;
    if (fromSdk === "PPRO")
        return "PPRO";
    if (fromSdk === "AE")
        return "AEFT";
    const sync = getResolvedHostSync();
    if (sync === "PPRO" || sync === "AEFT")
        return sync;
    return null;
}
const SCRIPT_ICONS = {
    folder: _jsx(Folder, { strokeWidth: 1.25 }),
    text: _jsx(Type, { strokeWidth: 1.25 }),
    trash: _jsx(Trash2, { strokeWidth: 1.25 }),
    download: _jsx(Download, { strokeWidth: 1.25 }),
    route: _jsx(Spline, { strokeWidth: 1.25 }),
};
function ScriptIcon({ icon }) {
    return _jsx(_Fragment, { children: SCRIPT_ICONS[icon] });
}
function GenerationsStrip({ monthly, extra, monthlyLimit, isFreeUser, }) {
    const total = monthly + extra;
    const limitLabel = monthlyLimit != null ? String(monthlyLimit) : "—";
    return (_jsxs("div", { className: "gal-scripts__gens", children: [_jsxs("div", { className: "gal-scripts__gens-main", children: [_jsxs("span", { className: "gal-scripts__gens-kicker", children: [_jsx(Sparkles, { className: "size-3.5", strokeWidth: 2.25 }), "Generations left"] }), _jsx("span", { className: "gal-scripts__gens-count", children: total })] }), _jsxs("div", { className: "gal-scripts__gens-meta", children: [_jsxs("span", { children: [monthly, "/", limitLabel, " ", isFreeUser ? "free plan" : "monthly"] }), !isFreeUser ? (_jsxs("span", { className: "gal-scripts__gens-extra", children: [_jsx(InfinityIcon, { className: "size-3" }), extra, " extra"] })) : null, _jsxs("button", { type: "button", className: "gal-scripts__gens-btn", onClick: () => openMotionflowSubscribe(), children: [_jsx(Plus, { className: "size-3", strokeWidth: 2.5 }), "Get more"] })] })] }));
}
export function GalScriptsPanel() {
    const { subscription, signedIn } = useAuth();
    const gens = useGenerationsBalance();
    const subscribed = !!subscription.subscribed;
    const host = useMemo(() => resolveHost(), []);
    const scripts = useMemo(() => scriptsForHost(host), [host]);
    const [active, setActive] = useState(null);
    const [activeAi, setActiveAi] = useState(null);
    const [infoScript, setInfoScript] = useState(null);
    const [infoAi, setInfoAi] = useState(null);
    const [planGate, setPlanGate] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const aiWarmupStarted = useRef(false);
    const aiEnabled = signedIn && subscribed && gens.totalLeft > 0;
    const aiClickable = signedIn && (!subscribed || gens.totalLeft > 0);
    useEffect(() => {
        if (!activeAi || aiWarmupStarted.current)
            return;
        aiWarmupStarted.current = true;
        void ensureFfmpeg().catch((err) => {
            console.warn("[gal] ffmpeg download failed:", err instanceof Error ? err.message : err);
        });
        void preloadVoiceoverPreviews();
    }, [activeAi]);
    function onMessage(msg) {
        setMessage(msg);
    }
    async function runPipeline(id) {
        if (!subscribed) {
            onMessage({ tone: "warning", text: "Subscription required" });
            return;
        }
        setBusy(true);
        setMessage({ tone: "info", text: "Running…" });
        try {
            if (id === "reduce-project")
                await runReduceProject(onMessage);
            else if (id === "handy-collect")
                await runHandyCollect(onMessage);
        }
        finally {
            setBusy(false);
        }
    }
    function openAiTool(tool) {
        if (!signedIn) {
            onMessage({ tone: "warning", text: "Sign in to use AI Tools." });
            return;
        }
        if (!subscribed) {
            setMessage(null);
            setPlanGate(true);
            return;
        }
        if (!aiEnabled) {
            onMessage({
                tone: "warning",
                text: "No AI generations left. Get more to continue.",
            });
            return;
        }
        setMessage(null);
        setActiveAi(tool);
    }
    if (planGate && !subscribed) {
        return (_jsx("div", { className: "gal-scripts", children: _jsx(AiToolsPlanDialog, { onBack: () => setPlanGate(false) }) }));
    }
    if (activeAi) {
        return (_jsxs("div", { className: "gal-scripts gal-scripts--ai-tool", children: [_jsxs("div", { className: "gal-scripts__detail-top", children: [_jsx("button", { type: "button", className: "gal-scripts__back", onClick: () => setActiveAi(null), "aria-label": "Back", children: _jsx(ArrowLeft, { className: "size-4" }) }), _jsxs("div", { className: "gal-scripts__detail-copy", children: [_jsx("h2", { children: activeAi.name }), _jsx("p", { children: activeAi.description })] }), _jsxs("span", { className: "gal-scripts__tool-gens", title: "Generations left", children: [_jsx(Sparkles, { className: "size-3" }), gens.totalLeft] })] }), _jsxs("div", { className: "gal-scripts__ai-body ai-tools-scope", children: [activeAi.id === "captions" ? (_jsx(CaptionsApp, { generationsLeft: gens.totalLeft })) : null, activeAi.id === "chapters" ? (_jsx(ChaptersApp, { generationsLeft: gens.totalLeft })) : null, activeAi.id === "voiceover" ? (_jsx(VoiceoverApp, { generationsLeft: gens.totalLeft })) : null] })] }));
    }
    if (active) {
        return (_jsxs("div", { className: "gal-scripts", children: [_jsxs("div", { className: "gal-scripts__detail-top", children: [_jsx("button", { type: "button", className: "gal-scripts__back", onClick: () => setActive(null), "aria-label": "Back", children: _jsx(ArrowLeft, { className: "size-4" }) }), _jsxs("div", { children: [_jsx("h2", { children: active.name }), _jsx("p", { children: active.description })] })] }), message ? (_jsx("p", { className: `gal-scripts__msg gal-scripts__msg--${message.tone}`, children: message.text })) : null, _jsxs("div", { className: "gal-scripts__detail-body", children: [active.id === "project-sorter" ? (_jsx(ProjectSorterForm, { onMessage: onMessage, subscribed: subscribed })) : null, active.id === "renamer" ? (_jsx(RenamerForm, { onMessage: onMessage, subscribed: subscribed })) : null, active.id === "wiggler" ? (_jsx(WigglerForm, { onMessage: onMessage, subscribed: subscribed })) : null] })] }));
    }
    return (_jsxs("div", { className: "gal-scripts", children: [_jsx(GenerationsStrip, { monthly: gens.monthly, extra: gens.extra, monthlyLimit: gens.monthlyLimit, isFreeUser: gens.isFreeUser }), !subscribed ? (_jsx("p", { className: "gal-scripts__banner", children: "Scripts require an active Gal Toolkit subscription." })) : null, message ? (_jsx("p", { className: `gal-scripts__msg gal-scripts__msg--${message.tone}`, children: message.text })) : null, _jsxs("div", { className: "gal-scripts__grid", children: [scripts.map((script) => (_jsxs("article", { className: "gal-scripts__card", style: {
                            "--script-color": script.color,
                        }, children: [_jsx("span", { className: "gal-scripts__circle", "aria-hidden": true }), _jsx("span", { className: "gal-scripts__watermark", "aria-hidden": true, children: _jsx(ScriptIcon, { icon: script.icon }) }), _jsxs("div", { className: "gal-scripts__card-top", children: [_jsx("h3", { children: script.name }), _jsx("button", { type: "button", className: "gal-scripts__info-btn", "aria-label": `About ${script.name}`, title: "About", onClick: () => setInfoScript(script), children: _jsx(Info, { className: "size-3.5", strokeWidth: 1.75 }) })] }), _jsx("div", { className: "gal-scripts__card-actions", children: script.pipeline ? (_jsx("button", { type: "button", className: "gal-scripts__action-btn", disabled: busy || !subscribed, "aria-label": `Run ${script.name}`, title: "Run", onClick: () => void runPipeline(script.id), children: _jsx(Play, { className: "size-3.5 fill-current" }) })) : (_jsx("button", { type: "button", className: "gal-scripts__action-btn", "aria-label": `Open ${script.name}`, title: "Open", onClick: () => setActive(script), children: _jsx(SquareArrowOutUpRight, { className: "size-3.5" }) })) })] }, script.id))), AI_TOOLS.map((tool) => (_jsxs("article", { className: aiClickable
                            ? "gal-scripts__card gal-scripts__card--ai"
                            : "gal-scripts__card gal-scripts__card--ai is-disabled", style: {
                            "--script-color": tool.color,
                        }, children: [_jsx("span", { className: "gal-scripts__circle", "aria-hidden": true }), _jsx("span", { className: "gal-scripts__watermark", "aria-hidden": true, children: tool.icon }), _jsxs("div", { className: "gal-scripts__card-top", children: [_jsxs("h3", { children: [_jsx(Sparkles, { className: "gal-scripts__ai-icon", strokeWidth: 2.25, "aria-hidden": true }), tool.name] }), _jsx("button", { type: "button", className: "gal-scripts__info-btn", "aria-label": `About ${tool.name}`, title: "About", onClick: () => setInfoAi(tool), children: _jsx(Info, { className: "size-3.5", strokeWidth: 1.75 }) })] }), _jsx("div", { className: "gal-scripts__card-actions", children: _jsx("button", { type: "button", className: "gal-scripts__action-btn", disabled: !aiClickable, "aria-label": `Open ${tool.name}`, title: !signedIn
                                        ? "Sign in required"
                                        : !subscribed
                                            ? "Creator plan required"
                                            : aiEnabled
                                                ? "Open"
                                                : "No generations left", onClick: () => openAiTool(tool), children: _jsx(SquareArrowOutUpRight, { className: "size-3.5" }) }) })] }, tool.id)))] }), infoScript || infoAi ? (_jsxs("div", { className: "gal-scripts__about", role: "dialog", "aria-modal": "true", "aria-label": `About ${(infoScript || infoAi).name}`, children: [_jsx("button", { type: "button", className: "gal-scripts__about-backdrop", "aria-label": "Close", onClick: () => {
                            setInfoScript(null);
                            setInfoAi(null);
                        } }), _jsxs("aside", { className: "gal-scripts__about-panel", children: [_jsxs("div", { className: "gal-scripts__about-head", children: [_jsx("span", { className: "gal-scripts__about-icon", style: { color: (infoScript || infoAi).color }, children: infoScript ? (_jsx(ScriptIcon, { icon: infoScript.icon })) : (infoAi.icon) }), _jsxs("h3", { children: [infoAi ? (_jsx(Sparkles, { className: "gal-scripts__ai-icon", strokeWidth: 2.25, "aria-hidden": true })) : null, (infoScript || infoAi).name] }), _jsx("button", { type: "button", className: "gal-scripts__info-btn", "aria-label": "Close", onClick: () => {
                                            setInfoScript(null);
                                            setInfoAi(null);
                                        }, children: _jsx(X, { className: "size-3.5" }) })] }), _jsx("p", { className: "gal-scripts__about-body", children: infoScript ? infoScript.info : infoAi.info })] })] })) : null] }));
}
