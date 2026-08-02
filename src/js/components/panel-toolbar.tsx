import { cn } from "@/lib/utils";
import { usePanelUI } from "@/lib/panel-ui-context";
import { GraduationCap, Search, SlidersHorizontal, Star } from "lucide-react";

export function PanelToolbar({
  tutorialsOpen = false,
  onToggleTutorials,
  query,
  onQuery,
  showControlsToggle = false,
  controlsOpen = false,
  onToggleControls,
  className = "border-b border-white/5",
}: {
  tutorialsOpen?: boolean;
  onToggleTutorials?: () => void;
  query: string;
  onQuery: (v: string) => void;
  showControlsToggle?: boolean;
  controlsOpen?: boolean;
  onToggleControls?: () => void;
  className?: string;
}) {
  const { showFavoritesOnly, toggleShowFavoritesOnly } = usePanelUI();

  return (
    <div className={cn("flex items-center justify-between gap-2 px-2.5 py-2", className)}>
      <div className="flex items-center gap-1">
        {showControlsToggle && (
          <button
            type="button"
            aria-label="Toggle playback controls"
            aria-pressed={controlsOpen}
            onClick={onToggleControls}
            className={cn(
              "mr-1 flex size-8 items-center justify-center rounded-md transition-colors",
              controlsOpen
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Video tutorials"
          title="Video tutorials"
          aria-pressed={tutorialsOpen}
          onClick={onToggleTutorials}
          className={cn(
            "flex size-8 items-center justify-center rounded-md transition-colors",
            tutorialsOpen
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          <GraduationCap className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Favorites"
          aria-pressed={showFavoritesOnly}
          onClick={toggleShowFavoritesOnly}
          className={cn(
            "flex size-8 items-center justify-center rounded-md transition-colors",
            showFavoritesOnly
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          <Star
            className="size-4"
            fill={showFavoritesOnly ? "currentColor" : "none"}
            strokeWidth={2.25}
          />
        </button>
      </div>

      <div className="relative w-44">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Find items"
          className="w-full rounded-full border border-white/10 bg-card/70 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
        />
      </div>
    </div>
  );
}
