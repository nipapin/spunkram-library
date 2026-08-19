import "./aeft-text-arabic";
export { importMedia, importVoiceoverAudio } from "./aeft-import-media";
export { importExternalAsset } from "./aeft-import-external";
export { applyPackItem } from "./aeft-apply-item";
import { applyPackItem } from "./aeft-apply-item";
export {
  bindPack,
  setEngine,
  getPackContext,
  getEngine,
  mfCopyPackage,
  mfDeletePackage,
  createComp,
  createText,
  addResponsiveBackground,
  legacyAeCall,
} from "./aeft-sdk";
/** PPRO-only stubs so Scripts intersection typing still works for evalTS. */
export const addMogrt = (_opts: unknown) => ({
  ok: false as const,
  reason: "AE_ONLY_HOST",
});
export const importSequence = (_payload: unknown) => ({
  ok: false as const,
  reason: "AE_ONLY_HOST",
});
export const importFootage = (_payload: unknown) => ({
  ok: false as const,
  reason: "AE_ONLY_HOST",
});
export const importAudio = (_payload: unknown) => ({
  ok: false as const,
  reason: "AE_ONLY_HOST",
});
export const undoGroupStart = () => ({ ok: false, status: "AE_ONLY_HOST" });
export const undoGroupEnd = () => ({ ok: false, status: "AE_ONLY_HOST" });
export const undoGroupAbort = () => ({ ok: false, status: "AE_ONLY_HOST" });
export const legacyPpCall = (_method: string, _argsJson: string) => ({
  ok: false,
  reason: "AE_ONLY_HOST",
});
const copyPasteStub = () => ({ ok: false as const, reason: "AE_ONLY_HOST" });
export const copyPasteGetAppPrefs = copyPasteStub;
export const copyPasteCheckForDuplicatesOfAuthorFolder = copyPasteStub;
export const copyPasteGetMetadata = copyPasteStub;
export const copyPasteIsSelectedItemExists = (_presetName: string) => copyPasteStub();
export const copyPasteGetSelectedItem = (_presetName: string) => copyPasteStub();
export const copyPasteIsResolutionExists = (_resolution: string) => copyPasteStub();
export const copyPasteCreateStructure = (_payload: unknown) => copyPasteStub();
export const copyPasteInitializeLibrary = (_base: string, _platform: string) => copyPasteStub();
export const copyPasteExecuteCommand = (_command: string) => copyPasteStub();
export const copyPasteImportSelectedItem = (_projectPath: string) => copyPasteStub();
export const copyPasteResolveMissingFootages = (_assets: string, _preset: string) =>
  copyPasteStub();
export const copyPasteImportAdjustmentSequence = (_ptx: string, _res: string) => copyPasteStub();
export const copyPasteImportColorMatteSequence = (_ptx: string, _res: string) => copyPasteStub();
export const copyPasteCollectClipsPreset = (_id: string) => copyPasteStub();
export const copyPastePrepareToPastePreset = (_id: string) => copyPasteStub();
export const copyPasteDetouchPreset = (_args: unknown) => copyPasteStub();
import {
  helloArrayStr,
  helloError,
  helloNum,
  helloObj,
  helloStr,
  helloVoid,
} from "../utils/samples";
/** @deprecated Bolt samples — not part of MotionFlow SDK surface */
export { helloArrayStr, helloError, helloNum, helloObj, helloStr, helloVoid };

/** @deprecated Bolt sample — not part of MotionFlow SDK surface */
export const helloWorld = () => {
  alert("Hello from After Effects!");
  app.project.activeItem;
};

import { captionsBinName, stylesBinName } from "../../shared/shared";
import {
  CAPTION_BATCH_COUNT,
  CAPTION_SYSTEM,
  captionBatchLayerName,
  resolveCaptionChunks,
  unpackCaptionChunks,
  unpackCaptions,
} from "../../shared/caption-system";
import { readJsonUtf8 } from "../utils/utils";
import { getActiveComp, getNextCaptionsName, fitCaptionLayerHeight } from "./aeft-utils";

// РІС‹РґРµР»РµРЅРЅС‹Рµ СЃР»РѕРё, Сѓ РєРѕС‚РѕСЂС‹С… СЂРµР°Р»СЊРЅРѕ РµСЃС‚СЊ Р·РІСѓРє вЂ” РЅР° РЅРёС… СЃС‚Р°РІРёРј "solo" РЅР° РІСЂРµРјСЏ СЂРµРЅРґРµСЂР°
const layersWithAudio = (layers: Layer[]): AVLayer[] => {
  const result: AVLayer[] = [];
  for (let i = 0; i < layers.length; i++) {
    const av = layers[i] as AVLayer;
    if (av.hasAudio) result.push(av);
  }
  return result;
};

// AE С‚РѕР¶Рµ РЅРµ РґР°С‘С‚ РЅР°СЃС‚РѕСЏС‰РёР№ solo РёР· СЃРєСЂРёРїС‚Р° вЂ” РјСЊСЋС‚РёРј audioEnabled РІСЃРµС… РѕСЃС‚Р°Р»СЊРЅС‹С…
// Р·РІСѓС‡Р°С‰РёС… СЃР»РѕС‘РІ РЅР° РІСЂРµРјСЏ СЂРµРЅРґРµСЂР°, РІРѕР·РІСЂР°С‰Р°РµРј С„СѓРЅРєС†РёСЋ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ РёСЃС…РѕРґРЅРѕРіРѕ СЃРѕСЃС‚РѕСЏРЅРёСЏ
const soloAudioLayers = (comp: CompItem, keep: AVLayer[]) => {
  const keepIds: { [id: number]: boolean } = {};
  for (let i = 0; i < keep.length; i++) keepIds[keep[i].id] = true;
  const saved: { layer: AVLayer; enabled: boolean }[] = [];
  for (let i = 1; i <= comp.numLayers; i++) {
    const av = comp.layers[i] as AVLayer;
    if (!av.hasAudio) continue;
    saved.push({ layer: av, enabled: av.audioEnabled });
    av.audioEnabled = !!keepIds[av.id];
  }
  return () => {
    for (let i = 0; i < saved.length; i++) saved[i].layer.audioEnabled = saved[i].enabled;
  };
};

// РѕРґРёРЅ Describe: Р±РµР· РІС‹РґРµР»РµРЅРёСЏ вЂ” СЂРµРЅРґРµСЂРёРј РІСЃСЋ РєРѕРјРїРѕР·РёС†РёСЋ; СЃ РІС‹РґРµР»РµРЅРёРµРј вЂ” С‚РѕР»СЊРєРѕ
// РѕР±Р»Р°СЃС‚СЊ РІС‹Р±СЂР°РЅРЅС‹С… СЃР»РѕС‘РІ, СЃРѕР»Рѕ С‚РѕР»СЊРєРѕ РЅР° Р·РІСѓРєРµ РІС‹Р±СЂР°РЅРЅРѕРіРѕ(С‹С…)
/** Soft-fail shape — never return bare `null` (CEP JSON null → Error: null). */
export type DescribeFailure = {
  ok: false;
  reason: "NO_ACTIVE_COMP" | "NO_AUDIO" | "NO_WORK_AREA" | "DESCRIBE_FAILED";
  message: string;
};

/** Work Area range of the active comp — for generation cost UI (no export). */
export const getWorkRange = () => {
  try {
    const comp = getActiveComp();
    if (!comp) {
      return {
        ok: false as const,
        reason: "NO_ACTIVE_COMP" as const,
        message: "Open a composition in After Effects, then try again.",
      };
    }
    const frame = 1 / Math.max(1, comp.frameRate);
    const compDur = Math.max(frame, comp.duration);
    let start = Number(comp.workAreaStart) || 0;
    let duration = Number(comp.workAreaDuration) || 0;
    start = Math.max(0, Math.min(start, Math.max(0, compDur - frame)));
    duration = Math.max(frame, Math.min(duration, compDur - start));
    if (!(duration > 0)) {
      return {
        ok: false as const,
        reason: "NO_WORK_AREA" as const,
        message: "Set a Work Area on the composition timeline, then try again.",
      };
    }
    return {
      ok: true as const,
      start,
      end: start + duration,
      durationSeconds: duration,
    };
  } catch (e: any) {
    return {
      ok: false as const,
      reason: "DESCRIBE_FAILED" as const,
      message: e && e.message ? String(e.message) : "Could not read Work Area",
    };
  }
};

/** Export audio for the composition Work Area only (selection ignored). */
export const describe = (_audioPresetPath?: string) => {
  try {
    const range = getWorkRange();
    if (!range.ok) return range;

    const comp = getActiveComp();
    if (!comp) {
      return {
        ok: false as const,
        reason: "NO_ACTIVE_COMP" as const,
        message: "Open a composition in After Effects, then try again.",
      };
    }

    const rangeStart = range.start;
    const rangeDur = range.durationSeconds;
    const rqItem = app.project.renderQueue.items.add(comp);
    rqItem.timeSpanStart = rangeStart;
    rqItem.timeSpanDuration = rangeDur;
    const fileName = `ae_audio_export_${Date.now()}`;
    const om = rqItem.outputModule(1);

    om.applyTemplate("Lossless");

    const tempFile = new File(Folder.temp.fsName + `/${fileName}.avi`);
    om.file = tempFile;
    om.setSettings({
      "Video Output": false,
    });

    try {
      app.project.renderQueue.render();
    } finally {
      rqItem.remove();
    }
    comp.openInViewer();
    // offset — Work Area start; transcription timestamps are relative to it
    return {
      source: tempFile.fsName,
      dest: Folder.temp.fsName + `/${fileName}.mp3`,
      offset: rangeStart,
      durationSeconds: rangeDur,
      type: "composition" as const,
    };
  } catch (e: any) {
    let message = e && e.message ? String(e.message) : String(e);
    if (/null is not an object/i.test(message)) {
      message =
        "Could not export audio from the Work Area. Check the Work Area and try again.";
    }
    return {
      ok: false as const,
      reason: "DESCRIBE_FAILED" as const,
      message: message || "Could not export audio from the composition",
    };
  }
};

/** PPRO-only — stub for Scripts intersection. */
export const markSilences = (_data: { ranges: unknown[]; offset: number }) => null;

export interface ChapterMarkerInput {
  time: number;
  name: string;
}

// СЃС‚Р°РІРёРј РїРѕ РѕРґРЅРѕРјСѓ composition-РјР°СЂРєРµСЂСѓ (comp.markerProperty) РЅР° РєР°Р¶РґСѓСЋ РіР»Р°РІСѓ
export const addMarkers = (data: { markers: ChapterMarkerInput[] }) => {
  const comp = getActiveComp();
  if (!comp) {
    alert("Open a composition first");
    return null;
  }
  const markers = (data && data.markers) || [];
  try {
    app.beginUndoGroup("Add Chapter Markers");
    let created = 0;
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      comp.markerProperty.setValueAtTime(Math.max(0, m.time), new MarkerValue(m.name || "Chapter"));
      created++;
    }
    app.endUndoGroup();
    return { created };
  } catch (e: any) {
    app.endUndoGroup();
    alert(e.message);
    return null;
  }
};

// С‚РµРєСѓС‰Р°СЏ РїРѕР·РёС†РёСЏ С‚Р°Р№РјР»РёРЅРёРё + id Р°РєС‚РёРІРЅРѕР№ РєРѕРјРїРѕР·РёС†РёРё вЂ” РґР»СЏ sync scroll
// (СЃРєСЂРѕР»Р»РёРј РїР°РЅРµР»СЊ С‚РѕР»СЊРєРѕ РµСЃР»Рё РѕС‚РєСЂС‹С‚Р° С‚Р° Р¶Рµ comp, РіРґРµ РґРµР»Р°Р»Рё transcribe)
export const getCurrentTime = () => {
  const comp = getActiveComp();
  if (!comp) return null;
  return { time: comp.time, compId: comp.id, trackIndex: undefined as number | undefined };
};

/** Parent folder of the saved .aep, or null if the project is unsaved. */
export const getProjectFolderPath = (): string | null => {
  try {
    const file = app.project.file;
    if (!file) return null;
    return file.parent ? file.parent.fsName : null;
  } catch (e) {
    return null;
  }
};

// РєР»РёРє РїРѕ caption РІ РїР°РЅРµР»Рё вЂ” РїРµСЂРµСЃС‚Р°РІР»СЏРµРј РїР»РµР№С…РµРґ Р°РєС‚РёРІРЅРѕР№ РєРѕРјРїРѕР·РёС†РёРё РЅР° РЅР°С‡Р°Р»Рѕ СЃРµРіРјРµРЅС‚Р°
export const setCurrentTime = ({ time }: { time: number }) => {
  const comp = getActiveComp();
  if (!comp) return null;
  try {
    comp.time = time;
    return { seeked: true };
  } catch (e: any) {
    return null;
  }
};

interface CaptionLayer {
  text: string;
  timestamp: [number, number];
  mogrtPath?: string;
  aepPath?: string;
  words?: { text: string; timestamp: [number, number] }[];
  captionChunks?: string[];
  captionsRawData?: string;
  segmentType?: number;
  lineCount?: number;
  charsPerLine?: number;
}

// СЃРєСЂС‹С‚С‹Р№ СЃР»РѕР№-РјР°СЂРєРµСЂ: РІ Source Text Р»РµР¶РёС‚ JSON СЃРµСЃСЃРёРё РґР»СЏ РѕР±СЂР°С‚РЅРѕР№ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё
const MARKER_TAG = "mf-caption-data";
const MARKER_NAME = "__mf_caption_session__";
const TEMPLATE_MARKER = "mf-aep-template:";

const findMarkerLayer = (comp: CompItem): Layer | null => {
  for (let i = 1; i <= comp.numLayers; i++) {
    if (comp.layers[i].comment === MARKER_TAG) return comp.layers[i];
  }
  return null;
};

const readLayerSourceText = (layer: Layer): string => {
  try {
    const sourceText = layer.property("Text").property("Source Text") as Property;
    const val = sourceText.value as TextDocument;
    return val ? String(val.text) : "";
  } catch (e) {
    return "";
  }
};

const writeLayerSourceText = (layer: Layer, text: string) => {
  const sourceText = layer.property("Text").property("Source Text") as Property;
  sourceText.setValue(new TextDocument(text));
};

/** Scribe `words[]` (word + spacing) — packed v4 into captions_batch_01..15. */
const captionsRawDataJson = (caption: CaptionLayer): string => {
  if (caption.captionsRawData) return caption.captionsRawData;
  const words =
    caption.words && caption.words.length
      ? caption.words
      : [
          {
            text: caption.text.split("\n").join(" "),
            timestamp: [0, Math.max(0.001, caption.timestamp[1] - caption.timestamp[0])] as [number, number],
          },
        ];
  const tokens: { text: string; start: number; end: number; type: string; speaker_id: null }[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    tokens.push({
      text: w.text,
      start: w.timestamp[0],
      end: w.timestamp[1],
      type: "word",
      speaker_id: null,
    });
    if (i < words.length - 1) {
      tokens.push({
        text: "",
        start: w.timestamp[1],
        end: words[i + 1].timestamp[0],
        type: "spacing",
        speaker_id: null,
      });
    }
  }
  return JSON.stringify(tokens);
};

/** Walk Essential Properties: batches are in Store hidden, Segment Type in Bridge hidden. */
const findEssentialProp = (layer: Layer, name: string): Property | null => {
  const walk = (group: PropertyGroup): Property | null => {
    try {
      for (let i = 1; i <= group.numProperties; i++) {
        const p = group.property(i);
        if (!p) continue;
        if (String(p.name) === name) return p as Property;
        try {
          const nested = p as PropertyGroup;
          if (typeof nested.numProperties === "number" && nested.numProperties > 0) {
            const found = walk(nested);
            if (found) return found;
          }
        } catch (e) {
          // leaf property
        }
      }
    } catch (e2) {
      // ignore
    }
    return null;
  };
  try {
    const ep = layer.property("Essential Properties");
    if (ep) {
      const found = walk(ep as PropertyGroup);
      if (found) return found;
    }
  } catch (e) {
    // ignore
  }
  try {
    const ep = (layer as any).essentialProperty as PropertyGroup | undefined;
    if (ep) return walk(ep);
  } catch (e2) {
    // ignore
  }
  return null;
};

const setSystemProp = (layer: Layer, name: string, value: string | number): boolean => {
  const prop = findEssentialProp(layer, name);
  if (!prop) return false;
  try {
    prop.setValue(value);
    return true;
  } catch (e) {
    try {
      prop.setValueAtTime(0, value);
      return true;
    } catch (e2) {
      return false;
    }
  }
};

const setSystemTextProp = (layer: Layer, name: string, text: string): boolean => {
  const prop = findEssentialProp(layer, name);
  if (!prop) return false;
  const value = text == null ? "" : String(text);
  try {
    prop.setValue(new TextDocument(value));
    return true;
  } catch (e) {
    try {
      prop.setValue(value);
      return true;
    } catch (e2) {
      try {
        prop.setValueAtTime(0, value);
        return true;
      } catch (e3) {
        return false;
      }
    }
  }
};

const fillCaptionChunks = (layer: Layer, chunks?: string[] | null, rawJson?: string) => {
  const resolved = resolveCaptionChunks(chunks, rawJson);
  for (let i = 1; i <= CAPTION_BATCH_COUNT; i++) {
    setSystemTextProp(layer, captionBatchLayerName(i), resolved[i - 1]);
  }
};

/**
 * Store/Bridge (legacy System) EP: captions_batch_01..15, Segment Type, Line Count,
 * Chars Per Line, Composition Height. Captions_Raw_Data / Captions_Data
 * считает expression. Pause Gap / Hold Duration — user style, не пишем.
 */
const fillSystemEssentialProps = (layer: Layer, caption: CaptionLayer, compositionHeight: number) => {
  fillCaptionChunks(layer, caption.captionChunks, captionsRawDataJson(caption));
  if (caption.segmentType != null) setSystemProp(layer, CAPTION_SYSTEM.segmentType, caption.segmentType);
  if (caption.lineCount != null) setSystemProp(layer, CAPTION_SYSTEM.lineCount, caption.lineCount);
  if (caption.charsPerLine != null) setSystemProp(layer, CAPTION_SYSTEM.charsPerLine, caption.charsPerLine);
  if (compositionHeight > 0) {
    setSystemProp(layer, CAPTION_SYSTEM.compositionHeight, compositionHeight);
    fitCaptionLayerHeight(layer, compositionHeight, 2048);
  }
};

const collectComps = (item: Item, out: CompItem[]) => {
  if (item instanceof CompItem) {
    out.push(item);
    return;
  }
  if (item instanceof FolderItem) {
    for (let i = 1; i <= item.numItems; i++) {
      collectComps(item.item(i), out);
    }
  }
};

const findTemplateCompByPath = (aepPath: string): CompItem | null => {
  const marker = TEMPLATE_MARKER + aepPath;
  for (let i = 1; i <= app.project.numItems; i++) {
    const item = app.project.item(i);
    if (!(item instanceof CompItem)) continue;
    try {
      if (String((item as any).comment || "") === marker) return item;
    } catch (e) {
      // ignore
    }
  }
  return null;
};

/** РџР°РїРєР° "{AuthorName} Captions" РІ РєРѕСЂРЅРµ Project panel (СЃРѕР·РґР°С‘С‚ РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё). */
const ensureCaptionsBin = (): FolderItem => {
  const root = app.project.rootFolder;
  for (let i = 1; i <= root.numItems; i++) {
    const item = root.item(i);
    if (item instanceof FolderItem && item.name === captionsBinName) return item;
  }
  return app.project.items.addFolder(captionsBinName);
};

/**
 * AE РєР»Р°РґС‘С‚ import PROJECT РІ РїР°РїРєСѓ СЃ РёРјРµРЅРµРј .aep вЂ” РїРµСЂРµРЅРѕСЃРёРј СЃРѕРґРµСЂР¶РёРјРѕРµ
 * РІ "{AuthorName} Captions" Рё СѓРґР°Р»СЏРµРј РІСЂРµРјРµРЅРЅСѓСЋ РїР°РїРєСѓ РёРјРїРѕСЂС‚Р°.
 */
const relocateImportedProject = (imported: Item): void => {
  const bin = ensureCaptionsBin();
  if (imported instanceof FolderItem) {
    while (imported.numItems > 0) {
      imported.item(1).parentFolder = bin;
    }
    imported.remove();
    return;
  }
  imported.parentFolder = bin;
};

/** РРјРїРѕСЂС‚ project.aep Рё РІС‹Р±РѕСЂ С€Р°Р±Р»РѕРЅРЅРѕР№ РєРѕРјРїРѕР·РёС†РёРё (Essential Properties / System). */
const ensureTemplateComp = (aepPath: string): CompItem | null => {
  const existing = findTemplateCompByPath(aepPath);
  if (existing) return existing;

  const file = new File(aepPath);
  if (!file.exists) {
    alert("Caption style project not found:\n" + aepPath);
    return null;
  }

  const beforeIds: { [id: number]: boolean } = {};
  for (let i = 1; i <= app.project.numItems; i++) {
    beforeIds[app.project.item(i).id] = true;
  }

  const io = new ImportOptions(file);
  if (io.canImportAs(ImportAsType.PROJECT)) {
    io.importAs = ImportAsType.PROJECT;
  }
  const imported = app.project.importFile(io);
  if (imported) relocateImportedProject(imported);

  const comps: CompItem[] = [];
  // РїРѕСЃР»Рµ relocate РёС‰РµРј РЅРѕРІС‹Рµ РєРѕРјРїРѕР·РёС†РёРё РїРѕ id (imported-folder СѓР¶Рµ СѓРґР°Р»РµРЅР°)
  for (let i = 1; i <= app.project.numItems; i++) {
    const item = app.project.item(i);
    if (!beforeIds[item.id] && item instanceof CompItem) comps.push(item);
  }

  if (!comps.length) {
    alert("No composition found in caption project");
    return null;
  }

  comps.sort((a, b) => b.numLayers - a.numLayers);
  const template = comps[0];
  try {
    (template as any).comment = TEMPLATE_MARKER + aepPath;
  } catch (e) {
    // CompItem.comment РјРѕР¶РµС‚ Р±С‹С‚СЊ РЅРµРґРѕСЃС‚СѓРїРµРЅ РІ С‡Р°СЃС‚Рё РІРµСЂСЃРёР№
  }
  return template;
};

const findCaptionLayers = (comp: CompItem): Layer[] => {
  const out: Layer[] = [];
  for (let i = 1; i <= comp.numLayers; i++) {
    const comment = String(comp.layers[i].comment || "");
    if (comment.indexOf("mf-caption:") === 0) out.push(comp.layers[i]);
  }
  return out;
};

const ensureSessionMarker = (comp: CompItem) => {
  if (findMarkerLayer(comp)) return;
  const marker = comp.layers.addText("{}");
  marker.name = MARKER_NAME;
  marker.comment = MARKER_TAG;
  marker.enabled = false;
  marker.shy = true;
  marker.inPoint = 0;
  marker.outPoint = Math.min(0.01, comp.duration || 0.01);
};

const removeCaptionLayers = (comp: CompItem) => {
  for (let i = comp.numLayers; i >= 1; i--) {
    const comment = String(comp.layers[i].comment || "");
    if (comment.indexOf("mf-caption:") === 0) comp.layers[i].remove();
  }
};

/**
 * Template on the parent timeline: startTime = In so template time 0 = In / MP3.
 * Do not set only inPoint with startTime=0 — that trims the source and breaks animations.
 */
const placeCaptionLayer = (
  comp: CompItem,
  template: CompItem,
  caption: CaptionLayer,
  index: number,
) => {
  const layer = comp.layers.add(template);
  let start = +caption.timestamp[0];
  let end = +caption.timestamp[1];
  if (isNaN(start) || start < 0) start = 0;
  if (isNaN(end) || end <= start) end = start + Math.max(comp.frameDuration * 2, 0.05);
  layer.name = getNextCaptionsName(app.project, comp.name);
  layer.comment = "mf-caption:" + index;
  layer.startTime = start;
  layer.inPoint = start;
  layer.outPoint = end;
  fillSystemEssentialProps(layer, caption, comp.height);
  return layer;
};

/** One caption layer on the active composition (no precomp). */
export const createCaptions = (captions: CaptionLayer[]) => {
  try {
    const comp = getActiveComp();
    if (!comp) {
      alert("Open a composition first");
      return null;
    }
    const caption = captions[0];
    const aepPath = caption && caption.aepPath;
    if (!aepPath) {
      alert("Caption style project (.aep) is not available. Run Transcribe after selecting a style.");
      return null;
    }

    app.beginUndoGroup("Create Captions");
    const template = ensureTemplateComp(aepPath);
    if (!template) {
      app.endUndoGroup();
      return null;
    }

    removeCaptionLayers(comp);
    placeCaptionLayer(comp, template, caption, 0);
    ensureSessionMarker(comp);

    comp.openInViewer();
    app.endUndoGroup();
    return {
      created: 1,
      compId: comp.id,
      sourceCompId: comp.id,
      trackIndex: undefined as number | undefined,
      sequenceId: undefined as string | undefined,
    };
  } catch (e: any) {
    app.endUndoGroup();
    alert(e.message);
    return null;
  }
};

/** CEP writes UTF-8 JSON and passes the path вЂ” avoids Cyrillic corruption in evalScript. */
export const createCaptionsFromFile = (jsonPath: string) => {
  try {
    const captions = readJsonUtf8(jsonPath) as CaptionLayer[];
    if (!captions || !(captions as any).length) return { created: 0 };
    return createCaptions(captions);
  } catch (e: any) {
    alert(e && e.message ? e.message : String(e));
    return null;
  }
};

interface ResegmentCaptions {
  compId: number;
  // Premiere-РїРѕР»Рµ (С‚СЂРµРє СЃ caption-mogrt) вЂ” AE РµРіРѕ РёРіРЅРѕСЂРёСЂСѓРµС‚; РІ РёРЅС‚РµСЂС„РµР№СЃРµ
  // РЅСѓР¶РЅРѕ, С‡С‚РѕР±С‹ РѕР±С‰РёР№ payload РїР°РЅРµР»Рё РїСЂРѕС…РѕРґРёР» РїРµСЂРµСЃРµС‡РµРЅРёРµ С‚РёРїРѕРІ evalTS
  trackIndex?: number;
  sequenceId?: string;
  captions: CaptionLayer[];
}

export const resegmentCaptions = ({ compId, captions }: ResegmentCaptions) => {
  try {
    const item = app.project.itemByID(compId);
    if (!item || !(item instanceof CompItem)) return null;
    const caption = captions[0];
    if (!caption) return null;

    app.beginUndoGroup("Resegment Captions");
    const layers = findCaptionLayers(item);
    if (layers.length) {
      fillSystemEssentialProps(layers[0], caption, item.height);
      layers[0].comment = "mf-caption:0";
      for (let i = 1; i < layers.length; i++) layers[i].remove();
    } else {
      const aepPath = caption.aepPath;
      if (!aepPath) {
        app.endUndoGroup();
        return null;
      }
      const template = ensureTemplateComp(aepPath);
      if (!template) {
        app.endUndoGroup();
        return null;
      }
      placeCaptionLayer(item, template, caption, 0);
    }
    ensureSessionMarker(item);
    app.endUndoGroup();
    return { updated: true, created: 1 };
  } catch (e: any) {
    app.endUndoGroup();
    return null;
  }
};

/** CEP writes UTF-8 JSON and passes the path вЂ” avoids Cyrillic corruption in evalScript. */
export const resegmentCaptionsFromFile = (jsonPath: string) => {
  try {
    const payload = readJsonUtf8(jsonPath) as ResegmentCaptions;
    return resegmentCaptions(payload);
  } catch (e: any) {
    alert(e && e.message ? e.message : String(e));
    return null;
  }
};

interface SaveSessionData {
  compId?: number;
  /** Premiere nested-sequence nodeId вЂ” ignored in AE. */
  sequenceId?: string;
  json: string;
}

// РїРёС€РµС‚ JSON СЃРµСЃСЃРёРё РІ SourceText СЃРєСЂС‹С‚РѕРіРѕ РјР°СЂРєРµСЂ-СЃР»РѕСЏ РІРЅСѓС‚СЂРё captions-precomp
export const saveSessionData = ({ compId, json }: SaveSessionData) => {
  try {
    if (compId == null) return null;
    const item = app.project.itemByID(compId);
    if (!item || !(item instanceof CompItem)) return null;
    let layer = findMarkerLayer(item);
    if (!layer) {
      app.beginUndoGroup("Save Caption Session");
      const textLayer = item.layers.addText(json);
      textLayer.name = MARKER_NAME;
      textLayer.comment = MARKER_TAG;
      textLayer.enabled = false;
      textLayer.shy = true;
      textLayer.inPoint = 0;
      textLayer.outPoint = Math.min(0.01, item.duration || 0.01);
      layer = textLayer;
      app.endUndoGroup();
    } else {
      writeLayerSourceText(layer, json);
    }
    return { saved: true };
  } catch (e: any) {
    try {
      app.endUndoGroup();
    } catch (ignore) {
      // ignore
    }
    return null;
  }
};

const hasCaptionLayers = (c: CompItem) => {
  for (let i = 1; i <= c.numLayers; i++) {
    const comment = String(c.layers[i].comment || "");
    if (comment.indexOf("mf-caption:") === 0) return true;
  }
  return false;
};

const readCaptionsFrom = (c: CompItem) => {
  const marker = findMarkerLayer(c);
  if (marker) {
    const sessionData = readLayerSourceText(marker);
    return {
      compId: c.id,
      sequenceId: undefined as string | undefined,
      sessionData: sessionData || "",
      hasCaptions: true,
    };
  }
  if (hasCaptionLayers(c)) {
    return {
      compId: c.id,
      sequenceId: undefined as string | undefined,
      sessionData: "",
      hasCaptions: true,
    };
  }
  return null;
};

export const findAppliedCaptions = () => {
  try {
    const comp = getActiveComp();

    if (comp) {
      const direct = readCaptionsFrom(comp);
      if (direct) return direct;

      // Typical layout: captions live in a nested precomp on the active timeline.
      // After createCaptions the parent stays open in the viewer — walk its layers.
      for (let i = 1; i <= comp.numLayers; i++) {
        try {
          const source = (comp.layers[i] as AVLayer).source;
          if (source instanceof CompItem) {
            const nested = readCaptionsFrom(source);
            if (nested) return nested;
          }
        } catch (eLayer) {
          // skip non-AV layers
        }
      }
    }

    if (comp) {
      const selectedLayers = comp.selectedLayers;
      for (let i = 0; i < selectedLayers.length; i++) {
        const source = (selectedLayers[i] as AVLayer).source;
        if (source instanceof CompItem) {
          const fromLayer = readCaptionsFrom(source);
          if (fromLayer) return fromLayer;
        }
      }
    }

    const selection = app.project.selection;
    for (let i = 0; i < selection.length; i++) {
      const item = selection[i];
      if (item instanceof CompItem) {
        const fromSelection = readCaptionsFrom(item);
        if (fromSelection) return fromSelection;
      }
    }

    return null;
  } catch (e: any) {
    return null;
  }
};

const getSystemText = (layer: Layer, name: string): string => {
  const prop = findEssentialProp(layer, name);
  if (!prop) return "";
  try {
    const val = prop.value as { text?: string } | string | number;
    if (val && typeof val === "object" && "text" in val) return String(val.text || "");
    return val == null ? "" : String(val);
  } catch (e) {
    return "";
  }
};

const getSystemNumber = (layer: Layer, name: string): number | null => {
  try {
    const prop = findEssentialProp(layer, name);
    if (!prop) return null;
    const n = Number(prop.value);
    return isNaN(n) ? null : n;
  } catch (e) {
    return null;
  }
};

const layerHasEssentialProperties = (layer: Layer): boolean => {
  try {
    const ep = layer.property("Essential Properties");
    if (ep && (ep as PropertyGroup).numProperties > 0) return true;
  } catch (e) {
    // ignore
  }
  try {
    const ep = (layer as any).essentialProperty as PropertyGroup | undefined;
    if (ep && ep.numProperties > 0) return true;
  } catch (e2) {
    // ignore
  }
  return false;
};

const readLayerCaptionSegments = (layer: Layer): { text: string; timestamp: [number, number] }[] => {
  const chunks: string[] = [];
  let sawBatch = false;
  for (let i = 1; i <= CAPTION_BATCH_COUNT; i++) {
    const chunk = getSystemText(layer, captionBatchLayerName(i));
    if (chunk) sawBatch = true;
    chunks.push(chunk);
  }
  const tokens = sawBatch
    ? unpackCaptionChunks(chunks)
    : unpackCaptions(getSystemText(layer, CAPTION_SYSTEM.rawData));
  const out: { text: string; timestamp: [number, number] }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const text = String(t.text == null ? "" : t.text).replace(/^\s+|\s+$/g, "");
    if (!text) continue;
    let start = Number(t.start);
    let end = Number(t.end);
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end <= start) end = start + 0.05;
    out.push({ text, timestamp: [start, end] });
  }
  return out;
};

/** Load from the single selected layer if it has Essential Properties (mogrt). */
export const loadCaptionsFromTimeline = (): {
  compId?: number;
  sequenceId?: string;
  trackIndex?: number;
  segments: { text: string; timestamp: [number, number] }[];
  segmentType?: number;
  lineCount?: number;
  charsPerLine?: number;
} | null => {
  try {
    const comp = getActiveComp();
    if (!comp) return null;
    const selected = comp.selectedLayers;
    if (!selected || selected.length !== 1) return null;
    const layer = selected[0];
    if (!layerHasEssentialProperties(layer)) return null;
    const segments = readLayerCaptionSegments(layer);
    if (!segments.length) return null;
    const segmentType = getSystemNumber(layer, CAPTION_SYSTEM.segmentType);
    const lineCount = getSystemNumber(layer, CAPTION_SYSTEM.lineCount);
    const charsPerLine = getSystemNumber(layer, CAPTION_SYSTEM.charsPerLine);
    return {
      compId: comp.id,
      segments,
      segmentType: segmentType == null ? undefined : segmentType,
      lineCount: lineCount == null ? undefined : lineCount,
      charsPerLine: charsPerLine == null ? undefined : charsPerLine,
    };
  } catch (e: any) {
    return null;
  }
};

interface UpdateCaptionText {
  trackIndex?: number;
  clipIndex?: number;
  compId?: number;
  captionIndex?: number;
  /** Premiere nested-sequence nodeId вЂ” ignored in AE. */
  sequenceId?: string;
  text: string;
  captionsRawData?: string;
  captionChunks?: string[];
}

export const updateCaptionText = ({
  compId,
  captionIndex,
  captionsRawData,
  captionChunks,
}: UpdateCaptionText) => {
  if (compId == null) return null;
  try {
    const item = app.project.itemByID(compId);
    if (!item || !(item instanceof CompItem)) return null;
    const token = "mf-caption:" + (captionIndex == null ? 0 : captionIndex);
    let target: Layer | null = null;
    for (let i = 1; i <= item.numLayers; i++) {
      const layer = item.layers[i];
      if (layer.comment === token) {
        target = layer;
        break;
      }
    }
    if (!target) {
      const layers = findCaptionLayers(item);
      if (layers.length) target = layers[0];
    }
    if (!target) return null;
    if ((captionChunks && captionChunks.length) || captionsRawData) {
      fillCaptionChunks(target, captionChunks, captionsRawData);
    }
    return { updated: true };
  } catch (e: any) {
    return null;
  }
};

export const updateCaptionTextFromFile = (jsonPath: string) => {
  try {
    const payload = readJsonUtf8(jsonPath) as UpdateCaptionText;
    return updateCaptionText(payload);
  } catch (e: any) {
    return null;
  }
};

interface ApplyStyleProjectPayload {
  styleId: string;
  styleName: string;
  aepPath?: string;
  mogrtPath?: string;
  values?: Record<string, unknown>;
}

export const applyStyleProject = (payload: ApplyStyleProjectPayload) => {
  const filePath = payload.aepPath || payload.mogrtPath;
  if (!filePath) return { applied: false, reason: "no_project_file" };

  const result = applyPackItem({
    ctype: "PROJECT",
    filePath,
    itemName: payload.styleName,
    binName: stylesBinName,
  });

  if (!result.applied) return { applied: false, reason: result.reason };
  return { applied: true };
};

interface StylePropPayload {
  path: string[];
  type: number;
  value: unknown;
  leafIndex?: number;
}

interface ApplyCaptionStyleValuesPayload {
  compId?: number;
  /** Premiere nested-sequence nodeId — ignored in AE. */
  sequenceId?: string;
  trackIndex?: number;
  props: StylePropPayload[];
}

/** New mogrt renamed Segment Static → Static Segment (and Animated). */
const EP_GROUP_ALIASES: { [name: string]: string[] } = {
  "Static Segment": ["Static Segment", "Segment Static"],
  "Segment Static": ["Segment Static", "Static Segment"],
  "Animated Segment": ["Animated Segment", "Segment Animated"],
  "Segment Animated": ["Segment Animated", "Animated Segment"],
};

const getEssentialRoot = (layer: Layer): PropertyGroup | null => {
  try {
    const ep = layer.property("Essential Properties");
    if (ep) return ep as PropertyGroup;
  } catch (e) {
    // ignore
  }
  try {
    const ep = (layer as any).essentialProperty as PropertyGroup | undefined;
    if (ep) return ep;
  } catch (e2) {
    // ignore
  }
  return null;
};

const findNamedProp = (group: PropertyGroup, name: string): PropertyBase | null => {
  const aliases = EP_GROUP_ALIASES[name] || [name];
  for (let a = 0; a < aliases.length; a++) {
    const want = aliases[a];
    for (let i = 1; i <= group.numProperties; i++) {
      const prop = group.property(i);
      if (prop && prop.name === want) return prop;
    }
  }
  return null;
};

const findPropByPath = (root: PropertyGroup, path: string[]): Property | null => {
  let current: PropertyBase = root;
  for (let i = 0; i < path.length; i++) {
    const group = current as PropertyGroup;
    if (typeof group.numProperties !== "number") return null;
    const next = findNamedProp(group, path[i]);
    if (!next) return null;
    current = next;
  }
  return current as Property;
};

const setEssentialValue = (prop: Property, value: unknown): boolean => {
  try {
    prop.setValue(value as any);
    return true;
  } catch (e) {
    try {
      prop.setValueAtTime(0, value as any);
      return true;
    } catch (e2) {
      return false;
    }
  }
};

const applyPropsToLayer = (layer: Layer, props: StylePropPayload[]): number => {
  const root = getEssentialRoot(layer);
  if (!root) return 0;
  let applied = 0;
  for (let i = 0; i < props.length; i++) {
    const item = props[i];
    if (!item.path || !item.path.length) continue;
    const prop = findPropByPath(root, item.path);
    if (!prop) continue;
    if (setEssentialValue(prop, item.value)) applied++;
  }
  return applied;
};

/** РџСЂРёРјРµРЅРёС‚СЊ style values РєРѕ РІСЃРµРј caption-СЃРµРіРјРµРЅС‚Р°Рј (СЃР»РѕРё mf-caption:*). */
export const applyCaptionStyleValues = ({ compId, props }: ApplyCaptionStyleValuesPayload) => {
  try {
    let item: CompItem | null = null;
    if (compId != null) {
      const found = app.project.itemByID(compId);
      if (found instanceof CompItem) item = found;
    }
    if (!item) {
      const found = findAppliedCaptions();
      if (found) {
        const byId = app.project.itemByID(found.compId);
        if (byId instanceof CompItem) item = byId;
      }
    }
    if (!item || !props || !props.length) return { updated: 0 };

    let updated = 0;
    for (let i = 1; i <= item.numLayers; i++) {
      const layer = item.layers[i];
      const comment = String(layer.comment || "");
      if (comment.indexOf("mf-caption:") !== 0) continue;
      if (applyPropsToLayer(layer, props) > 0) updated++;
    }
    return { updated };
  } catch (e: any) {
    return { updated: 0, error: String(e && e.message ? e.message : e) };
  }
};
