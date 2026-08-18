/** Сырой clientControl из MOGRT definition.json — без предобработки файла. */

export type LocalizedStr = { strDB: { localeString: string; str: string }[] };

export type PointValue = { x: number; y: number };

/** Значение контрола (не группы). Ключ в preset.values — control.id (UUID). */
export type ControlValue = boolean | number | number[] | PointValue | LocalizedStr | string;

export const ControlType = {
  Checkbox: 1,
  Slider: 2,
  Angle: 3,
  Color: 4,
  Point: 5,
  Text: 6,
  Group: 10,
  Menu: 13,
} as const;

export interface ClientControl {
  id: string;
  type: number;
  canAnimate?: boolean;
  uiName: LocalizedStr;
  uiSuffix?: LocalizedStr;
  uiToolTip?: LocalizedStr;
  value: ControlValue | string[];
  min?: number;
  max?: number;
  groupexpanded?: boolean;
  /** Dropdown options (type 13) — порядок = 1-based value. */
  menucontent?: LocalizedStr[];
  fonteditinfo?: unknown;
  alternateRectInfo?: unknown;
}

export interface MogrtDefinition {
  capsuleName?: string;
  clientControls: ClientControl[];
  [key: string]: unknown;
}

export type ControlValues = Record<string, ControlValue>;

export type ControlTreeNode =
  | { kind: "group"; control: ClientControl; children: ControlTreeNode[] }
  | { kind: "control"; control: ClientControl };

/** Порядок UI из AE Essential Properties. Definition даёт типы/id, не индекс. */
export type UiOrderNode = {
  name: string;
  children?: UiOrderNode[];
};
