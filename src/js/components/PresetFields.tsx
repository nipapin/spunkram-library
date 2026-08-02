import { ChevronDown, CopyPlus, RotateCcw } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { StylePreset } from "../../context/ConfigurationWrapper";
import {
  ControlType,
  PRESET_DEFINITION,
  buildUiTree,
  getControlValue,
  isColorArray,
  isPointValue,
  uiName,
  type ClientControl,
  type ControlTreeNode,
  type ControlValue,
  type ControlValues,
  type MogrtDefinition,
} from "../presets";
import { rangeFillStyle } from "../utils/rangeFillStyle";
import { ScrubNumber } from "./ScrubNumber";
import { ColorField } from "./ColorField";
import "./PresetFields.scss";

interface PresetFieldsProps {
  value: StylePreset;
  /** Definition пакета стиля; fallback — bundled reference. */
  definition?: MogrtDefinition;
  onChange: (patch: Partial<StylePreset>, opts?: { coalesceKey?: string }) => void;
  dirty?: boolean;
  /** Имя можно менять только после правок параметров пресета */
  nameEditable?: boolean;
  onSaveAsNew?: () => void;
  onReset?: () => void;
}

const Collapse = ({
  title,
  depth,
  defaultOpen = true,
  children,
}: {
  title: string;
  depth: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`preset-fields__collapse preset-fields__collapse--depth-${Math.min(depth, 3)}`}>
      <button
        type="button"
        className="preset-fields__collapse-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="preset-fields__collapse-title">{title}</span>
        <ChevronDown
          size={14}
          className={`preset-fields__collapse-chevron ${open ? "preset-fields__collapse-chevron--open" : ""}`}
        />
      </button>
      {open && <div className="preset-fields__collapse-body">{children}</div>}
    </div>
  );
};

const ControlField = ({
  control,
  values,
  onValue,
}: {
  control: ClientControl;
  values: ControlValues;
  onValue: (id: string, value: ControlValue) => void;
}) => {
  const raw = getControlValue(values, control);
  const label = uiName(control);

  if (control.type === ControlType.Checkbox) {
    const checked = raw === true || raw === 1;
    return (
      <div className="preset-fields__param preset-fields__param--toggle">
        <span className="preset-fields__param-label">{label}</span>
        <label className="toggle">
          <input
            type="checkbox"
            checked={!!checked}
            onChange={(e) => onValue(control.id, e.target.checked)}
          />
          <span className="toggle__track" />
          <span className="toggle__thumb" />
        </label>
      </div>
    );
  }

  if (control.type === ControlType.Color && isColorArray(raw)) {
    return (
      <div className="preset-fields__param">
        <span className="preset-fields__param-label">{label}</span>
        <div className="preset-fields__param-controls">
          <ColorField rgba={raw} onChange={(next) => onValue(control.id, next)} />
        </div>
      </div>
    );
  }

  if (control.type === ControlType.Point && isPointValue(raw)) {
    return (
      <div className="preset-fields__param preset-fields__param--stack">
        <span className="preset-fields__param-label">{label}</span>
        <div className="preset-fields__point">
          {(["x", "y"] as const).map((axis) => (
            <label key={axis} className="preset-fields__point-axis">
              <span>{axis.toUpperCase()}</span>
              <ScrubNumber
                value={raw[axis]}
                onChange={(n) => onValue(control.id, { ...raw, [axis]: n })}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (control.type === ControlType.Slider) {
    const num = typeof raw === "number" ? raw : Number(raw) || 0;
    const min = typeof control.min === "number" ? control.min : 0;
    const max = typeof control.max === "number" ? control.max : 100;
    const span = Math.max(0.0001, max - min);
    const step = span <= 10 ? 0.1 : span <= 100 ? 0.5 : 1;

    return (
      <div className="field-row preset-fields__slider-row">
        <span className="field-row__label preset-fields__param-label">{label}</span>
        <input
          type="range"
          className="range"
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, num))}
          onChange={(e) => onValue(control.id, Number(e.target.value))}
          style={rangeFillStyle(Math.min(max, Math.max(min, num)), min, max)}
        />
        <ScrubNumber value={num} onChange={(n) => onValue(control.id, n)} min={min} max={max} step={step} />
      </div>
    );
  }

  // Text (type 6) и прочее — в UI не показываем (System уже отфильтрован)
  return null;
};

const renderNodes = (
  nodes: ControlTreeNode[],
  depth: number,
  values: ControlValues,
  onValue: (id: string, value: ControlValue) => void,
): ReactNode =>
  nodes.map((node) => {
    if (node.kind === "group") {
      const name = uiName(node.control);
      const defaultOpen = node.control.groupexpanded ?? depth < 2;
      return (
        <Collapse key={node.control.id} title={name} depth={depth} defaultOpen={defaultOpen}>
          {renderNodes(node.children, depth + 1, values, onValue)}
        </Collapse>
      );
    }
    return <ControlField key={node.control.id} control={node.control} values={values} onValue={onValue} />;
  });

export const PresetFields = ({
  value: p,
  definition = PRESET_DEFINITION,
  onChange,
  dirty,
  nameEditable,
  onSaveAsNew,
  onReset,
}: PresetFieldsProps) => {
  const tree = useMemo(() => buildUiTree(definition), [definition]);

  const setValue = (id: string, next: ControlValue) => {
    // один жест слайдера/scrub = один Ctrl+Z
    onChange({ values: { ...p.values, [id]: next } }, { coalesceKey: id });
  };

  return (
    <div className="preset-fields">
      <div className="preset-fields__name-row">
        <input
          className="preset-fields__name"
          value={p.name}
          disabled={!nameEditable}
          onChange={(e) => onChange({ name: e.target.value }, { coalesceKey: "name" })}
          aria-label="Preset name"
          title={nameEditable ? undefined : "Change preset settings to rename"}
        />
        {dirty && (
          <div className="preset-fields__name-actions">
            {onReset && (
              <button
                type="button"
                className="btn preset-fields__reset"
                onClick={onReset}
                data-tooltip="Reset to default"
                aria-label="Reset to default"
              >
                <RotateCcw size={13} />
                Reset
              </button>
            )}
            {onSaveAsNew && (
              <button type="button" className="btn preset-fields__save-as" onClick={onSaveAsNew}>
                <CopyPlus size={13} />
                Save as New
              </button>
            )}
          </div>
        )}
      </div>

      <div className="preset-fields__params">{renderNodes(tree, 0, p.values, setValue)}</div>
    </div>
  );
};
