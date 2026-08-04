export { importMedia, importVoiceoverAudio } from "./aeft-import-media";
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

import { captionsBinName } from "../../shared/shared";
import { readJsonUtf8 } from "../utils/utils";
import { getActiveComp, getNextCaptionsName } from "./aeft-utils";

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
export const describe = (_audioPresetPath?: string) => {
  try {
    const comp = getActiveComp();
    if (!comp) {
      alert("Open a composition first");
      return null;
    }

    const selectedLayers = comp.selectedLayers;
    if (selectedLayers.length === 0) {
      const rqItem = app.project.renderQueue.items.add(comp);
      rqItem.timeSpanStart = 0;
      rqItem.timeSpanDuration = comp.duration;
      const fileName = `ae_audio_export_${Date.now()}`;
      const om = rqItem.outputModule(1);

      // WAV settings
      om.applyTemplate("Lossless");

      const tempFile = new File(Folder.temp.fsName + `/${fileName}.avi`);
      om.file = tempFile;
      om.setSettings({
        "Video Output": false,
      });

      app.project.renderQueue.render();
      rqItem.remove();
      comp.openInViewer();
      // offset вЂ” С‚РѕС‡РєР° СЃС‚Р°СЂС‚Р° СЂРµРЅРґРµСЂР° РІ С‚Р°Р№РјР»Р°Р№РЅРµ; С‚Р°Р№РјРєРѕРґС‹ С‚СЂР°РЅСЃРєСЂРёРїС†РёРё РѕС‚ РЅРµС‘
      return { source: tempFile.fsName, dest: Folder.temp.fsName + `/${fileName}.mp3`, offset: 0, type: "composition" as const };
    }

    const audioLayers = layersWithAudio(selectedLayers);
    if (!audioLayers.length) {
      alert("Selected clip has no audio");
      return null;
    }

    const saveWAS = comp.workAreaStart;
    const saveWAD = comp.workAreaDuration;
    comp.workAreaStart = selectedLayers[0].inPoint;
    comp.workAreaDuration = selectedLayers[selectedLayers.length - 1].outPoint - selectedLayers[0].inPoint;
    const restoreAudio = soloAudioLayers(comp, audioLayers);

    const rqItem = app.project.renderQueue.items.add(comp);
    rqItem.timeSpanStart = comp.workAreaStart;
    rqItem.timeSpanDuration = comp.workAreaDuration;
    const fileName = `ae_audio_export_${Date.now()}`;
    const om = rqItem.outputModule(1);

    // WAV settings
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
      comp.workAreaStart = saveWAS;
      comp.workAreaDuration = saveWAD;
      restoreAudio();
    }
    comp.openInViewer();
    // offset РЅР° inPoint РїРµСЂРІРѕРіРѕ РІС‹РґРµР»РµРЅРЅРѕРіРѕ СЃР»РѕСЏ вЂ” С‚Р°Р№РјРєРѕРґС‹ РѕС‚ РЅРµРіРѕ
    return {
      source: tempFile.fsName,
      dest: Folder.temp.fsName + `/${fileName}.mp3`,
      offset: selectedLayers[0].inPoint,
      type: "selected" as const,
    };
  } catch (e: any) {
    alert(e.message);
    return null;
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

const timingsJson = (caption: CaptionLayer): string => {
  const words =
    caption.words && caption.words.length
      ? caption.words
      : [
          {
            text: caption.text.split("\n").join(" "),
            timestamp: [0, Math.max(0.001, caption.timestamp[1] - caption.timestamp[0])] as [number, number],
          },
        ];
  return JSON.stringify(words);
};

/** Р РµРєСѓСЂСЃРёРІРЅС‹Р№ РїРѕРёСЃРє РЅРµ РёСЃРїРѕР»СЊР·СѓРµРј вЂ” Сѓ С€Р°Р±Р»РѕРЅР° С„РёРєСЃРёСЂРѕРІР°РЅРЅС‹Рµ РїСѓС‚Рё System/*. */
const getSystemGroup = (layer: Layer): PropertyGroup | null => {
  try {
    const ep = layer.property("Essential Properties");
    if (ep) {
      const system = ep.property("System");
      if (system) return system as PropertyGroup;
    }
  } catch (e) {
    // ignore
  }
  try {
    const ep = (layer as any).essentialProperty as PropertyGroup | undefined;
    if (!ep) return null;
    const system = ep.property("System");
    if (system) return system as PropertyGroup;
  } catch (e2) {
    // ignore
  }
  return null;
};

const setSystemProp = (layer: Layer, name: string, value: string): boolean => {
  const system = getSystemGroup(layer);
  if (!system) return false;
  try {
    const prop = system.property(name) as Property;
    if (!prop) return false;
    try {
      prop.setValue(value);
      return true;
    } catch (e) {
      // РµСЃР»Рё РµСЃС‚СЊ РєР»СЋС‡Рё вЂ” РїРёС€РµРј РЅР° РІСЂРµРјСЏ 0
      try {
        prop.setValueAtTime(0, value);
        return true;
      } catch (e2) {
        return false;
      }
    }
  } catch (e) {
    return false;
  }
};

/**
 * System EP (С‚РѕС‡РЅС‹Рµ РёРјРµРЅР° РёР· UI С€Р°Р±Р»РѕРЅР°):
 * Essential Properties в†’ System в†’ Main text | Highlight text | timings
 */
const fillSystemEssentialProps = (layer: Layer, text: string, timings: string) => {
  setSystemProp(layer, "Main text", text);
  setSystemProp(layer, "Highlight text", text);
  setSystemProp(layer, "timings", timings);
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

/**
 * РЎС‚Р°РІРёС‚ С€Р°Р±Р»РѕРЅ СЃ startTime = РЅР°С‡Р°Р»Рѕ СЃРµРіРјРµРЅС‚Р°.
 * РўРѕР»СЊРєРѕ inPoint РїСЂРё startTime=0 СЃРґРІРёРіР°РµС‚ time РІРЅСѓС‚СЂРё nested comp Рё Р»РѕРјР°РµС‚ timings/Р°РЅРёРјР°С†РёРё.
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
  layer.name = caption.text.split("\n").join(" ");
  layer.comment = "mf-caption:" + index;
  layer.startTime = start;
  layer.inPoint = start;
  layer.outPoint = end;
  fillSystemEssentialProps(layer, caption.text, timingsJson(caption));
};

const addCaptionTemplateLayers = (comp: CompItem, template: CompItem, captions: CaptionLayer[]) => {
  for (let i = 0; i < captions.length; i++) {
    placeCaptionLayer(comp, template, captions[i], i);
  }
};

/** Captions-precomp + РёРЅСЃС‚Р°РЅСЃС‹ РєРѕРјРїРѕР·РёС†РёРё РёР· project.aep (System EP). */
export const createCaptions = (captions: CaptionLayer[]) => {
  try {
    const comp = getActiveComp();
    if (!comp) {
      alert("Open a composition first");
      return null;
    }
    const aepPath = captions[0] && captions[0].aepPath;
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

    const duration = captions.length
      ? Math.max(+captions[captions.length - 1].timestamp[1], comp.frameDuration)
      : comp.duration;
    const precompName = getNextCaptionsName(app.project, comp.name);
    const newComp = app.project.items.addComp(
      precompName,
      comp.width,
      comp.height,
      comp.pixelAspect,
      duration,
      comp.frameRate,
    );
    comp.layers.add(newComp);
    addCaptionTemplateLayers(newComp, template, captions);

    const marker = newComp.layers.addText("{}");
    marker.name = MARKER_NAME;
    marker.comment = MARKER_TAG;
    marker.enabled = false;
    marker.shy = true;
    marker.inPoint = 0;
    marker.outPoint = Math.min(0.01, newComp.duration || 0.01);

    comp.openInViewer();
    app.endUndoGroup();
    return {
      created: captions.length,
      compId: newComp.id,
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
    const aepPath = captions[0] && captions[0].aepPath;
    if (!aepPath || !captions.length) return null;

    app.beginUndoGroup("Resegment Captions");
    const template = ensureTemplateComp(aepPath);
    if (!template) {
      app.endUndoGroup();
      return null;
    }

    for (let i = item.numLayers; i >= 1; i--) {
      if (item.layers[i].comment === MARKER_TAG) continue;
      item.layers[i].remove();
    }
    addCaptionTemplateLayers(item, template, captions);
    item.duration = Math.max(+captions[captions.length - 1].timestamp[1], item.frameDuration);

    app.endUndoGroup();
    return { updated: true, created: captions.length };
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

/** Premiere-only: read mogrts from nest. Stub keeps evalTS Scripts intersection valid. */
export const loadCaptionsFromTimeline = (): {
  compId?: number;
  sequenceId?: string;
  trackIndex?: number;
  segments: { text: string; timestamp: [number, number] }[];
} | null => null;

interface UpdateCaptionText {
  trackIndex?: number;
  clipIndex?: number;
  compId?: number;
  captionIndex?: number;
  /** Premiere nested-sequence nodeId вЂ” ignored in AE. */
  sequenceId?: string;
  text: string;
}

export const updateCaptionText = ({ compId, captionIndex, text }: UpdateCaptionText) => {
  if (compId == null || captionIndex == null) return null;
  try {
    const item = app.project.itemByID(compId);
    if (!item || !(item instanceof CompItem)) return null;
    const token = "mf-caption:" + captionIndex;
    for (let i = 1; i <= item.numLayers; i++) {
      const layer = item.layers[i];
      if (layer.comment !== token) continue;
      layer.name = text.split("\n").join(" ");
      setSystemProp(layer, "Main text", text);
      setSystemProp(layer, "Highlight text", text);
      return { updated: true };
    }
    return null;
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
    binName: "Spunkram Styles",
  });

  if (!result.applied) return { applied: false, reason: result.reason };
  return { applied: true };
};

interface StylePropPayload {
  path: string[];
  type: number;
  value: unknown;
}

interface ApplyCaptionStyleValuesPayload {
  compId?: number;
  /** Premiere nested-sequence nodeId вЂ” ignored in AE. */
  sequenceId?: string;
  props: StylePropPayload[];
}

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
  for (let i = 1; i <= group.numProperties; i++) {
    const prop = group.property(i);
    if (prop && prop.name === name) return prop;
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

    app.beginUndoGroup("Apply Caption Style");
    let updated = 0;
    for (let i = 1; i <= item.numLayers; i++) {
      const layer = item.layers[i];
      const comment = String(layer.comment || "");
      if (comment.indexOf("mf-caption:") !== 0) continue;
      if (applyPropsToLayer(layer, props) > 0) updated++;
    }
    app.endUndoGroup();
    return { updated };
  } catch (e: any) {
    try {
      app.endUndoGroup();
    } catch (e2) {
      // ignore
    }
    return { updated: 0, error: String(e && e.message ? e.message : e) };
  }
};
