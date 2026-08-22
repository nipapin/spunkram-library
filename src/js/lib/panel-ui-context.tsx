import {
  createContext,
  useCallback,
  useContext,
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
export const THUMB_SIZE_MAX = 5;
export const THUMB_SIZE_DEFAULT = 3;

const FAVORITES_STORAGE_KEY = storageKey("favorites");
const UI_STATE_KEY = storageKey("uiState");
/** Legacy key — migrated into UI_STATE_KEY once. */
const LEGACY_SHOW_NEW_BADGES_KEY = "spunkram.showNewBadges";

type PersistedUiState = {
  playPreview: boolean;
  audioEnabled: boolean;
  thumbSize: number;
  focusMode: boolean;
  showNewBadges: boolean;
};

const UI_DEFAULTS: PersistedUiState = {
  playPreview: false,
  audioEnabled: true,
  thumbSize: THUMB_SIZE_DEFAULT,
  focusMode: false,
  showNewBadges: true,
};

function clampThumbSize(size: number): number {
  return Math.min(THUMB_SIZE_MAX, Math.max(THUMB_SIZE_MIN, Math.round(size)));
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

type PanelUIContextValue = {
  playPreview: boolean;
  audioEnabled: boolean;
  thumbSize: number;
  gridColumns: number;
  hoveredItemName: string | null;
  showFavoritesOnly: boolean;
  /** When false, hides NEW chips in sidebar + grid (pack still marks items as new). */
  showNewBadges: boolean;
  favoriteIds: ReadonlySet<string>;
  togglePlayPreview: () => void;
  toggleAudio: () => void;
  setThumbSize: (size: number) => void;
  setHoveredItemName: (name: string | null) => void;
  toggleShowFavoritesOnly: () => void;
  setShowFavoritesOnly: (value: boolean) => void;
  setShowNewBadges: (value: boolean) => void;
  isFavorite: (itemId: string) => boolean;
  toggleFavorite: (itemId: string) => void;
  /** Distraction-free mode — hides the sidebar so the grid fills the panel. */
  focusMode: boolean;
  toggleFocusMode: () => void;
  /** Item id currently being applied to the host (drives a spinner overlay). */
  applyingItemId: string | null;
  setApplyingItemId: (itemId: string | null) => void;
  statusMessage: StatusMessage | null;
  showStatus: (
    text: string,
    tone?: StatusMessage["tone"],
    durationMs?: number,
    card?: StatusMessage["card"],
  ) => void;
  clearStatus: () => void;
};

/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const PANEL_UI_CONTEXT_KEY = "__spunkram_panel_ui_context__";
type PanelUIGlobal = typeof globalThis & {
  [PANEL_UI_CONTEXT_KEY]?: ReturnType<typeof createContext<PanelUIContextValue | null>>;
};

const PanelUIContext =
  (globalThis as PanelUIGlobal)[PANEL_UI_CONTEXT_KEY] ??
  createContext<PanelUIContextValue | null>(null);
(globalThis as PanelUIGlobal)[PANEL_UI_CONTEXT_KEY] = PanelUIContext;

function sizeToColumns(size: number): number {
  return THUMB_SIZE_MAX + THUMB_SIZE_MIN - size;
}

export function PanelUIProvider({ children }: { children: ReactNode }) {
  const initial = useRef(loadUiState()).current;
  const [playPreview, setPlayPreview] = useState(initial.playPreview);
  const [audioEnabled, setAudioEnabled] = useState(initial.audioEnabled);
  const [thumbSize, setThumbSizeState] = useState(initial.thumbSize);
  const [hoveredItemName, setHoveredItemNameState] = useState<string | null>(
    null,
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showNewBadges, setShowNewBadgesState] = useState(initial.showNewBadges);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(loadFavoriteIds);
  const [focusMode, setFocusMode] = useState(initial.focusMode);
  const [applyingItemId, setApplyingItemId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    persistUiState({
      playPreview,
      audioEnabled,
      thumbSize,
      focusMode,
      showNewBadges,
    });
  }, [playPreview, audioEnabled, thumbSize, focusMode, showNewBadges]);

  const togglePlayPreview = useCallback(() => {
    setPlayPreview((v) => !v);
  }, []);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((v) => !v);
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

  const value = useMemo(
    () => ({
      playPreview,
      audioEnabled,
      thumbSize,
      gridColumns,
      hoveredItemName,
      showFavoritesOnly,
      showNewBadges,
      favoriteIds,
      togglePlayPreview,
      toggleAudio,
      setThumbSize,
      setHoveredItemName,
      toggleShowFavoritesOnly,
      setShowFavoritesOnly,
      setShowNewBadges,
      isFavorite,
      toggleFavorite,
      focusMode,
      toggleFocusMode,
      applyingItemId,
      setApplyingItemId,
      statusMessage,
      showStatus,
      clearStatus,
    }),
    [
      playPreview,
      audioEnabled,
      thumbSize,
      gridColumns,
      hoveredItemName,
      showFavoritesOnly,
      showNewBadges,
      favoriteIds,
      togglePlayPreview,
      toggleAudio,
      setThumbSize,
      setHoveredItemName,
      toggleShowFavoritesOnly,
      setShowNewBadges,
      isFavorite,
      toggleFavorite,
      focusMode,
      toggleFocusMode,
      applyingItemId,
      statusMessage,
      showStatus,
      clearStatus,
    ],
  );

  return (
    <PanelUIContext.Provider value={value}>{children}</PanelUIContext.Provider>
  );
}

export function usePanelUI() {
  const ctx = useContext(PanelUIContext);
  if (!ctx) {
    throw new Error("usePanelUI must be used within PanelUIProvider");
  }
  return ctx;
}
