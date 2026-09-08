import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

type PersistedUiState = {
  playPreview: boolean;
  audioEnabled: boolean;
  /** Preview volume 0–100 (muted when audioEnabled is false). */
  previewVolume: number;
  thumbSize: number;
  focusMode: boolean;
  showNewBadges: boolean;
  /** When true, grid shows only items unlocked for the current plan. */
  showAvailableOnly: boolean;
};

const UI_DEFAULTS: PersistedUiState = {
  playPreview: false,
  audioEnabled: true,
  previewVolume: 50,
  thumbSize: THUMB_SIZE_DEFAULT,
  focusMode: false,
  showNewBadges: true,
  showAvailableOnly: false,
};

function clampPreviewVolume(v: number): number {
  if (!Number.isFinite(v)) return UI_DEFAULTS.previewVolume;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function clampThumbSize(size: number): number {
  if (!Number.isFinite(size)) return THUMB_SIZE_DEFAULT;
  const n = Math.round(size);
  // Legacy 1–5 slider: keep approximate column count when capping to 1–3.
  if (n > THUMB_SIZE_MAX) {
    const cols = Math.min(3, Math.max(1, 6 - n));
    return Math.min(THUMB_SIZE_MAX, Math.max(THUMB_SIZE_MIN, 4 - cols));
  }
  return Math.min(THUMB_SIZE_MAX, Math.max(THUMB_SIZE_MIN, n));
}

function loadUiState(): PersistedUiState {
  try {
    const raw = panelStore.getItem(UI_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedUiState>;
      return {
        playPreview:
          typeof parsed.playPreview === "boolean"
            ? parsed.playPreview
            : UI_DEFAULTS.playPreview,
        audioEnabled:
          typeof parsed.audioEnabled === "boolean"
            ? parsed.audioEnabled
            : UI_DEFAULTS.audioEnabled,
        previewVolume:
          typeof parsed.previewVolume === "number"
            ? clampPreviewVolume(parsed.previewVolume)
            : UI_DEFAULTS.previewVolume,
        thumbSize:
          typeof parsed.thumbSize === "number"
            ? clampThumbSize(parsed.thumbSize)
            : UI_DEFAULTS.thumbSize,
        focusMode:
          typeof parsed.focusMode === "boolean"
            ? parsed.focusMode
            : UI_DEFAULTS.focusMode,
        showNewBadges:
          typeof parsed.showNewBadges === "boolean"
            ? parsed.showNewBadges
            : UI_DEFAULTS.showNewBadges,
        showAvailableOnly:
          typeof parsed.showAvailableOnly === "boolean"
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
  } catch {
    // ignore
  }
  return { ...UI_DEFAULTS };
}

function persistUiState(state: PersistedUiState) {
  try {
    panelStore.setItem(UI_STATE_KEY, JSON.stringify(state));
    panelStore.removeItem(LEGACY_SHOW_NEW_BADGES_KEY);
  } catch {
    // CEP disk / private mode may block storage
  }
}

function loadFavoriteIds(): Set<string> {
  try {
    const raw = panelStore.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function persistFavoriteIds(ids: Set<string>) {
  try {
    panelStore.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // CEP disk / private mode may block storage
  }
}

export type StatusMessage = {
  text: string;
  tone: "info" | "success" | "error";
  /** Rich pack toast (WSS new/updated) — rendered as a compact card. */
  card?: {
    title: string;
    subtitle?: string;
    imageUrl?: string | null;
    detailsUrl?: string | null;
  };
};

/** Grid playback / favorites — cards subscribe here (not chrome hover/toast). */
export type PanelGridContextValue = {
  playPreview: boolean;
  audioEnabled: boolean;
  previewVolume: number;
  thumbSize: number;
  gridColumns: number;
  showFavoritesOnly: boolean;
  showNewBadges: boolean;
  showAvailableOnly: boolean;
  favoriteIds: ReadonlySet<string>;
  focusMode: boolean;
  applyingItemId: string | null;
  togglePlayPreview: () => void;
  toggleAudio: () => void;
  setPreviewVolume: (volume: number) => void;
  setThumbSize: (size: number) => void;
  toggleShowFavoritesOnly: () => void;
  setShowFavoritesOnly: (value: boolean) => void;
  setShowNewBadges: (value: boolean) => void;
  toggleShowAvailableOnly: () => void;
  isFavorite: (itemId: string) => boolean;
  toggleFavorite: (itemId: string) => void;
  toggleFocusMode: () => void;
  setApplyingItemId: (itemId: string | null) => void;
};

/** Footer chrome — hover name + status toast. Cards must not subscribe. */
export type PanelChromeContextValue = {
  hoveredItemName: string | null;
  statusMessage: StatusMessage | null;
  clearStatus: () => void;
};

/** Stable write-only actions — dispatch via refs so identity never changes. */
export type PanelActionsContextValue = {
  setHoveredItemName: (name: string | null) => void;
  showStatus: (
    text: string,
    tone?: StatusMessage["tone"],
    durationMs?: number,
    card?: StatusMessage["card"],
  ) => void;
};

export type PanelUIContextValue = PanelGridContextValue &
  PanelChromeContextValue &
  PanelActionsContextValue;

/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const PANEL_GRID_KEY = "__spunkram_panel_grid_context__";
const PANEL_CHROME_KEY = "__spunkram_panel_chrome_context__";
const PANEL_ACTIONS_KEY = "__spunkram_panel_actions_context__";

type PanelUIGlobal = typeof globalThis & {
  [PANEL_GRID_KEY]?: ReturnType<typeof createContext<PanelGridContextValue | null>>;
  [PANEL_CHROME_KEY]?: ReturnType<typeof createContext<PanelChromeContextValue | null>>;
  [PANEL_ACTIONS_KEY]?: ReturnType<typeof createContext<PanelActionsContextValue | null>>;
};

const g = globalThis as PanelUIGlobal;

const PanelGridContext =
  g[PANEL_GRID_KEY] ?? createContext<PanelGridContextValue | null>(null);
g[PANEL_GRID_KEY] = PanelGridContext;

const PanelChromeContext =
  g[PANEL_CHROME_KEY] ?? createContext<PanelChromeContextValue | null>(null);
g[PANEL_CHROME_KEY] = PanelChromeContext;

const PanelActionsContext =
  g[PANEL_ACTIONS_KEY] ?? createContext<PanelActionsContextValue | null>(null);
g[PANEL_ACTIONS_KEY] = PanelActionsContext;

/** thumbSize 1 → 3 cols, 2 → 2, 3 → 1. */
function sizeToColumns(size: number): number {
  return THUMB_SIZE_MAX + THUMB_SIZE_MIN - size;
}

export function PanelUIProvider({ children }: { children: ReactNode }) {
  const initial = useRef(loadUiState()).current;
  const [playPreview, setPlayPreview] = useState(initial.playPreview);
  const [audioEnabled, setAudioEnabled] = useState(initial.audioEnabled);
  const [previewVolume, setPreviewVolumeState] = useState(initial.previewVolume);
  const [thumbSize, setThumbSizeState] = useState(initial.thumbSize);
  const [hoveredItemName, setHoveredItemNameState] = useState<string | null>(
    null,
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showNewBadges, setShowNewBadgesState] = useState(initial.showNewBadges);
  const [showAvailableOnly, setShowAvailableOnly] = useState(initial.showAvailableOnly);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(loadFavoriteIds);
  const [focusMode, setFocusMode] = useState(initial.focusMode);
  const [applyingItemId, setApplyingItemId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs so actions context stays referentially stable across chrome updates.
  const setHoveredItemNameRef = useRef<(name: string | null) => void>(() => {});
  const showStatusRef = useRef<PanelActionsContextValue["showStatus"]>(() => {});

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
      if (v) return false;
      setPreviewVolumeState((vol) => (vol <= 0 ? 100 : vol));
      return true;
    });
  }, []);

  const setPreviewVolume = useCallback((volume: number) => {
    const next = clampPreviewVolume(volume);
    setPreviewVolumeState(next);
    setAudioEnabled(next > 0);
  }, []);

  const setThumbSize = useCallback((size: number) => {
    setThumbSizeState(clampThumbSize(size));
  }, []);

  const setHoveredItemName = useCallback((name: string | null) => {
    setHoveredItemNameState(name);
  }, []);

  const toggleShowFavoritesOnly = useCallback(() => {
    setShowFavoritesOnly((v) => !v);
  }, []);

  const setShowNewBadges = useCallback((value: boolean) => {
    setShowNewBadgesState(value);
  }, []);

  const toggleShowAvailableOnly = useCallback(() => {
    setShowAvailableOnly((v) => !v);
  }, []);

  const isFavorite = useCallback(
    (itemId: string) => favoriteIds.has(itemId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback((itemId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      persistFavoriteIds(next);
      return next;
    });
  }, []);

  const gridColumns = sizeToColumns(thumbSize);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((v) => !v);
  }, []);

  const showStatus = useCallback(
    (
      text: string,
      tone: StatusMessage["tone"] = "info",
      durationMs = 4000,
      card?: StatusMessage["card"],
    ) => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
      const display = tone === "error" ? friendlyErrorMessage(text) : text;
      setStatusMessage({ text: display, tone, card });
      statusTimer.current = setTimeout(() => setStatusMessage(null), durationMs);
    },
    [],
  );

  const clearStatus = useCallback(() => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = null;
    setStatusMessage(null);
  }, []);

  setHoveredItemNameRef.current = setHoveredItemName;
  showStatusRef.current = showStatus;

  const gridValue = useMemo<PanelGridContextValue>(
    () => ({
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
    }),
    [
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
    ],
  );

  const chromeValue = useMemo<PanelChromeContextValue>(
    () => ({
      hoveredItemName,
      statusMessage,
      clearStatus,
    }),
    [hoveredItemName, statusMessage, clearStatus],
  );

  // Stable forever — callers dispatch through refs.
  const actionsValue = useMemo<PanelActionsContextValue>(
    () => ({
      setHoveredItemName: (name) => setHoveredItemNameRef.current(name),
      showStatus: (text, tone, durationMs, card) =>
        showStatusRef.current(text, tone, durationMs, card),
    }),
    [],
  );

  return (
    <PanelActionsContext.Provider value={actionsValue}>
      <PanelChromeContext.Provider value={chromeValue}>
        <PanelGridContext.Provider value={gridValue}>
          {children}
        </PanelGridContext.Provider>
      </PanelChromeContext.Provider>
    </PanelActionsContext.Provider>
  );
}

function requireCtx<T>(ctx: T | null, name: string): T {
  if (!ctx) {
    throw new Error(`${name} must be used within PanelUIProvider`);
  }
  return ctx;
}

/** Grid playback / favorites — for PreviewCard and FootageGrid. */
export function usePanelGrid(): PanelGridContextValue {
  return requireCtx(use(PanelGridContext), "usePanelGrid");
}

/** Footer chrome — hover hint + status toast. */
export function usePanelChrome(): PanelChromeContextValue {
  return requireCtx(use(PanelChromeContext), "usePanelChrome");
}

/** Stable write-only actions (showStatus, setHoveredItemName). */
export function usePanelActions(): PanelActionsContextValue {
  return requireCtx(use(PanelActionsContext), "usePanelActions");
}

/** Merged view for footers / workspace / apps that need everything. */
export function usePanelUI(): PanelUIContextValue {
  const grid = usePanelGrid();
  const chrome = usePanelChrome();
  const actions = usePanelActions();
  return useMemo(
    () => ({ ...grid, ...chrome, ...actions }),
    [grid, chrome, actions],
  );
}
