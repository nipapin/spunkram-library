import { cn } from "@/lib/utils";
import { usePanelUI } from "@/lib/panel-ui-context";
import { GraduationCap, Package, Search, SlidersHorizontal, Star } from "lucide-react";

const SHOW_TUTORIALS = false;

export function PanelToolbar({
  tutorialsOpen = false,
  onToggleTutorials,
  query,
  onQuery,
  packName,
  showControlsToggle = false,
  controlsOpen = false,
  onToggleControls,
  className = "",
}: {
  tutorialsOpen?: boolean;
  onToggleTutorials?: () => void;
  query: string;
  onQuery: (v: string) => void;
  packName?: string;
  showControlsToggle?: boolean;
  controlsOpen?: boolean;
  onToggleControls?: () => void;
  className?: string;
}) {
  const { showFavoritesOnly, toggleShowFavoritesOnly, setShowFavoritesOnly } = usePanelUI();
  const favoritesOn = showFavoritesOnly && !tutorialsOpen;

  function handleToggleTutorials() {
    if (!tutorialsOpen) {
      setShowFavoritesOnly(false);
    }
    onToggleTutorials?.();
  }

  function handleToggleFavorites() {
    if (tutorialsOpen) {
      onToggleTutorials?.();
      setShowFavoritesOnly(true);
      return;
    }
    toggleShowFavoritesOnly();
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-[rgb(42,36,64)] px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {showControlsToggle && (
          <button
            type="button"
            aria-label="Toggle playback controls"
            aria-pressed={controlsOpen}
            onClick={onToggleControls}
            className={cn(
              "mr-1 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
              controlsOpen
                ? "pill-brand"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="size-4" />
          </button>
        )}
        {SHOW_TUTORIALS && (
          <button
            type="button"
            aria-label="Video tutorials"
            title="Video tutorials"
            aria-pressed={tutorialsOpen}
            onClick={handleToggleTutorials}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
              tutorialsOpen
                ? "pill-brand"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <GraduationCap className="size-4" />
          </button>
        )}
        {packName ? (
          <div className="flex min-w-0 items-center gap-1.5 px-0.5" title={packName}>
            <Package className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 truncate text-xs font-semibold text-foreground">{packName}</span>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="relative w-44">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Find items"
            className="w-full rounded-full border border-[rgb(42,36,64)] bg-[rgb(14,12,26)]/50 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c4dff]/60 focus:outline-none"
          />
        </div>
        <button
          type="button"
          aria-label="Favorites"
          aria-pressed={favoritesOn}
          onClick={handleToggleFavorites}
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition-colors",
            favoritesOn
              ? "pill-brand"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          <Star
            className="size-4"
            fill={favoritesOn ? "currentColor" : "none"}
            strokeWidth={2.25}
          />
        </button>
      </div>
    </div>
  );
}
