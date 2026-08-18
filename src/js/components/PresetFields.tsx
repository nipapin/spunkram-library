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
import { CEP_WRITTEN_SYSTEM_NAMES } from "../../shared/caption-system";
import { rangeFillStyle } from "../utils/rangeFillStyle";
import { ScrubNumber } from "./ScrubNumber";
import { ColorField } from "./ColorField";
import "./PresetFields.scss";

const localizedText = (value: ControlValue): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "strDB" in value) {
    const db = (value as { strDB?: { str?: string }[] }).strDB;
    return db?.[0]?.str ?? "";
  }
  return "";
};

const withLocalizedText = (previous: ControlValue, text: string): ControlValue => {
  if (previous && typeof previous === "object" && "strDB" in previous) {
    const db = (previous as { strDB: { localeString: string; str: string }[] }).strDB;
    return { strDB: db.map((e, i) => (i === 0 ? { ...e, str: text } : e)) };
  }
  return { strDB: [{ localeString: "en_US", str: text }] };
};

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

const menuOptionLabel = (entry: { strDB: { localeString: string; str: string }[] }, locale = "en_US") =>
  entry.strDB?.find((e) => e.localeString === locale)?.str ?? entry.strDB?.[0]?.str ?? "";

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
      <div className="preset-fields__param preset-fields__param--point">
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

  if (control.type === ControlType.Menu && control.menucontent?.length) {
    const options = control.menucontent;
    // AE / MOGRT dropdown: 1-based index into menucontent
    const selected = typeof raw === "number" ? raw : Number(raw) || 1;
    return (
      <div className="preset-fields__param">
        <span className="preset-fields__param-label">{label}</span>
        <select
          className="preset-fields__select"
          value={selected}
          onChange={(e) => onValue(control.id, Number(e.target.value))}
        >
          {options.map((opt, i) => {
            const index = i + 1;
            return (
              <option key={index} value={index}>
                {menuOptionLabel(opt)}
              </option>
            );
          })}
        </select>
      </div>
    );
  }

  if (control.type === ControlType.Slider || control.type === ControlType.Angle) {
    const num = typeof raw === "number" ? raw : Number(raw) || 0;
    const hasRange = typeof control.min === "number" && typeof control.max === "number";
    const min = hasRange ? (control.min as number) : control.type === ControlType.Angle ? -360 : 0;
    const max = hasRange ? (control.max as number) : control.type === ControlType.Angle ? 360 : 100;
    const span = Math.max(0.0001, max - min);
    const step = span <= 1 ? 0.01 : span <= 10 ? 0.1 : span <= 100 ? 0.5 : 1;

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

  if (control.type === ControlType.Text) {
    if ((CEP_WRITTEN_SYSTEM_NAMES as readonly string[]).includes(label)) return null;
    const text = localizedText(raw);
    return (
      <div className="preset-fields__param">
        <span className="preset-fields__param-label">{label}</span>
        <input
          className="preset-fields__select"
          value={text}
          onChange={(e) => onValue(control.id, withLocalizedText(raw, e.target.value))}
        />
      </div>
    );
  }

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
      return (
        <Collapse key={node.control.id} title={name} depth={depth} defaultOpen>
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

      <div className="preset-fields__params">
        {renderNodes(tree, 0, p.values, setValue)}
      </div>
    </div>
  );
};
