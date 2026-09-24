import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, } from "react";
import * as panelStore from "@/lib/userdata-store";
import { storageKey } from "@brands";
import { friendlyErrorMessage } from "@/utils/user-error";
export const THUMB_SIZE_MIN = 1;
export const THUMB_SIZE_MAX = 3;
/** Default = densest grid (3 columns). */
export const THUMB_SIZE_DEFAULT = 1;
const FAVORITES_STORAGE_KEY = storageKey("favorites");
const UI_STATE_KEY = storageKey("uiState");
/** Legacy key — migrated into UI_STATE_KEY once. */
const LEGACY_SHOW_NEW_BADGES_KEY = "spunkram.showNewBadges";
const UI_DEFAULTS = {
    playPreview: false,
    audioEnabled: true,
    previewVolume: 50,
    thumbSize: THUMB_SIZE_DEFAULT,
    focusMode: false,
    showNewBadges: true,
    showAvailableOnly: false,
};
function clampPreviewVolume(v) {
    if (!Number.isFinite(v))
        return UI_DEFAULTS.previewVolume;
    return Math.min(100, Math.max(0, Math.round(v)));
}
function clampThumbSize(size) {
    if (!Number.isFinite(size))
        return THUMB_SIZE_DEFAULT;
    const n = Math.round(size);
    // Legacy 1–5 slider: keep approximate column count when capping to 1–3.
    if (n > THUMB_SIZE_MAX) {
        const cols = Math.min(3, Math.max(1, 6 - n));
        return Math.min(THUMB_SIZE_MAX, Math.max(THUMB_SIZE_MIN, 4 - cols));
    }
    return Math.min(THUMB_SIZE_MAX, Math.max(THUMB_SIZE_MIN, n));
}
function loadUiState() {
    try {
        const raw = panelStore.getItem(UI_STATE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                playPreview: typeof parsed.playPreview === "boolean"
                    ? parsed.playPreview
                    : UI_DEFAULTS.playPreview,
                audioEnabled: typeof parsed.audioEnabled === "boolean"
                    ? parsed.audioEnabled
                    : UI_DEFAULTS.audioEnabled,
                previewVolume: typeof parsed.previewVolume === "number"
                    ? clampPreviewVolume(parsed.previewVolume)
                    : UI_DEFAULTS.previewVolume,
                thumbSize: typeof parsed.thumbSize === "number"
                    ? clampThumbSize(parsed.thumbSize)
                    : UI_DEFAULTS.thumbSize,
                focusMode: typeof parsed.focusMode === "boolean"
                    ? parsed.focusMode
                    : UI_DEFAULTS.focusMode,
                showNewBadges: typeof parsed.showNewBadges === "boolean"
                    ? parsed.showNewBadges
                    : UI_DEFAULTS.showNewBadges,
                showAvailableOnly: typeof parsed.showAvailableOnly === "boolean"
                    ? parsed.showAvailableOnly
                    : UI_DEFAULTS.showAvailableOnly,
            };
        }
        // Migrate pre-unified showNewBadges flag.
        const legacyNew = panelStore.getItem(LEGACY_SHOW_NEW_BADGES_KEY);
        if (legacyNew !== null) {
            return {
                ...UI_DEFAULTS,
                showNewBadges: legacyNew === "1" || legacyNew === "true",
            };
        }
    }
    catch {
        // ignore
    }
    return { ...UI_DEFAULTS };
}
function persistUiState(state) {
    try {
        panelStore.setItem(UI_STATE_KEY, JSON.stringify(state));
        panelStore.removeItem(LEGACY_SHOW_NEW_BADGES_KEY);
    }
    catch {
        // CEP disk / private mode may block storage
    }
}
function loadFavoriteIds() {
    try {
        const raw = panelStore.getItem(FAVORITES_STORAGE_KEY);
        if (!raw)
            return new Set();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return new Set();
        return new Set(parsed.filter((id) => typeof id === "string"));
    }
    catch {
        return new Set();
    }
}
function persistFavoriteIds(ids) {
    try {
        panelStore.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...ids]));
    }
    catch {
        // CEP disk / private mode may block storage
    }
}
/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const PANEL_GRID_KEY = "__spunkram_panel_grid_context__";
const PANEL_CHROME_KEY = "__spunkram_panel_chrome_context__";
const PANEL_ACTIONS_KEY = "__spunkram_panel_actions_context__";
const g = globalThis;
const PanelGridContext = g[PANEL_GRID_KEY] ?? createContext(null);
g[PANEL_GRID_KEY] = PanelGridContext;
const PanelChromeContext = g[PANEL_CHROME_KEY] ?? createContext(null);
g[PANEL_CHROME_KEY] = PanelChromeContext;
const PanelActionsContext = g[PANEL_ACTIONS_KEY] ?? createContext(null);
g[PANEL_ACTIONS_KEY] = PanelActionsContext;
/** thumbSize 1 → 3 cols, 2 → 2, 3 → 1. */
function sizeToColumns(size) {
    return THUMB_SIZE_MAX + THUMB_SIZE_MIN - size;
}
export function PanelUIProvider({ children }) {
    const initial = useRef(loadUiState()).current;
    const [playPreview, setPlayPreview] = useState(initial.playPreview);
    const [audioEnabled, setAudioEnabled] = useState(initial.audioEnabled);
    const [previewVolume, setPreviewVolumeState] = useState(initial.previewVolume);
    const [thumbSize, setThumbSizeState] = useState(initial.thumbSize);
    const [hoveredItemName, setHoveredItemNameState] = useState(null);
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [showNewBadges, setShowNewBadgesState] = useState(initial.showNewBadges);
    const [showAvailableOnly, setShowAvailableOnly] = useState(initial.showAvailableOnly);
    const [favoriteIds, setFavoriteIds] = useState(loadFavoriteIds);
    const [focusMode, setFocusMode] = useState(initial.focusMode);
    const [applyingItemId, setApplyingItemId] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);
    const statusTimer = useRef(null);
    // Refs so actions context stays referentially stable across chrome updates.
    const setHoveredItemNameRef = useRef(() => { });
    const showStatusRef = useRef(() => { });
    useEffect(() => {
        persistUiState({
            playPreview,
            audioEnabled,
            previewVolume,
            thumbSize,
            focusMode,
            showNewBadges,
            showAvailableOnly,
        });
    }, [
        playPreview,
        audioEnabled,
        previewVolume,
        thumbSize,
        focusMode,
        showNewBadges,
        showAvailableOnly,
    ]);
    const togglePlayPreview = useCallback(() => {
        setPlayPreview((v) => !v);
    }, []);
    const toggleAudio = useCallback(() => {
        setAudioEnabled((v) => {
            if (v)
                return false;
            setPreviewVolumeState((vol) => (vol <= 0 ? 100 : vol));
            return true;
        });
    }, []);
    const setPreviewVolume = useCallback((volume) => {
        const next = clampPreviewVolume(volume);
        setPreviewVolumeState(next);
        setAudioEnabled(next > 0);
    }, []);
    const setThumbSize = useCallback((size) => {
        setThumbSizeState(clampThumbSize(size));
    }, []);
    const setHoveredItemName = useCallback((name) => {
        setHoveredItemNameState(name);
    }, []);
    const toggleShowFavoritesOnly = useCallback(() => {
        setShowFavoritesOnly((v) => !v);
    }, []);
    const setShowNewBadges = useCallback((value) => {
        setShowNewBadgesState(value);
    }, []);
    const toggleShowAvailableOnly = useCallback(() => {
        setShowAvailableOnly((v) => !v);
    }, []);
    const isFavorite = useCallback((itemId) => favoriteIds.has(itemId), [favoriteIds]);
    const toggleFavorite = useCallback((itemId) => {
        setFavoriteIds((prev) => {
            const next = new Set(prev);
            if (next.has(itemId))
                next.delete(itemId);
            else
                next.add(itemId);
            persistFavoriteIds(next);
            return next;
        });
    }, []);
    const gridColumns = sizeToColumns(thumbSize);
    const toggleFocusMode = useCallback(() => {
        setFocusMode((v) => !v);
    }, []);
    const showStatus = useCallback((text, tone = "info", durationMs = 4000, card) => {
        if (statusTimer.current)
            clearTimeout(statusTimer.current);
        const display = tone === "error" ? friendlyErrorMessage(text) : text;
        setStatusMessage({ text: display, tone, card });
        statusTimer.current = setTimeout(() => setStatusMessage(null), durationMs);
    }, []);
    const clearStatus = useCallback(() => {
        if (statusTimer.current)
            clearTimeout(statusTimer.current);
        statusTimer.current = null;
        setStatusMessage(null);
    }, []);
    setHoveredItemNameRef.current = setHoveredItemName;
    showStatusRef.current = showStatus;
    const gridValue = useMemo(() => ({
        playPreview,
        audioEnabled,
        previewVolume,
        thumbSize,
        gridColumns,
        showFavoritesOnly,
        showNewBadges,
        showAvailableOnly,
        favoriteIds,
        focusMode,
        applyingItemId,
        togglePlayPreview,
        toggleAudio,
        setPreviewVolume,
        setThumbSize,
        toggleShowFavoritesOnly,
        setShowFavoritesOnly,
        setShowNewBadges,
        toggleShowAvailableOnly,
        isFavorite,
        toggleFavorite,
        toggleFocusMode,
        setApplyingItemId,
    }), [
        playPreview,
        audioEnabled,
        previewVolume,
        thumbSize,
        gridColumns,
        showFavoritesOnly,
        showNewBadges,
        showAvailableOnly,
        favoriteIds,
        focusMode,
        applyingItemId,
        togglePlayPreview,
        toggleAudio,
        setPreviewVolume,
        setThumbSize,
        toggleShowFavoritesOnly,
        setShowNewBadges,
        toggleShowAvailableOnly,
        isFavorite,
        toggleFavorite,
        toggleFocusMode,
    ]);
    const chromeValue = useMemo(() => ({
        hoveredItemName,
        statusMessage,
        clearStatus,
    }), [hoveredItemName, statusMessage, clearStatus]);
    // Stable forever — callers dispatch through refs.
    const actionsValue = useMemo(() => ({
        setHoveredItemName: (name) => setHoveredItemNameRef.current(name),
        showStatus: (text, tone, durationMs, card) => showStatusRef.current(text, tone, durationMs, card),
    }), []);
    return (_jsx(PanelActionsContext.Provider, { value: actionsValue, children: _jsx(PanelChromeContext.Provider, { value: chromeValue, children: _jsx(PanelGridContext.Provider, { value: gridValue, children: children }) }) }));
}
function requireCtx(ctx, name) {
    if (!ctx) {
        throw new Error(`${name} must be used within PanelUIProvider`);
    }
    return ctx;
}
/** Grid playback / favorites — for PreviewCard and FootageGrid. */
export function usePanelGrid() {
    return requireCtx(use(PanelGridContext), "usePanelGrid");
}
/** Footer chrome — hover hint + status toast. */
export function usePanelChrome() {
    return requireCtx(use(PanelChromeContext), "usePanelChrome");
}
/** Stable write-only actions (showStatus, setHoveredItemName). */
export function usePanelActions() {
    return requireCtx(use(PanelActionsContext), "usePanelActions");
}
/** Merged view for footers / workspace / apps that need everything. */
export function usePanelUI() {
    const grid = usePanelGrid();
    const chrome = usePanelChrome();
    const actions = usePanelActions();
    return useMemo(() => ({ ...grid, ...chrome, ...actions }), [grid, chrome, actions]);
}
