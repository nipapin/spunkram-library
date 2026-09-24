import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
import { usePanelUI } from "@/lib/panel-ui-context";
import { GraduationCap, Package, Search, SlidersHorizontal, Star } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
const SHOW_TUTORIALS = false;
export function PanelToolbar({ tutorialsOpen = false, onToggleTutorials, query, onQuery, packName, showControlsToggle = false, controlsOpen = false, onToggleControls, className = "", }) {
    const { showFavoritesOnly, toggleShowFavoritesOnly, setShowFavoritesOnly } = usePanelUI();
    const favoritesOn = showFavoritesOnly && !tutorialsOpen;
    const [localQuery, setLocalQuery] = useState(query);
    useEffect(() => {
        setLocalQuery(query);
    }, [query]);
    function handleToggleTutorials() {
        if (!tutorialsOpen) {
            setShowFavoritesOnly(false);
        }
        onToggleTutorials?.();
    }
    function handleToggleFavorites() {
        startTransition(() => {
            if (tutorialsOpen) {
                onToggleTutorials?.();
                setShowFavoritesOnly(true);
                return;
            }
            toggleShowFavoritesOnly();
        });
    }
    return (_jsxs("div", { className: cn("flex items-center justify-between gap-2 border-b border-[rgb(42,36,64)] px-3 py-2", className), children: [_jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-1", children: [showControlsToggle && (_jsx("button", { type: "button", "aria-label": "Toggle playback controls", "aria-pressed": controlsOpen, onClick: onToggleControls, className: cn("mr-1 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors", controlsOpen
                            ? "pill-brand"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"), children: _jsx(SlidersHorizontal, { className: "size-4" }) })), SHOW_TUTORIALS && (_jsx("button", { type: "button", "aria-label": "Video tutorials", title: "Video tutorials", "aria-pressed": tutorialsOpen, onClick: handleToggleTutorials, className: cn("flex size-8 shrink-0 items-center justify-center rounded-full transition-colors", tutorialsOpen
                            ? "pill-brand"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"), children: _jsx(GraduationCap, { className: "size-4" }) })), packName ? (_jsxs("div", { className: "flex min-w-0 items-center gap-1.5 px-0.5", title: packName, children: [_jsx(Package, { className: "size-3.5 shrink-0 text-primary" }), _jsx("span", { className: "min-w-0 truncate text-xs font-semibold text-foreground", children: packName })] })) : null] }), _jsxs("div", { className: "flex shrink-0 items-center gap-1.5", children: [_jsxs("div", { className: "relative w-44", children: [_jsx(Search, { className: "pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" }), _jsx("input", { type: "text", value: localQuery, onChange: (e) => {
                                    const next = e.target.value;
                                    setLocalQuery(next);
                                    startTransition(() => onQuery(next));
                                }, placeholder: "Find items", className: "w-full rounded-full border border-[rgb(42,36,64)] bg-[rgb(14,12,26)]/50 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c4dff]/60 focus:outline-none" })] }), _jsx("button", { type: "button", "aria-label": "Favorites", "aria-pressed": favoritesOn, onClick: handleToggleFavorites, className: cn("flex size-8 items-center justify-center rounded-full transition-colors", favoritesOn
                            ? "pill-brand"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"), children: _jsx(Star, { className: "size-4", fill: favoritesOn ? "currentColor" : "none", strokeWidth: 2.25 }) })] })] }));
}
