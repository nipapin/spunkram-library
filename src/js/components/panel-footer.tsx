import { Play, Music, Maximize2, Scan } from "lucide-react";
import {
  THUMB_SIZE_DEFAULT,
  THUMB_SIZE_MAX,
  THUMB_SIZE_MIN,
  usePanelUI,
} from "@/lib/panel-ui-context";
import "./panel-footer.scss";

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
    <footer className={`panel-footer ${className}`.trim()}>
      <div className="panel-footer__cluster">
        <button
          type="button"
          aria-label="Play preview"
          aria-pressed={playPreview}
          onClick={togglePlayPreview}
          className={playPreview ? "panel-footer__btn panel-footer__btn--on" : "panel-footer__btn"}
        >
          <Play className="size-4 fill-current" />
        </button>
        <button
          type="button"
          aria-label="Audio"
          aria-pressed={audioEnabled}
          onClick={toggleAudio}
          className={audioEnabled ? "panel-footer__btn panel-footer__btn--on" : "panel-footer__btn"}
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
          className={
            showNewBadges ? "panel-footer__switch panel-footer__switch--on" : "panel-footer__switch"
          }
        >
          <span className="panel-footer__switch-thumb" />
        </button>
      </div>

      <div className={hoveredItemName ? "panel-footer__hint panel-footer__hint--name" : "panel-footer__hint panel-footer__hint--empty"}>
        {hoveredItemName || "Hover a preview"}
      </div>

      <div className="panel-footer__cluster">
        <button
          type="button"
          aria-label="Fit thumbnails to default size"
          onClick={() => setThumbSize(THUMB_SIZE_DEFAULT)}
          className="panel-footer__btn"
        >
          <Scan className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Toggle focus mode"
          aria-pressed={focusMode}
          onClick={toggleFocusMode}
          className={focusMode ? "panel-footer__btn panel-footer__btn--on" : "panel-footer__btn"}
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
          className="panel-footer__range"
        />
      </div>
    </footer>
  );
}
