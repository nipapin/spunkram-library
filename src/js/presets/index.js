import { findControlByAnyNames } from "./clientControls";
export { ControlType } from "./types";
export { buildUiTree, catalogApplyValues, defaultsFromDefinition, findControlByNames, findControlByAnyNames, findControlBySource, fontIdFromValue, findFontControl, isFontControl, getControlValue, indexControls, isColorArray, isGroup, isHiddenUiGroup, isPointValue, matchControlForInit, stylePropsFromInit, stylePropsFromValues, diffStyleProps, withCatalogApplyValues, withInitApplyValues, uiName, CATALOG_LAYOUT_OVERRIDES, } from "./clientControls";
export { hexToRgba, rgbaToHex } from "./color";
export { buildUserControlsDocument, definitionCacheKey, isChunkOrSystemInitName, mergeInitWithValues, } from "./userControls";
export { CONTROLS_FILE, controlsToDefinition, isControlsDocument, normalizeDefinition, sourceToEssentialName, sourceToNestedPath, } from "./controlsSchema";
export const colorControlIds = (definition) => {
    const idByPath = (...paths) => findControlByAnyNames(definition, paths)?.id ?? "";
    return {
        fill: idByPath(["Segment Static", "Fill"], ["Static", "Fill"]),
        highlight: idByPath(["Animated Text", "Fill"]),
        background: idByPath(["Segment Background", "Fill"], ["Follow Background", "Fill"], ["Segment Settings", "Background", "Fill"], ["Follow", "Background", "Fill"]),
    };
};
