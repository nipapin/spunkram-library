import {
  CirclePlay,
  Grid2x2,
  Grid3x3,
  Pause,
  Square,
  Unlock,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import {
  THUMB_SIZE_MAX,
  THUMB_SIZE_MIN,
  usePanelUI,
} from "@/lib/panel-ui-context";
import "./gal-footer.scss";

const SCALE_BUTTONS: Array<{
  size: number;
  label: string;
  Icon: LucideIcon;
}> = [
  { size: 1, label: "3 columns", Icon: Grid3x3 },
  { size: 2, label: "2 columns", Icon: Grid2x2 },
  { size: 3, label: "1 column", Icon: Square },
];

export function GalFooter() {
  const {
    playPreview,
    audioEnabled,
    previewVolume,
    thumbSize,
    gridColumns,
    hoveredItemName,
    showNewBadges,
    showAvailableOnly,
    statusMessage,
    togglePlayPreview,
    toggleAudio,
    setPreviewVolume,
    setThumbSize,
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

      <div
        className="gal-footer-bar__cluster gal-footer-bar__scale"
        role="radiogroup"
        aria-label="Grid scale"
        aria-valuetext={`${gridColumns} columns`}
      >
        {SCALE_BUTTONS.filter(
          (d) => d.size >= THUMB_SIZE_MIN && d.size <= THUMB_SIZE_MAX,
        ).map(({ size, label, Icon }) => (
          <button
            key={size}
            type="button"
            role="radio"
            aria-checked={thumbSize === size}
            aria-label={label}
            title={label}
            className={
              thumbSize === size
                ? "gal-footer-bar__btn gal-footer-bar__btn--on"
                : "gal-footer-bar__btn"
            }
            onClick={() => setThumbSize(size)}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        ))}
      </div>
    </footer>
  );
}
