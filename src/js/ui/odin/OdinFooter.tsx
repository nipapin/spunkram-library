import {
  SquarePlay,
  SquarePause,
  Music2,
  VolumeX,
  AudioLines,
  ToggleRight,
} from "lucide-react";
import { useRef } from "react";
import {
  THUMB_SIZE_MIN,
  THUMB_SIZE_MAX,
  usePanelUI,
} from "@/lib/panel-ui-context";

export function OdinFooter() {
  const ui = usePanelUI();
  const lastVolume = useRef(ui.previewVolume || 50);
  const mute = () => {
    if (ui.previewVolume) {
      lastVolume.current = ui.previewVolume;
      ui.setPreviewVolume(0);
    } else ui.setPreviewVolume(lastVolume.current);
  };
  return (
    <footer className="odin-footer">
      <div className="odin-footer__group">
        <button
          type="button"
          aria-label="Auto-play"
          data-tooltip="Auto-play"
          aria-pressed={ui.playPreview}
          onClick={ui.togglePlayPreview}
        >
          {ui.playPreview ? (
            <SquarePause size={16} />
          ) : (
            <SquarePlay size={16} />
          )}
        </button>
        <div className="odin-footer__volume">
          <button
            type="button"
            aria-label="Mute preview volume"
            data-tooltip="Audio Volume"
            aria-pressed={ui.previewVolume === 0}
            onClick={mute}
          >
            {ui.previewVolume ? <Music2 size={16} /> : <VolumeX size={16} />}
          </button>
          <div className="odin-footer__volume-popup">
            <input
              aria-label="Audio volume"
              type="range"
              min={0}
              max={100}
              value={ui.previewVolume}
              onChange={(e) => ui.setPreviewVolume(Number(e.target.value))}
            />
          </div>
        </div>
        <button
          type="button"
          aria-label="Toggle new items"
          data-tooltip="Toggle new items notify"
          aria-pressed={ui.showNewBadges}
          onClick={() => ui.setShowNewBadges(!ui.showNewBadges)}
        >
          <ToggleRight size={16} />
        </button>
        <button
          type="button"
          aria-label="Enable Sound FX"
          data-tooltip="Enable Sound FX"
          aria-pressed={ui.audioEnabled}
          onClick={ui.toggleAudio}
        >
          <AudioLines size={16} />
        </button>
      </div>
      <span
        className="odin-footer__hint"
        title={ui.hoveredItemName || undefined}
      >
        {ui.hoveredItemName}
      </span>
      <div className="odin-footer__group odin-footer__zoom">
        <span aria-hidden="true">−</span>
        <input
          type="range"
          aria-label="Preview size"
          min={THUMB_SIZE_MIN}
          max={THUMB_SIZE_MAX}
          step={1}
          value={ui.thumbSize}
          onChange={(e) => ui.setThumbSize(Number(e.target.value))}
        />
        <span aria-hidden="true">+</span>
      </div>
    </footer>
  );
}
