import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import type { AppliedSegmentConfig, GroupingMode } from "../utils/transcribe";
import { rangeFillStyle } from "../utils/rangeFillStyle";
import "./ResegmentGroup.scss";

const SEG_MODES: { value: GroupingMode; label: string }[] = [
  { value: "words", label: "Words" },
  { value: "custom", label: "Custom" },
];

interface ResegmentGroupProps {
  appliedConfig: AppliedSegmentConfig | null;
  resegmenting: boolean;
  onUpdate: () => void;
}

export const ResegmentGroup = ({ appliedConfig, resegmenting, onUpdate }: ResegmentGroupProps) => {
  const [open, setOpen] = useState(true);
  const { mode, lines, characters, updateMode, updateLines, updateCharacters } = useConfiguration();

  const isApplied =
    !!appliedConfig &&
    appliedConfig.mode === mode &&
    (mode !== "custom" || (appliedConfig.lines === lines && appliedConfig.characters === characters));

  return (
    <div className="preset-fields__collapse preset-fields__collapse--depth-0">
      <button
        type="button"
        className="preset-fields__collapse-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="preset-fields__collapse-title">Re-segment</span>
        <ChevronDown
          size={14}
          className={`preset-fields__collapse-chevron ${open ? "preset-fields__collapse-chevron--open" : ""}`}
        />
      </button>
      {open && (
        <div className="preset-fields__collapse-body resegment-group">
          <div className="btn-group resegment-group__modes">
            {SEG_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`btn-group__item ${mode === m.value ? "btn-group__item--active-fill" : ""}`}
                onClick={() => updateMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode === "custom" && (
            <>
              <div className="resegment-group__row">
                <span className="resegment-group__label">Lines / caption</span>
                <input
                  type="range"
                  className="range"
                  min={1}
                  max={4}
                  value={lines}
                  onChange={(e) => updateLines(Number(e.target.value))}
                  style={rangeFillStyle(lines, 1, 4)}
                />
                <span className="resegment-group__value">{lines}</span>
              </div>
              <div className="resegment-group__row">
                <span className="resegment-group__label">Characters / line</span>
                <input
                  type="range"
                  className="range"
                  min={4}
                  max={40}
                  value={characters}
                  onChange={(e) => updateCharacters(Number(e.target.value))}
                  style={rangeFillStyle(characters, 4, 40)}
                />
                <span className="resegment-group__value">{characters}</span>
              </div>
            </>
          )}
          {!isApplied && (
            <button
              type="button"
              className="btn btn--primary btn--full resegment-group__update"
              onClick={onUpdate}
              disabled={resegmenting}
            >
              {resegmenting ? (
                <>
                  <span className="spinner" />
                  Updating…
                </>
              ) : (
                "Update"
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
