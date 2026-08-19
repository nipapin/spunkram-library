/**
 * AE `.ffx` preset apply — port of legacy `ae_preset_manager.jsx` hot path (`applyPreset` only).
 * Customizer / controlPreview / buttons remain in legacy until phase 7–8.
 */

const MARKER_NAMES = { IN: "IN", OUT: "OUT", MID: "MID" } as const;
const MARKET_DEF_SEC = 1;

type FileNameFinderGroup = {
  IN?: { prefix?: string; suffix?: string };
  OUT?: { prefix?: string; suffix?: string };
};

type MainPresetControl = {
  file: string;
  effect_name: string;
  invoke?: string;
  need_reapply?: string;
};

type InsideOptions = {
  main_preset_control?: MainPresetControl;
  file_name_finder?: FileNameFinderGroup;
};

type CustomArgs = {
  custom_args?: { layer_sets?: string };
};

type ExtraArguments = {
  filepath: string;
  name?: string;
};

const fixDeselectLayers = (selectedLayers: Layer[], curLayer?: Layer): void => {
  for (let num = 0; num < selectedLayers.length; num++) {
    selectedLayers[num].selected = curLayer ? false : true;
  }
  if (curLayer) curLayer.selected = true;
};

const layerSets = (layer: Layer, getCustomArguments: CustomArgs): void => {
  const sets = getCustomArguments.custom_args?.layer_sets;
  if (!sets) return;
  const parts = sets.split(":");
  for (let i = 0; i < parts.length; i++) {
    const current = parts[i];
    if (!current) continue;
    switch (current) {
      case "3D":
        layer.threeDLayer = true;
        break;
      case "ADJUSTMENT":
        layer.adjustmentLayer = true;
        break;
      case "COLLAPSE_TRANS":
        layer.collapseTransformation = true;
        break;
      case "MO_BLUR":
        layer.motionBlur = true;
        break;
    }
  }
};

const parseEffects = (
  method: "find" | "remove",
  layer: Layer,
  fxName: string,
): boolean => {
  const effects = layer.Effects;
  for (let fx = effects.numProperties; fx >= 1; fx--) {
    const hereEffect = effects(fx);
    if (!hereEffect) continue;
    const curFxName = hereEffect.name;
    if (method === "find" && curFxName === fxName) return true;
    if (method === "remove" && curFxName === fxName) {
      hereEffect.remove();
      return true;
    }
  }
  return false;
};

const applyMainAnimator = (
  layer: Layer,
  folderTemplatesPath: string,
  mainPreset: MainPresetControl | undefined,
): string | void => {
  if (!mainPreset) return;
  const generalFile = new File(folderTemplatesPath + "/" + mainPreset.file);
  if (!generalFile.exists) return "MISSING_PRESETS";
  const fxName = mainPreset.effect_name;
  if (mainPreset.invoke === "APPLY") {
    const findMainPresetFx = parseEffects("find", layer, fxName);
    if (!findMainPresetFx) {
      layer.applyPreset(generalFile);
    }
    if (findMainPresetFx && mainPreset.need_reapply === "3DLayer" && layer.threeDLayer === true) {
      layer.selected = false;
      layer.selected = true;
      parseEffects("remove", layer, fxName);
      layer.applyPreset(generalFile);
    }
  }
  layer.selected = false;
  layer.selected = true;
};

const checkInArrayExists = (needle: string, haystack: string[]): boolean =>
  haystack.toString().indexOf(needle) !== -1;

const markerExistsOrRemove = (
  layer: Layer,
  markerNameOrObjectNames: string | string[],
  doNotRemoveIfExists?: boolean,
  doNotTouchLengthMarker?: boolean,
): boolean => {
  const getMarkers = layer.property("Marker") as Property;
  let returnIfExistsMarker = false;
  if (getMarkers.numKeys > 0) {
    for (let i = getMarkers.numKeys; i >= 1; i--) {
      const curMarker = getMarkers.keyValue(i) as MarkerValue;
      if (!markerNameOrObjectNames || !curMarker) continue;
      const names = markerNameOrObjectNames instanceof Array
        ? markerNameOrObjectNames
        : [markerNameOrObjectNames];
      const matched =
        markerNameOrObjectNames instanceof Array
          ? checkInArrayExists(curMarker.comment, names)
          : curMarker.comment === markerNameOrObjectNames;
      if (!matched) continue;
      if (!doNotRemoveIfExists) {
        if (!(doNotTouchLengthMarker && curMarker.duration)) {
          getMarkers.removeKey(i);
        }
      } else {
        returnIfExistsMarker = true;
      }
    }
  }
  return returnIfExistsMarker;
};

const createMarkerPm = (
  currentLayer: Layer,
  markerName: string,
  markerTime: number,
  markerColor: number,
  markerWithLength?: number,
): void => {
  const thisMarker = new MarkerValue(
    markerName,
    "chapter",
    "https://aniom.net",
    "_PRESET_MANAGER",
    "Spunkram_EXTENSION_BY_ANIOM",
  );
  if (Number(app.version.match(/\d+/)) >= 16) {
    thisMarker.label = isNaN(markerColor) ? 2 : markerColor;
  }
  if (markerWithLength && Number(app.version.match(/\d+/)) >= 15) {
    thisMarker.duration = markerWithLength;
  }
  (currentLayer.property("Marker") as Property).setValueAtTime(markerTime, thisMarker);
};

const addMarkerForOut = (curLayer: Layer, comp: CompItem, customMarkerTime?: number): void => {
  const existsMarker = markerExistsOrRemove(curLayer, MARKER_NAMES.OUT, true, !!customMarkerTime);
  if (!existsMarker) {
    createMarkerPm(
      curLayer,
      MARKER_NAMES.OUT,
      customMarkerTime ? curLayer.outPoint - customMarkerTime : comp.time,
      1,
    );
  }
};

const addMarkerForIn = (curLayer: Layer, comp: CompItem, customMarkerTime?: number): void => {
  const existsMarker = markerExistsOrRemove(curLayer, MARKER_NAMES.IN, true, !!customMarkerTime);
  if (!existsMarker) {
    createMarkerPm(
      curLayer,
      MARKER_NAMES.IN,
      customMarkerTime ? curLayer.inPoint + customMarkerTime : comp.time,
      9,
    );
  }
};

/**
 * Apply `.ffx` preset(s) to selected layer(s) in the active composition.
 * Returns legacy status strings (`COMP`, `LAYER`, `MISSING_PRESETS`) or undefined on success.
 */
export const applyPreset = (
  action: string,
  _itemId: unknown,
  _instanceGroup: unknown,
  getArguments: CustomArgs,
  extraArguments: ExtraArguments,
  folderTemplates: string,
  _packName: string,
  insideOptions: InsideOptions,
): string | void => {
  const comp = app.project.activeItem;
  if (!(comp instanceof CompItem)) return "COMP";
  if (!comp.selectedLayers.length) return "LAYER";

  const getCustomArguments = getArguments || {};
  const mainFilePresetGroup = insideOptions?.main_preset_control;
  const fileNameFinderGroup = insideOptions?.file_name_finder;

  try {
    app.beginUndoGroup("Spunkram - Apply the Preset");
    const theLayers = comp.selectedLayers;
    for (let num = 0; num < theLayers.length; num++) {
      const multiCurLayer = theLayers[num];
      fixDeselectLayers(theLayers, multiCurLayer);
      layerSets(multiCurLayer, getCustomArguments);
      const mainResult = applyMainAnimator(multiCurLayer, folderTemplates, mainFilePresetGroup);
      if (mainResult === "MISSING_PRESETS") {
        app.endUndoGroup();
        return "MISSING_PRESETS";
      }

      switch (action) {
        case "APPLY": {
          const filePreset = new File(extraArguments.filepath);
          if (!filePreset.exists) {
            app.endUndoGroup();
            return "MISSING_PRESETS";
          }
          multiCurLayer.applyPreset(filePreset);
          break;
        }
        case "PM_BOTH": {
          let fileIn: string;
          let fileOut: string;
          if (fileNameFinderGroup) {
            fileIn =
              (fileNameFinderGroup.IN?.prefix || "") +
              (extraArguments.name || "") +
              (fileNameFinderGroup.IN?.suffix || "") +
              ".ffx";
            fileOut =
              (fileNameFinderGroup.OUT?.prefix || "") +
              (extraArguments.name || "") +
              (fileNameFinderGroup.OUT?.suffix || "") +
              ".ffx";
          } else {
            fileIn = ".ffx";
            fileOut = ".ffx";
          }
          const filePresetIn = new File(extraArguments.filepath + fileIn);
          const filePresetOut = new File(extraArguments.filepath + fileOut);
          if (!filePresetIn.exists || !filePresetOut.exists) {
            app.endUndoGroup();
            return "MISSING_PRESETS";
          }
          multiCurLayer.applyPreset(filePresetIn);
          addMarkerForIn(multiCurLayer, comp, MARKET_DEF_SEC);
          multiCurLayer.applyPreset(filePresetOut);
          addMarkerForOut(multiCurLayer, comp, MARKET_DEF_SEC);
          break;
        }
        case "PM_IN":
        case "PM_OUT": {
          const filePreset = new File(extraArguments.filepath);
          if (!filePreset.exists) {
            app.endUndoGroup();
            return "MISSING_PRESETS";
          }
          if (action === "PM_IN") {
            multiCurLayer.applyPreset(filePreset);
            addMarkerForIn(multiCurLayer, comp, MARKET_DEF_SEC);
          } else {
            multiCurLayer.applyPreset(filePreset);
            addMarkerForOut(multiCurLayer, comp, MARKET_DEF_SEC);
          }
          break;
        }
      }
    }

    fixDeselectLayers(theLayers);
    app.endUndoGroup();
  } catch (error: any) {
    try {
      app.endUndoGroup();
    } catch {
      // ignore
    }
    alert(error);
  }
};
