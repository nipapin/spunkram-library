import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronsUp, Loader2, Search, Star, X } from "lucide-react";
import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, } from "react";
import { PanelSidebar } from "@/components/panel-sidebar";
import { FootageGrid } from "@/components/footage-grid";
import { usePanelUI } from "@/lib/panel-ui-context";
import { BRAND } from "@brands";
import { GalFooter } from "./GalFooter";
const SNAP_EPSILON_PX = 28;
/** Sticky section title band — scroll-spy treats this as the "active" line. */
const STICKY_SPY_EPSILON_PX = 44;
/** Near end of scroll: last section cannot reach the sticky line — force-activate it. */
const SCROLL_BOTTOM_EPS_PX = 8;
/** Programmatic smooth scroll is settled when within this of the target top. */
const SCROLL_SETTLE_EPS_PX = 2;
function nearestGroupScrollTop(scroller) {
    const sections = Array.from(scroller.querySelectorAll(".gal-footage-section"));
    if (sections.length === 0)
        return null;
    const scrollTop = scroller.scrollTop;
    const starts = sections.map((el) => ({
        el,
        top: el.offsetTop,
    }));
    // Section that currently owns the viewport top (last start <= scrollTop + eps).
    let currentIdx = 0;
    for (let i = 0; i < starts.length; i++) {
        if (starts[i].top <= scrollTop + SNAP_EPSILON_PX)
            currentIdx = i;
        else
            break;
    }
    const current = starts[currentIdx];
    const atCurrentStart = Math.abs(scrollTop - current.top) <= SNAP_EPSILON_PX;
    const targetIdx = atCurrentStart && currentIdx > 0 ? currentIdx - 1 : currentIdx;
    return starts[targetIdx].top;
}
function sectionIdAtTop(scroller, top) {
    const nodes = Array.from(scroller.querySelectorAll("[data-section-id]"));
    if (nodes.length === 0)
        return null;
    let activeId = nodes[0].dataset.sectionId || null;
    for (const node of nodes) {
        const id = node.dataset.sectionId;
        if (!id)
            continue;
        if (node.offsetTop <= top + STICKY_SPY_EPSILON_PX)
            activeId = id;
        else
            break;
    }
    return activeId;
}
const GalSearchTools = memo(function GalSearchTools({ query, onQuery, showFavoritesOnly, onToggleFavorites, disabled, }) {
    // Local value so typing stays responsive while the grid filters in a transition.
    const [localQuery, setLocalQuery] = useState(query);
    useEffect(() => {
        setLocalQuery(query);
    }, [query]);
    return (_jsxs("div", { className: "gal-sidebar-tools", children: [_jsxs("label", { className: "gal-sidebar-search", children: [_jsx(Search, { className: "size-3.5 shrink-0", "aria-hidden": true }), _jsx("input", { type: "text", value: localQuery, onChange: (e) => {
                            const next = e.target.value;
                            setLocalQuery(next);
                            startTransition(() => onQuery(next));
                        }, placeholder: "Find items", disabled: disabled }), localQuery ? (_jsx("button", { type: "button", "aria-label": "Clear search", onClick: () => {
                            setLocalQuery("");
                            startTransition(() => onQuery(""));
                        }, children: _jsx(X, { className: "size-3" }) })) : null] }), _jsx("button", { type: "button", className: showFavoritesOnly ? "gal-sidebar-fav is-active" : "gal-sidebar-fav", "aria-pressed": showFavoritesOnly, "aria-label": "Favorites", title: "Favorites", disabled: disabled, onClick: () => startTransition(() => onToggleFavorites()), children: _jsx(Star, { className: "size-3.5", fill: showFavoritesOnly ? "currentColor" : "none" }) })] }));
});
export function GalEffectsWorkspace({ workspace, }) {
    const { showFavoritesOnly, showAvailableOnly, toggleShowFavoritesOnly } = usePanelUI();
    const { tree, sidebarTree, category, setCategory, query, setQuery, packError, assetsPath, assetsBaseUrl, assetsHost, packFilePath, packSettings, sections, activeRootId, scrollTargetSectionId, galAccountPlan, isLocked, isReady, prepareApply, structureLoading, } = workspace;
    const canBrowseRemote = Boolean(assetsBaseUrl) || tree.length > 0;
    const catalogLoading = structureLoading && tree.length === 0;
    const mainRef = useRef(null);
    const [showJumpFab, setShowJumpFab] = useState(false);
    const [gridReady, setGridReady] = useState(false);
    const [visibleSectionId, setVisibleSectionId] = useState(null);
    /** Bumps on every sidebar select so re-clicking the same group still scrolls. */
    const [navClickNonce, setNavClickNonce] = useState(0);
    /** Target scrollTop while smooth programmatic scroll runs; null = spy free. */
    const programmaticTargetTopRef = useRef(null);
    const spyEnabled = !showFavoritesOnly && query.trim().length === 0 && Boolean(activeRootId);
    const beginProgrammaticScroll = useCallback((el, top, sectionId) => {
        programmaticTargetTopRef.current = top;
        if (sectionId) {
            setVisibleSectionId(sectionId);
        }
        else {
            const id = sectionIdAtTop(el, top);
            if (id)
                setVisibleSectionId(id);
        }
        el.scrollTo({ top, behavior: "smooth" });
    }, []);
    const syncJumpFab = useCallback(() => {
        const el = mainRef.current;
        if (!el) {
            setShowJumpFab(false);
            return;
        }
        const sectionCount = el.querySelectorAll(".gal-footage-section").length;
        setShowJumpFab(sectionCount > 0 && el.scrollTop > SNAP_EPSILON_PX);
    }, []);
    const syncScrollSpy = useCallback(() => {
        if (!spyEnabled)
            return;
        const el = mainRef.current;
        if (!el)
            return;
        // Suppress spy until programmatic scroll settles (not a fixed timer).
        const target = programmaticTargetTopRef.current;
        if (target !== null) {
            if (Math.abs(el.scrollTop - target) <= SCROLL_SETTLE_EPS_PX) {
                programmaticTargetTopRef.current = null;
            }
            else {
                return;
            }
        }
        const nodes = Array.from(el.querySelectorAll("[data-section-id]"));
        if (nodes.length === 0)
            return;
        const scrollTop = el.scrollTop;
        const maxScroll = el.scrollHeight - el.clientHeight;
        // Last section's title often never reaches the sticky band — not enough
        // content below it. When pinned to the bottom, treat the last section as active.
        const atBottom = maxScroll > SCROLL_BOTTOM_EPS_PX &&
            scrollTop >= maxScroll - SCROLL_BOTTOM_EPS_PX;
        let activeId = "";
        if (atBottom) {
            activeId = nodes[nodes.length - 1].dataset.sectionId || "";
        }
        else {
            activeId = nodes[0].dataset.sectionId || "";
            for (const node of nodes) {
                const id = node.dataset.sectionId;
                if (!id)
                    continue;
                if (node.offsetTop <= scrollTop + STICKY_SPY_EPSILON_PX)
                    activeId = id;
                else
                    break;
            }
        }
        if (activeId) {
            setVisibleSectionId((prev) => (prev === activeId ? prev : activeId));
        }
    }, [spyEnabled]);
    useEffect(() => {
        const el = mainRef.current;
        if (!el)
            return;
        let raf = 0;
        const onScroll = () => {
            if (raf)
                return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                syncJumpFab();
                syncScrollSpy();
            });
        };
        // User wheel cancels programmatic suppress so spy tracks immediately.
        const onWheel = () => {
            programmaticTargetTopRef.current = null;
        };
        syncJumpFab();
        syncScrollSpy();
        el.addEventListener("scroll", onScroll, { passive: true });
        el.addEventListener("wheel", onWheel, { passive: true });
        return () => {
            if (raf)
                cancelAnimationFrame(raf);
            el.removeEventListener("scroll", onScroll);
            el.removeEventListener("wheel", onWheel);
        };
    }, [syncJumpFab, syncScrollSpy, sections, catalogLoading, gridReady]);
    // Clear spy when leaving browse mode.
    useEffect(() => {
        if (!spyEnabled)
            setVisibleSectionId(null);
    }, [spyEnabled]);
    // Instant jump to top when first-order root / search / favorites change.
    useLayoutEffect(() => {
        if (!gridReady)
            return;
        const el = mainRef.current;
        if (!el)
            return;
        programmaticTargetTopRef.current = null;
        el.scrollTop = 0;
        syncJumpFab();
    }, [activeRootId, query, showFavoritesOnly, gridReady, syncJumpFab]);
    // Scroll to the selected subgroup once the root grid is ready (or on category click).
    useEffect(() => {
        if (!gridReady || !scrollTargetSectionId || !spyEnabled)
            return;
        const el = mainRef.current;
        if (!el)
            return;
        // Root-folder select: stay at top (layout effect already reset); only highlight.
        if (category === activeRootId) {
            programmaticTargetTopRef.current = null;
            setVisibleSectionId(scrollTargetSectionId);
            return;
        }
        const target = el.querySelector(`[data-section-id="${scrollTargetSectionId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);
        if (!target)
            return;
        beginProgrammaticScroll(el, target.offsetTop, scrollTargetSectionId);
    }, [
        category,
        activeRootId,
        gridReady,
        scrollTargetSectionId,
        spyEnabled,
        navClickNonce,
        beginProgrammaticScroll,
    ]);
    const jumpToNearestGroup = useCallback(() => {
        const el = mainRef.current;
        if (!el)
            return;
        const targetTop = nearestGroupScrollTop(el);
        if (targetTop === null)
            return;
        beginProgrammaticScroll(el, targetTop);
    }, [beginProgrammaticScroll]);
    const handleReadyChange = useCallback((ready) => {
        setGridReady(ready);
    }, []);
    const handleSidebarSelect = useCallback((id) => {
        setNavClickNonce((n) => n + 1);
        startTransition(() => setCategory(id));
    }, [setCategory]);
    const sidebarActive = showFavoritesOnly
        ? ""
        : spyEnabled
            ? visibleSectionId || category
            : category;
    const searchTools = (_jsx(GalSearchTools, { query: query, onQuery: setQuery, showFavoritesOnly: showFavoritesOnly, onToggleFavorites: toggleShowFavoritesOnly, disabled: catalogLoading }));
    return (_jsxs("div", { className: "gal-effects", children: [_jsxs("div", { className: "gal-effects__body", children: [_jsx(PanelSidebar, { tree: showAvailableOnly ? sidebarTree : tree, active: sidebarActive, onSelect: handleSidebarSelect, tools: searchTools, loading: structureLoading }), _jsxs("div", { className: "gal-effects__main", ref: mainRef, children: [catalogLoading ? (_jsxs("div", { className: "gal-effects__empty", "aria-busy": "true", children: [_jsx(Loader2, { className: "gal-effects__spinner", "aria-hidden": true }), _jsx("span", { children: "Loading catalog\u2026" })] })) : packError && tree.length === 0 ? (_jsx("div", { className: "gal-effects__empty", children: packError })) : !canBrowseRemote && tree.length === 0 ? (_jsx("div", { className: "gal-effects__empty", children: "Effects catalog is empty. Check your connection or try again later." })) : (_jsx("div", { className: "gal-effects__grid-enter", children: _jsx(FootageGrid, { sections: sections, assetsPath: assetsPath, assetsBaseUrl: assetsBaseUrl, assetsHost: assetsHost, packFilePath: packFilePath, settings: packSettings, isLocked: isLocked, isReady: isReady, prepareApply: prepareApply, accessUi: "chips", accountPlan: galAccountPlan, subscribeUrl: BRAND.siteOrigin, stickySectionTitles: true, rootId: activeRootId, onReadyChange: handleReadyChange, emptyMessage: showAvailableOnly
                                        ? "No items available on your plan in this view."
                                        : "No matches" }) })), showJumpFab ? (_jsx("button", { type: "button", className: "gal-jump-group-float", "aria-label": "Jump to nearest group", title: "Jump to nearest group", onClick: jumpToNearestGroup, children: _jsx(ChevronsUp, { className: "size-4", "aria-hidden": true }) })) : null] })] }), _jsx(GalFooter, {})] }));
}
