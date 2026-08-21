import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { PresetGrid } from "./PresetGrid";
import "./ChangePresetDialog.scss";

export const ChangePresetDialog = ({
  open,
  currentId,
  currentName,
  onClose,
}: {
  open: boolean;
  currentId: string;
  currentName: string;
  onClose: () => void;
}) => {
  const { selectPreset } = useConfiguration();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="change-preset-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-preset-title"
      onMouseDown={onClose}
    >
      <div className="change-preset-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="change-preset-dialog__head">
          <div>
            <p id="change-preset-title" className="change-preset-dialog__title">
              Change Preset
            </p>
            <p className="change-preset-dialog__hint">
              Edits to {currentName || "the current preset"} stay on that style.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <PresetGrid
          variant="picker"
          excludeId={currentId}
          onSelect={(id) => {
            selectPreset(id);
            onClose();
          }}
        />
      </div>
    </div>,
    document.body,
  );
};
