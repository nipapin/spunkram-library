import { Play, Music, Maximize2, Scan } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  THUMB_SIZE_DEFAULT,
  THUMB_SIZE_MAX,
  THUMB_SIZE_MIN,
  usePanelUI,
} from "@/lib/panel-ui-context";

export function PanelFooter({ className = "" }: { className?: string }) {
  const {
    playPreview,
    audioEnabled,
    thumbSize,
    gridColumns,
    hoveredItemName,
    focusMode,
    showNewBadges,
    togglePlayPreview,
    toggleAudio,
    setThumbSize,
    toggleFocusMode,
    setShowNewBadges,
  } = usePanelUI();

  return (
    <footer
      className={`flex items-center gap-3 border-t border-white/5 px-3 py-2 ${className}`}
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Play preview"
          aria-pressed={playPreview}
          onClick={togglePlayPreview}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition-colors",
            playPreview
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <Play className="size-4 fill-current" />
        </button>
        <button
          type="button"
          aria-label="Audio"
          aria-pressed={audioEnabled}
          onClick={toggleAudio}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition-colors",
            audioEnabled
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <Music className="size-4" />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={showNewBadges}
          aria-label="Show NEW badges"
          title={showNewBadges ? "Hide NEW badges" : "Show NEW badges"}
          onClick={() => setShowNewBadges(!showNewBadges)}
          className={cn(
            "relative ml-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
            showNewBadges ? "bg-primary" : "bg-secondary",
          )}
        >
          <span
            className={cn(
              "pointer-events-none block size-3 rounded-full bg-background shadow transition-transform",
              showNewBadges ? "translate-x-3.5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      <div className="min-w-0 flex-1 truncate px-1 text-center text-[11px] text-muted-foreground">
        {hoveredItemName ? (
          <span className="text-foreground/90">{hoveredItemName}</span>
        ) : (
          <span className="opacity-40">Hover a preview</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="Fit thumbnails to default size"
          onClick={() => setThumbSize(THUMB_SIZE_DEFAULT)}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Scan className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Toggle focus mode"
          aria-pressed={focusMode}
          onClick={toggleFocusMode}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition-colors",
            focusMode
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <Maximize2 className="size-4" />
        </button>
        <input
          type="range"
          min={THUMB_SIZE_MIN}
          max={THUMB_SIZE_MAX}
          step={1}
          value={thumbSize}
          onChange={(e) => setThumbSize(Number(e.target.value))}
          aria-label="Thumbnail size"
          aria-valuetext={`size ${thumbSize}, ${gridColumns} columns`}
          className="thumb-size-range h-1 w-24 cursor-pointer appearance-none rounded-full bg-secondary"
        />
      </div>
    </footer>
  );
}
