import definitionJson from "./definition.json";
import { defaultsFromDefinition, findControlByNames } from "./clientControls";
import type { ControlValues, MogrtDefinition } from "./types";

export type {
  ClientControl,
  ControlTreeNode,
  ControlValue,
  ControlValues,
  MogrtDefinition,
  PointValue,
} from "./types";
export { ControlType } from "./types";
export {
  buildUiTree,
  defaultsFromDefinition,
  findControlByNames,
  getControlValue,
  getStylesTrailingControls,
  indexControls,
  isColorArray,
  isGroup,
  isPointValue,
  stylePropsFromValues,
  uiName,
  STYLES_TRAILING_SYSTEM_NAMES,
} from "./clientControls";
export type { StylePropPayload } from "./clientControls";
export { hexToRgba, rgbaToHex } from "./color";

/**
 * Bundled reference definition (формат MOGRT).
 * Рабочие стили приходят с сервера / AppData — см. `src/js/styles`.
 */
export const PRESET_DEFINITION = definitionJson as MogrtDefinition;

export const createDefaultValues = (
  overrides?: ControlValues,
  definition: MogrtDefinition = PRESET_DEFINITION,
): ControlValues => ({
  ...defaultsFromDefinition(definition),
  ...overrides,
});

/** UUID известных цветов для превью (по конкретному definition). */
export const colorControlIds = (definition: MogrtDefinition = PRESET_DEFINITION) => {
  const idByPath = (names: string[]) => findControlByNames(definition, names)?.id ?? "";
  return {
    fill: idByPath(["Segment Static", "Fill"]),
    highlight: idByPath(["Segment Animated", "Fill"]),
    background: idByPath(["Background", "Fill"]),
  };
};

/** @deprecated используйте colorControlIds(definition) — UUID зависят от пакета стиля. */
export const PRESET_CONTROL_IDS = colorControlIds(PRESET_DEFINITION);
