import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpCircle, Info, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@brands";
function formatChangelog(raw) {
    const text = raw.trim();
    if (!text)
        return [];
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line
        .replace(/^#+\s*/, "")
        .replace(/^[-*•]\s+/, "")
        .replace(/^\d+\.\s+/, ""))
        .filter(Boolean)
        .slice(0, 12);
}
export function UpdateBanner({ version, localVersion, changelog = "", channel = "stable", busy, progressLabel, error, onUpdate, }) {
    const [infoOpen, setInfoOpen] = useState(false);
    const panelId = useId();
    const rootRef = useRef(null);
    const notes = formatChangelog(changelog);
    useEffect(() => {
        if (!infoOpen)
            return;
        const onPointer = (e) => {
            if (!rootRef.current?.contains(e.target))
                setInfoOpen(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape")
                setInfoOpen(false);
        };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [infoOpen]);
    return (_jsxs("div", { ref: rootRef, className: "relative mx-2.5 mt-2.5", children: [_jsxs("div", { className: cn("overflow-hidden rounded-xl border border-primary/35", "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent", "shadow-md shadow-primary/15 ring-1 ring-inset ring-white/10"), children: [_jsxs("div", { className: "flex items-center gap-2.5 px-3 py-2.5", children: [_jsx("div", { className: cn("flex size-8 shrink-0 items-center justify-center rounded-full", "bg-primary text-primary-foreground shadow-md shadow-primary/40"), children: busy ? (_jsx(Loader2, { className: "size-4 animate-spin" })) : (_jsx(Sparkles, { className: "size-4" })) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "text-[12px] font-semibold leading-tight text-foreground", children: busy
                                            ? `Updating ${BRAND.authorName}`
                                            : channel === "beta"
                                                ? "Beta update available"
                                                : "Update available" }), _jsx("p", { className: "mt-0.5 truncate text-[10px] text-muted-foreground", children: busy
                                            ? progressLabel || `Installing v${version}…`
                                            : localVersion
                                                ? `v${localVersion} → v${version}${channel === "beta" ? " (beta)" : ""}`
                                                : `Version ${version} is ready` })] }), !busy && (_jsx("button", { type: "button", "aria-label": "What's new", "aria-expanded": infoOpen, "aria-controls": panelId, title: "What's new", className: cn("flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors", infoOpen
                                    ? "border-primary/50 bg-primary/20 text-primary"
                                    : "border-white/10 bg-black/20 text-muted-foreground hover:border-primary/40 hover:text-foreground"), onClick: () => setInfoOpen((v) => !v), children: _jsx(Info, { className: "size-3.5" }) })), !busy && (_jsxs("button", { type: "button", className: cn("inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5", "bg-gradient-to-b from-primary to-primary/70 text-[11px] font-semibold text-primary-foreground", "border border-primary/60 shadow-md shadow-primary/40", "ring-1 ring-inset ring-white/15 transition-opacity hover:opacity-95"), onClick: onUpdate, children: [_jsx(ArrowUpCircle, { className: "size-3.5" }), "Update"] }))] }), busy && (_jsx("div", { className: "h-0.5 w-full overflow-hidden bg-primary/15", children: _jsx("div", { className: "h-full w-1/3 animate-pulse rounded-full bg-primary/70" }) }))] }), infoOpen && !busy ? (_jsxs("div", { id: panelId, role: "region", "aria-label": "Release notes", className: cn("absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl", "border border-white/10 bg-card/95 shadow-xl backdrop-blur-md", "ring-1 ring-inset ring-white/5"), children: [_jsxs("div", { className: "border-b border-white/10 px-3 py-2", children: [_jsxs("p", { className: "text-[11px] font-semibold text-foreground", children: ["What's new in v", version] }), _jsx("p", { className: "text-[10px] text-muted-foreground", children: "Changes included in this update" })] }), _jsx("div", { className: "max-h-40 overflow-y-auto px-3 py-2", children: notes.length > 0 ? (_jsx("ul", { className: "space-y-1.5", children: notes.map((line, i) => (_jsxs("li", { className: "flex gap-2 text-[11px] leading-snug text-foreground/90", children: [_jsx("span", { className: "mt-1.5 size-1 shrink-0 rounded-full bg-primary" }), _jsx("span", { children: line })] }, `${i}-${line.slice(0, 24)}`))) })) : (_jsx("p", { className: "text-[11px] text-muted-foreground", children: "No release notes for this version yet. The update still includes the latest fixes and improvements." })) })] })) : null, error ? (_jsx("p", { className: "mt-1.5 px-1 text-[10px] text-red-300", children: error })) : null] }));
}
