import { findControlByAnyNames } from "./clientControls";
import type { MogrtDefinition } from "./types";

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
  findControlByAnyNames,
  fontIdFromValue,
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
export {
  CONTROLS_FILE,
  controlsToDefinition,
  isControlsDocument,
  normalizeDefinition,
} from "./controlsSchema";
export type { ControlsDocument } from "./controlsSchema";

export const colorControlIds = (definition: MogrtDefinition) => {
  const idByPath = (...paths: string[][]) => findControlByAnyNames(definition, paths)?.id ?? "";
  return {
    fill: idByPath(["Static", "Fill"]),
    highlight: idByPath(["Animated Text", "Fill"]),
    background: idByPath(
      ["Segment Settings", "Background", "Fill"],
      ["Follow", "Background", "Fill"],
    ),
  };
};
