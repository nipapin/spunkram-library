import {
  CirclePlay,
  Frame,
  LayoutGrid,
  Pause,
  Unlock,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  THUMB_SIZE_MAX,
  THUMB_SIZE_MIN,
  usePanelUI,
} from "@/lib/panel-ui-context";
import "./gal-footer.scss";

export function GalFooter() {
  const {
    playPreview,
    audioEnabled,
    previewVolume,
    thumbSize,
    gridColumns,
    hoveredItemName,
    focusMode,
    showNewBadges,
    showAvailableOnly,
    statusMessage,
    togglePlayPreview,
    toggleAudio,
    setPreviewVolume,
    setThumbSize,
    toggleFocusMode,
    setShowNewBadges,
    toggleShowAvailableOnly,
  } = usePanelUI();

  const hintText = statusMessage?.text || hoveredItemName || "";
  const hintTone = statusMessage?.tone;

  return (
    <footer className="gal-footer-bar">
      <div className="gal-footer-bar__cluster">
        <button
          type="button"
          aria-label="Auto-play"
          title="Auto-play"
          aria-pressed={playPreview}
          onClick={togglePlayPreview}
          className={
            playPreview
              ? "gal-footer-bar__btn gal-footer-bar__btn--on"
              : "gal-footer-bar__btn"
          }
        >
          {playPreview ? (
            <Pause className="size-3.5 fill-current" />
          ) : (
            <CirclePlay className="size-3.5" />
          )}
        </button>

        <div className="gal-footer-bar__volume">
          <button
            type="button"
            aria-label="Volume"
            title={audioEnabled ? `Volume: ${previewVolume}` : "Muted"}
            aria-pressed={audioEnabled}
            onClick={toggleAudio}
            className={
              audioEnabled
                ? "gal-footer-bar__btn gal-footer-bar__btn--on"
                : "gal-footer-bar__btn"
            }
          >
            {audioEnabled ? (
              <Volume2 className="size-3.5" />
            ) : (
              <VolumeX className="size-3.5" />
            )}
          </button>
          <div className="gal-footer-bar__volume-popup" aria-hidden>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={previewVolume}
              onChange={(e) => setPreviewVolume(Number(e.target.value))}
              aria-label="Audio volume"
              className="gal-footer-bar__volume-range"
            />
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={showNewBadges}
          aria-label="Toggle new items"
          title={showNewBadges ? "Hide NEW badges" : "Show NEW badges"}
          onClick={() => setShowNewBadges(!showNewBadges)}
          className={
            showNewBadges
              ? "gal-footer-bar__new gal-footer-bar__new--on"
              : "gal-footer-bar__new"
          }
        >
          New
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={showAvailableOnly}
          aria-label="Show available items only"
          title={
            showAvailableOnly
              ? "Showing available items — click to show all"
              : "Show available items only"
          }
          onClick={toggleShowAvailableOnly}
          className={
            showAvailableOnly
              ? "gal-footer-bar__btn gal-footer-bar__btn--on"
              : "gal-footer-bar__btn"
          }
        >
          <Unlock className="size-3.5" />
        </button>
      </div>

      <div
        className={
          hintText
            ? hintTone === "error"
              ? "gal-footer-bar__hint gal-footer-bar__hint--error"
              : hintTone === "success"
                ? "gal-footer-bar__hint gal-footer-bar__hint--success"
                : "gal-footer-bar__hint gal-footer-bar__hint--name"
            : "gal-footer-bar__hint"
        }
        title={hintText || undefined}
      >
        {hintText}
      </div>

      <div className="gal-footer-bar__cluster">
        <button
          type="button"
          aria-label="Full size"
          title="Hide sidebar"
          aria-pressed={focusMode}
          onClick={toggleFocusMode}
          className={
            focusMode
              ? "gal-footer-bar__btn gal-footer-bar__btn--on"
              : "gal-footer-bar__btn"
          }
        >
          <Frame className="size-3.5" />
        </button>
        <input
          type="range"
          min={THUMB_SIZE_MIN}
          max={THUMB_SIZE_MAX}
          step={1}
          value={thumbSize}
          onChange={(e) => setThumbSize(Number(e.target.value))}
          aria-label="Grid scale"
          aria-valuetext={`size ${thumbSize}, ${gridColumns} columns`}
          className="gal-footer-bar__scale"
        />
        <LayoutGrid className="gal-footer-bar__grid-icon size-3.5" aria-hidden />
      </div>
    </footer>
  );
}
