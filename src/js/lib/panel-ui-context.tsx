import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export const THUMB_SIZE_MIN = 1;
export const THUMB_SIZE_MAX = 5;
export const THUMB_SIZE_DEFAULT = 3;

const FAVORITES_STORAGE_KEY = "spunkram.favorites";

function loadFavoriteIds(): Set<string> {
  try {
    if (typeof localStorage === "undefined") return new Set();
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
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
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // CEP / private mode may block storage
  }
}

export type StatusMessage = { text: string; tone: "info" | "success" | "error" };

type PanelUIContextValue = {
  playPreview: boolean;
  audioEnabled: boolean;
  thumbSize: number;
  gridColumns: number;
  hoveredItemName: string | null;
  showFavoritesOnly: boolean;
  favoriteIds: ReadonlySet<string>;
  togglePlayPreview: () => void;
  toggleAudio: () => void;
  setThumbSize: (size: number) => void;
  setHoveredItemName: (name: string | null) => void;
  toggleShowFavoritesOnly: () => void;
  isFavorite: (itemId: string) => boolean;
  toggleFavorite: (itemId: string) => void;
  /** Distraction-free mode — hides the sidebar so the grid fills the panel. */
  focusMode: boolean;
  toggleFocusMode: () => void;
  /** Item id currently being applied to the host (drives a spinner overlay). */
  applyingItemId: string | null;
  setApplyingItemId: (itemId: string | null) => void;
  statusMessage: StatusMessage | null;
  showStatus: (text: string, tone?: StatusMessage["tone"], durationMs?: number) => void;
};

const PanelUIContext = createContext<PanelUIContextValue | null>(null);

function sizeToColumns(size: number): number {
  return THUMB_SIZE_MAX + THUMB_SIZE_MIN - size;
}

export function PanelUIProvider({ children }: { children: ReactNode }) {
  const [playPreview, setPlayPreview] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [thumbSize, setThumbSizeState] = useState(THUMB_SIZE_DEFAULT);
  const [hoveredItemName, setHoveredItemNameState] = useState<string | null>(
    null,
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(loadFavoriteIds);
  const [focusMode, setFocusMode] = useState(false);
  const [applyingItemId, setApplyingItemId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const togglePlayPreview = useCallback(() => {
    setPlayPreview((v) => !v);
  }, []);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((v) => !v);
  }, []);

  const setThumbSize = useCallback((size: number) => {
    setThumbSizeState(
      Math.min(THUMB_SIZE_MAX, Math.max(THUMB_SIZE_MIN, Math.round(size))),
    );
  }, []);

  const setHoveredItemName = useCallback((name: string | null) => {
    setHoveredItemNameState(name);
  }, []);

  const toggleShowFavoritesOnly = useCallback(() => {
    setShowFavoritesOnly((v) => !v);
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
    (text: string, tone: StatusMessage["tone"] = "info", durationMs = 4000) => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
      setStatusMessage({ text, tone });
      statusTimer.current = setTimeout(() => setStatusMessage(null), durationMs);
    },
    [],
  );

  const value = useMemo(
    () => ({
      playPreview,
      audioEnabled,
      thumbSize,
      gridColumns,
      hoveredItemName,
      showFavoritesOnly,
      favoriteIds,
      togglePlayPreview,
      toggleAudio,
      setThumbSize,
      setHoveredItemName,
      toggleShowFavoritesOnly,
      isFavorite,
      toggleFavorite,
      focusMode,
      toggleFocusMode,
      applyingItemId,
      setApplyingItemId,
      statusMessage,
      showStatus,
    }),
    [
      playPreview,
      audioEnabled,
      thumbSize,
      gridColumns,
      hoveredItemName,
      showFavoritesOnly,
      favoriteIds,
      togglePlayPreview,
      toggleAudio,
      setThumbSize,
      setHoveredItemName,
      toggleShowFavoritesOnly,
      isFavorite,
      toggleFavorite,
      focusMode,
      toggleFocusMode,
      applyingItemId,
      statusMessage,
      showStatus,
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
