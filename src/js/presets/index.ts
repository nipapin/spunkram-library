import definitionJson from "./definition.json";
import { defaultsFromDefinition, findControlByAnyNames } from "./clientControls";
import type { ControlValues, MogrtDefinition } from "./types";

export type {
  ClientControl,
  ControlTreeNode,
  ControlValue,
  ControlValues,
  MogrtDefinition,
  PointValue,
  UiOrderNode,
} from "./types";
export { ControlType } from "./types";
export {
  PRESET_UI_ORDER,
  buildUiTree,
  defaultsFromDefinition,
  findControlByNames,
  findControlByAnyNames,
  getControlValue,
  indexControls,
  isColorArray,
  isGroup,
  isHiddenUiGroup,
  isPointValue,
  stylePropsFromValues,
  diffStyleProps,
  uiName,
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
  const idByPath = (...paths: string[][]) => findControlByAnyNames(definition, paths)?.id ?? "";
  return {
    fill: idByPath(["Static Segment", "Fill"], ["Segment Static", "Fill"]),
    highlight: idByPath(["Animated Segment", "Fill"], ["Segment Animated", "Fill"]),
    background: idByPath(["Background", "Fill"]),
  };
};

/** @deprecated используйте colorControlIds(definition) — UUID зависят от пакета стиля. */
export const PRESET_CONTROL_IDS = colorControlIds(PRESET_DEFINITION);
