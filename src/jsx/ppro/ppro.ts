export { importMedia, importVoiceoverAudio } from "./ppro-import-media";
export { importExternalAsset } from "./ppro-import-external";
export { applyPackItem } from "./ppro-apply-item";
import { applyPackItem } from "./ppro-apply-item";
export {
  bindPack,
  setEngine,
  getPackContext,
  getEngine,
  mfCopyPackage,
  mfDeletePackage,
  addMogrt,
  importSequence,
  importFootage,
  importAudio,
  undoGroupStart,
  undoGroupEnd,
  undoGroupAbort,
  legacyPpCall,
} from "./ppro-sdk";
/** AE-only stubs so Scripts intersection typing still works for evalTS. */
export const createComp = (_opts: unknown) => ({
  ok: false as const,
  reason: "PPRO_ONLY_HOST",
});
export const createText = (_opts: unknown) => ({
  ok: false as const,
  reason: "PPRO_ONLY_HOST",
});
export const addResponsiveBackground = (_opts?: unknown) => ({
  ok: false as const,
  reason: "PPRO_ONLY_HOST",
});
export const legacyAeCall = (_method: string, _argsJson: string) => ({
  ok: false,
  reason: "PPRO_ONLY_HOST",
});
import {
  helloVoid,
  helloError,
  helloStr,
  helloNum,
  helloArrayStr,
  helloObj,
} from "../utils/samples";
/** @deprecated Bolt samples — not part of MotionFlow SDK surface */
export { helloError, helloStr, helloNum, helloArrayStr, helloObj, helloVoid };
import { dispatchTS, readJsonUtf8 } from "../utils/utils";
import { CAPTION_SYSTEM } from "../../shared/caption-system";
import { captionsBinName, stylesBinName } from "../../shared/shared";
import {
  applyMogrtStyleProps,
  collectCaptionClips,
  fillMogrtCaptionChunks,
  fillMogrtSystemProps,
  findCaptionTrackIndex,
  findFreeVideoTrack,
  fitCaptionMogrtHeight,
  getNextCaptionsName,
  readMogrtCaptionSegments,
  readMogrtNumber,
  secondsToTime,
} from "./ppro-utils";

/** @deprecated Bolt sample — not part of MotionFlow SDK surface */
export const qeDomFunction = () => {
  if (typeof qe === "undefined") {
    app.enableQE();
  }
  if (qe) {
    qe.name;
    qe.project.getVideoEffectByName("test");
  }
};

/** @deprecated Bolt sample — not part of MotionFlow SDK surface */
export const helloWorld = () => {
  alert("Hello from Premiere Pro.");
};

// WorkAreaType РёР· types-for-adobe вЂ” СЌС‚Рѕ declare enum Р±РµР· СЂР°РЅС‚Р°Р№Рј-РѕР±СЉРµРєС‚Р°,
// РІ ExtendScript Premiere С‚Р°РєРѕРіРѕ РіР»РѕР±Р°Р»Р° РЅРµС‚; РёСЃРїРѕР»СЊР·СѓРµРј С‡РёСЃР»РѕРІС‹Рµ Р·РЅР°С‡РµРЅРёСЏ API
const ENCODE_ENTIRE = 0 as const;
const ENCODE_IN_TO_OUT = 1 as const;

// СЌРєСЃРїРѕСЂС‚РёСЂСѓРµРј Р°СѓРґРёРѕ СЃРµРєРІРµРЅС†РёРё С‡РµСЂРµР· РїСЂРµСЃРµС‚ (.epr) вЂ” Р±Р°РЅРґР»РµРЅРЅС‹Р№ СЃ СЂР°СЃС€РёСЂРµРЅРёРµРј
// РёР»Рё РІС‹Р±СЂР°РЅРЅС‹Р№ РІ Settings; Сѓ Premiere РЅРµС‚ СЃРїРѕСЃРѕР±Р° РѕС‚СЂРµРЅРґРµСЂРёС‚СЊ РјРёРєСЃ Р±РµР· РїСЂРµСЃРµС‚Р°
const exportSequenceAudio = (
  seq: Sequence,
  audioPresetPath: string | undefined,
  workAreaType: typeof ENCODE_ENTIRE | typeof ENCODE_IN_TO_OUT,
) => {
  if (!audioPresetPath || !new File(audioPresetPath).exists) {
    throw new Error("Audio export preset (.epr) is missing. Reinstall the extension or set one in Settings");
  }
  const ext = seq.getExportFileExtension(audioPresetPath) || "wav";

  // РєР°Рє РІ РѕС„РёС†РёР°Р»СЊРЅРѕРј PProPanel: Р±РµР· XMP-РјРµС‚Р°РґР°РЅРЅС‹С… вЂ” РёС… Р·Р°РїРёСЃСЊ Р»РѕРјР°Р»Р° СЌРєСЃРїРѕСЂС‚
  try {
    app.encoder.setSidecarXMPEnabled(0);
    app.encoder.setEmbeddedXMPEnabled(0);
  } catch (e) {
    // СЃС‚Р°СЂС‹Рµ РІРµСЂСЃРёРё Р±РµР· СЌС‚РёС… РјРµС‚РѕРґРѕРІ
  }

  // СЃРЅР°С‡Р°Р»Р° Temp, РїСЂРё РЅРµСѓРґР°С‡Рµ вЂ” Documents (РѕР±С…РѕРґРёС‚ ACL/Р°РЅС‚РёРІРёСЂСѓСЃ-Р±Р»РѕРєРёСЂРѕРІРєРё
  // РЅР° Temp, РёР·-Р·Р° РєРѕС‚РѕСЂС‹С… exporter РѕС‚РґР°С‘С‚ Error 10 "permission to create or delete")
  const baseDirs = [Folder.temp.fsName, Folder.myDocuments.fsName];
  let lastStatus = "";
  for (let d = 0; d < baseDirs.length; d++) {
    // СЃРІРѕСЏ РїРѕРґРїР°РїРєР°: РЅРµ Р·Р°РІРёСЃРёРј РѕС‚ С‡СѓР¶РёС… С„Р°Р№Р»РѕРІ/СЃРєР°РЅРµСЂРѕРІ РІ РєРѕСЂРЅРµ
    const outDir = new Folder(baseDirs[d] + "/captions_cep");
    if (!outDir.exists && !outDir.create()) continue;

    // exporter РЅРµ РјРѕР¶РµС‚ РїРµСЂРµР·Р°РїРёСЃР°С‚СЊ С„Р°Р№Р», РєРѕС‚РѕСЂС‹Р№ Windows РµС‰С‘ РґРµСЂР¶РёС‚ РІ
    // "delete pending" вЂ” РµСЃР»Рё РёРјСЏ Р·Р°РЅСЏС‚Рѕ Рё РЅРµ СѓРґР°Р»СЏРµС‚СЃСЏ, РїРѕРґР±РёСЂР°РµРј СЃРІРѕР±РѕРґРЅРѕРµ
    let fileName = `pp_audio_export_${Date.now()}`;
    for (let i = 1; i < 6; i++) {
      const f = new File(outDir.fsName + `/${fileName}.${ext}`);
      if (!f.exists || f.remove()) break;
      fileName = `pp_audio_export_${Date.now()}_${i}`;
    }
    // fsName вЂ” РЅР°С‚РёРІРЅС‹Рµ СЂР°Р·РґРµР»РёС‚РµР»Рё РћРЎ: exporter Premiere СЃРїРѕС‚С‹РєР°РµС‚СЃСЏ РЅР°
    // СЃРјРµС€Р°РЅРЅС‹С… РїСѓС‚СЏС… РІРёРґР° C:\...\Temp/file.wav
    const source = new File(outDir.fsName + `/${fileName}.${ext}`).fsName;
    const dest = new File(outDir.fsName + `/${fileName}.mp3`).fsName;

    // exportAsMediaDirect СЃРёРЅС…СЂРѕРЅРЅС‹Р№; РІРѕР·РІСЂР°С‰Р°РµС‚ СЃС‚СЂРѕРєСѓ-СЃС‚Р°С‚СѓСЃ ("No Error" РїСЂРё СѓСЃРїРµС…Рµ)
    const status = seq.exportAsMediaDirect(source, audioPresetPath, workAreaType as WorkAreaType);
    if (new File(source).exists) return { source, dest };
    if (status) lastStatus = String(status);
  }
  throw new Error("Audio export failed" + (lastStatus ? ": " + lastStatus : ""));
};

// РёРЅРґРµРєСЃС‹ Р°СѓРґРёРѕС‚СЂРµРєРѕРІ, РєРѕС‚РѕСЂС‹Рµ РЅСѓР¶РЅРѕ РѕСЃС‚Р°РІРёС‚СЊ СЃР»С‹С€РёРјС‹РјРё РґР»СЏ СЂРµРЅРґРµСЂР° РІС‹РґРµР»РµРЅРёСЏ:
// Сѓ Р°СѓРґРёРѕРєР»РёРїР° вЂ” РµРіРѕ СЃРѕР±СЃС‚РІРµРЅРЅС‹Р№ С‚СЂРµРє, Сѓ РІРёРґРµРѕРєР»РёРїР° вЂ” С‚СЂРµРєРё РµРіРѕ Р»РёРЅРєРѕРІР°РЅРЅРѕРіРѕ Р°СѓРґРёРѕ.
// resolved=false вЂ” Р»РёРЅРєРѕРІР°РЅРЅРѕРµ Р°СѓРґРёРѕ РІС‹СЏСЃРЅРёС‚СЊ РЅРµ СѓРґР°Р»РѕСЃСЊ (getLinkedItems РїРѕСЏРІРёР»СЃСЏ
// РІ Premiere 15.4): С‚РѕРіРґР° Р»СѓС‡С€Рµ СЂРµРЅРґРµСЂРёС‚СЊ Р±РµР· solo, С‡РµРј Р»РѕР¶РЅРѕ РѕС‚РєР°Р·Р°С‚СЊ
const resolveAudioTrackIndices = (items: TrackItem[]): { indices: number[]; resolved: boolean } => {
  const map: { [key: number]: boolean } = {};
  let resolved = true;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    if (item.mediaType === "Audio") {
      map[item.parentTrackIndex] = true;
      continue;
    }
    if (typeof item.getLinkedItems !== "function") {
      resolved = false;
      continue;
    }
    // Adobe: getLinkedItems() returns null when the clip has no linked items —
    // reading .numItems on null → ExtendScript "null is not an object"
    const linked = item.getLinkedItems();
    if (!linked) continue;
    const n = linked.numItems;
    for (let j = 0; j < n; j++) {
      const l = linked[j];
      if (l && l.mediaType === "Audio") map[l.parentTrackIndex] = true;
    }
  }
  const indices: number[] = [];
  for (const key in map) indices.push(Number(key));
  return { indices, resolved };
};

// Premiere РЅРµ РґР°С‘С‚ РЅР°СЃС‚РѕСЏС‰РёР№ "solo" РёР· СЃРєСЂРёРїС‚Р° вЂ” СЌРјСѓР»РёСЂСѓРµРј РјСЊСЋС‚РѕРј РІСЃРµС…
// Р°СѓРґРёРѕС‚СЂРµРєРѕРІ, РєСЂРѕРјРµ РЅСѓР¶РЅС‹С…; РІРѕР·РІСЂР°С‰Р°РµРј С„СѓРЅРєС†РёСЋ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ РёСЃС…РѕРґРЅРѕРіРѕ СЃРѕСЃС‚РѕСЏРЅРёСЏ
const soloAudioTracks = (seq: Sequence, keepIndices: number[]) => {
  const keep: { [key: number]: boolean } = {};
  for (let i = 0; i < keepIndices.length; i++) keep[keepIndices[i]] = true;
  const saved: { index: number; muted: boolean }[] = [];
  for (let i = 0; i < seq.audioTracks.numTracks; i++) {
    const track = seq.audioTracks[i];
    if (!track) continue;
    saved.push({ index: i, muted: track.isMuted() });
    track.setMute(keep[i] ? 0 : 1);
  }
  return () => {
    for (let i = 0; i < saved.length; i++) {
      const track = seq.audioTracks[saved[i].index];
      if (track) track.setMute(saved[i].muted ? 1 : 0);
    }
  };
};

/** Sequence In/Out range — for generation cost UI (no export). */
export const getWorkRange = () => {
  try {
    const seq = app.project.activeSequence;
    if (!seq) {
      return {
        ok: false as const,
        reason: "NO_ACTIVE_SEQUENCE" as const,
        message: "Open a sequence in Premiere Pro, then try again.",
      };
    }
    let start = 0;
    let end = 0;
    try {
      const inTime = seq.getInPointAsTime();
      const outTime = seq.getOutPointAsTime();
      if (inTime) start = inTime.seconds;
      if (outTime) end = outTime.seconds;
    } catch (e) {
      return {
        ok: false as const,
        reason: "NO_INOUT" as const,
        message: "Could not read sequence In/Out points. Set In and Out, then try again.",
      };
    }
    if (!(end > start) || !isFinite(start) || !isFinite(end)) {
      return {
        ok: false as const,
        reason: "NO_INOUT" as const,
        message: "Set In and Out points on the sequence timeline, then try again.",
      };
    }
    return {
      ok: true as const,
      start,
      end,
      durationSeconds: end - start,
    };
  } catch (e: any) {
    return {
      ok: false as const,
      reason: "DESCRIBE_FAILED" as const,
      message: e && e.message ? String(e.message) : "Could not read sequence In/Out",
    };
  }
};

/** Export audio for sequence In→Out only (clip selection ignored). */
export const describe = (audioPresetPath?: string) => {
  try {
    const range = getWorkRange();
    if (!range.ok) return range;

    const seq = app.project.activeSequence;
    if (!seq) {
      return {
        ok: false as const,
        reason: "NO_ACTIVE_SEQUENCE" as const,
        message: "Open a sequence in Premiere Pro, then try again.",
      };
    }

    const { source, dest } = exportSequenceAudio(seq, audioPresetPath, ENCODE_IN_TO_OUT);
    // offset — In point; transcription timestamps are relative to it
    return {
      source,
      dest,
      offset: range.start,
      durationSeconds: range.durationSeconds,
      type: "composition" as const,
    };
  } catch (e: any) {
    let message = e && e.message ? String(e.message) : String(e);
    if (/null is not an object/i.test(message)) {
      message =
        "Could not export audio from the In/Out range. Check In/Out points and try again.";
    }
    return {
      ok: false as const,
      reason: "DESCRIBE_FAILED" as const,
      message: message || "Could not export audio from the sequence",
    };
  }
};

export interface SilenceRangeInput {
  start: number;
  end: number;
}

// Silence Cut помечает найденную тишину маркерами диапазона (start→end), а не
// вырезает её сама: официальный API Premiere не даёт безопасно razor+ripple
// через несколько треков разом (только недокументированный QE DOM), поэтому
// пользователь сам подтверждает и вырезает каждый отрезок штатным Ripple Delete.
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
export const markSilences = (data: { ranges: SilenceRangeInput[]; offset: number }) => {
  const seq = app.project.activeSequence;
  if (!seq) {
    alert("Open a sequence first");
    return null;
  }
  const ranges = (data && data.ranges) || [];
  const offset = (data && data.offset) || 0;
  try {
    let created = 0;
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      const start = Math.max(0, r.start + offset);
      const end = Math.max(start, r.end + offset);
      // createMarker's 3rd arg is duration in seconds — a range marker spanning
      // the silence, so Ripple Delete on it removes exactly what was detected.
      const marker = seq.markers.createMarker(start, "Silence", end - start, "");
      if (marker) created++;
    }
    return { created };
  } catch (e: any) {
    alert(e.message);
    return null;
  }
};

export interface ChapterMarkerInput {
  time: number;
  name: string;
}

// СЃС‚Р°РІРёРј РїРѕ РѕРґРЅРѕРјСѓ sequence-РјР°СЂРєРµСЂСѓ РЅР° РєР°Р¶РґСѓСЋ РіР»Р°РІСѓ (comments РЅРµ РёСЃРїРѕР»СЊР·СѓРµРј вЂ” С‚РѕР»СЊРєРѕ РёРјСЏ)
export const addMarkers = (data: { markers: ChapterMarkerInput[] }) => {
  const seq = app.project.activeSequence;
  if (!seq) {
    alert("Open a sequence first");
    return null;
  }
  const markers = (data && data.markers) || [];
  try {
    let created = 0;
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const marker = seq.markers.createMarker(Math.max(0, m.time), m.name || "Chapter", 0, "");
      if (marker) created++;
    }
    return { created };
  } catch (e: any) {
    alert(e.message);
    return null;
  }
};

// С‚РµРєСѓС‰Р°СЏ РїРѕР·РёС†РёСЏ РїР»РµР№С…РµРґР° вЂ” С„РѕСЂРјР° СЃРѕРІРїР°РґР°РµС‚ СЃ aeft (compId С‚Р°Рј, trackIndex Р·РґРµСЃСЊ)
export const getCurrentTime = () => {
  const seq = app.project.activeSequence;
  if (!seq) return null;
  return {
    time: seq.getPlayerPosition().seconds,
    compId: undefined as number | undefined,
    trackIndex: undefined as number | undefined,
  };
};

/** Parent folder of the saved .prproj, or null if the project is unsaved. */
export const getProjectFolderPath = (): string | null => {
  try {
    const raw = String(app.project.path || "");
    if (!raw || /not yet saved/i.test(raw)) return null;
    const file = new File(raw);
    if (!file.exists) return null;
    return file.parent ? file.parent.fsName : null;
  } catch (e) {
    return null;
  }
};

// РєР»РёРє РїРѕ caption РІ РїР°РЅРµР»Рё вЂ” РїРµСЂРµСЃС‚Р°РІР»СЏРµРј РїР»РµР№С…РµРґ Р°РєС‚РёРІРЅРѕР№ СЃРµРєРІРµРЅС†РёРё РЅР° РЅР°С‡Р°Р»Рѕ СЃРµРіРјРµРЅС‚Р°
export const setCurrentTime = ({ time }: { time: number }) => {
  const seq = app.project.activeSequence;
  if (!seq) return null;
  try {
    seq.setPlayerPosition(secondsToTime(time).ticks);
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

/** Scribe `words[]` (word + spacing) — packed v4 into captions_batch_01..15. */
const captionsRawDataJson = (caption: CaptionLayer): string => {
  if (caption.captionsRawData) return caption.captionsRawData;
  const words = caption.words && caption.words.length
    ? caption.words
    : [{ text: caption.text.replace(/\n/g, " "), timestamp: [0, Math.max(0.001, caption.timestamp[1] - caption.timestamp[0])] }];
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

export const createCaptions = (captions: CaptionLayer[]) => {
  const seq = app.project.activeSequence;
  if (!seq) {
    alert("Open a sequence first");
    return null;
  }
  const caption = captions[0];
  if (!caption) return { created: 0 };
  const mogrtPath = caption.mogrtPath;
  if (!mogrtPath) {
    alert("Caption style project (.mogrt) is not available. Run Transcribe after selecting a style.");
    return null;
  }

  const start = Number(caption.timestamp[0]) || 0;
  let end = Number(caption.timestamp[1]);
  if (isNaN(end) || end <= start) end = start + 0.05;
  const duration = end - start;
  const tracksBefore = seq.videoTracks.numTracks;
  const trackIndex = findFreeVideoTrack(seq, start, duration, 1);
  const captionsName = getNextCaptionsName(seq, seq.name);
  let trackWasEmpty = seq.videoTracks.numTracks > tracksBefore;
  try {
    trackWasEmpty = trackWasEmpty || seq.videoTracks[trackIndex].clips.numItems === 0;
  } catch (e) {
    // ignore
  }
  if (trackWasEmpty) {
    try {
      seq.videoTracks[trackIndex].name = captionsName;
    } catch (e) {
      // ignore
    }
  }

  try {
    const startTicks = secondsToTime(start).ticks;
    const trackItem = seq.importMGT(mogrtPath, startTicks, trackIndex, 0);
    if (!trackItem) return { created: 0, trackIndex };

    trackItem.end = secondsToTime(end);
    trackItem.name = captionsName;
    fillMogrtSystemProps(trackItem, {
      captionChunks: caption.captionChunks,
      captionsRawData: captionsRawDataJson(caption),
      segmentType: caption.segmentType,
      lineCount: caption.lineCount,
      charsPerLine: caption.charsPerLine,
      compositionHeight: seq.frameSizeVertical,
    });
    fitCaptionMogrtHeight(trackItem, seq.frameSizeVertical, 2048);

    return {
      created: 1,
      trackIndex,
      sequenceId: undefined as string | undefined,
      compId: undefined as number | undefined,
      sourceCompId: undefined as number | undefined,
    };
  } catch (e: any) {
    alert(e && e.message ? e.message : String(e));
    return null;
  }
};

interface UpdateCaptionText {
  trackIndex?: number;
  clipIndex?: number;
  compId?: number;
  captionIndex?: number;
  /** Premiere nested captions sequence nodeId (from createCaptions). */
  sequenceId?: string;
  text: string;
  captionsRawData?: string;
  captionChunks?: string[];
}

const SESSION_MARKER_NAME = "__mf_caption_session__";
const SESSION_MARKER_TAG = "mf-caption-data";

const findSequenceByNodeId = (nodeId: string): Sequence | null => {
  if (!nodeId) return null;
  try {
    const sequences = app.project.sequences;
    for (let i = 0; i < sequences.numSequences; i++) {
      try {
        if (String(sequences[i].projectItem.nodeId) === String(nodeId)) {
          return sequences[i];
        }
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
};

const resolveCaptionSequence = (sequenceId?: string): Sequence | null => {
  if (sequenceId) {
    const nested = findSequenceByNodeId(sequenceId);
    if (nested) return nested;
  }
  return app.project.activeSequence || null;
};

const findSessionMarker = (seq: Sequence): Marker | null => {
  try {
    const markers = seq.markers;
    if (!markers || markers.numMarkers < 1) return null;
    let m = markers.getFirstMarker();
    while (m) {
      if (String(m.name) === SESSION_MARKER_NAME) return m;
      try {
        const comments = String(m.comments || "");
        if (comments.indexOf(SESSION_MARKER_TAG) === 0 || comments.indexOf('{"data"') === 0) {
          return m;
        }
      } catch (e) {
        // ignore
      }
      m = markers.getNextMarker(m);
    }
  } catch (e) {
    // ignore
  }
  return null;
};

const writeSessionMarker = (seq: Sequence, json: string): boolean => {
  try {
    const existing = findSessionMarker(seq);
    if (existing) {
      existing.comments = json;
      existing.name = SESSION_MARKER_NAME;
      return true;
    }
    seq.markers.createMarker(0, SESSION_MARKER_NAME, 0, json);
    return true;
  } catch (e) {
    return false;
  }
};

export const updateCaptionText = ({
  trackIndex,
  sequenceId,
  captionsRawData,
  captionChunks,
}: UpdateCaptionText) => {
  const seq = resolveCaptionSequence(sequenceId);
  if (!seq || trackIndex == null) return null;
  try {
    const track = seq.videoTracks[trackIndex];
    if (!track) return null;
    const clips = collectCaptionClips(track);
    const trackItem = clips[0];
    if (!trackItem) return null;
    if ((captionChunks && captionChunks.length) || captionsRawData) {
      fillMogrtCaptionChunks(trackItem, captionChunks, captionsRawData);
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

/**
 * РџРµСЂРµСЃР±РѕСЂРєР° captions РїРѕСЃР»Рµ СЃРјРµРЅС‹ СЂР°Р·Р±РёРІРєРё (Update РІ РїР°РЅРµР»Рё): СЃРѕ СЃС‚Р°СЂРѕРіРѕ
 * РїРµСЂРІРѕРіРѕ РєР»РёРїР° СЃРЅРёРјР°РµРј СЃРЅР°РїС€РѕС‚ СЃС‚РёР»РµРІС‹С… Р·РЅР°С‡РµРЅРёР№ (СЂРµС„РµСЂРµРЅСЃ РїСЂР°РІРѕРє РёР· Styles),
 * СѓРґР°Р»СЏРµРј РІСЃРµ caption-РєР»РёРїС‹ С‚СЂРµРєР° Рё РІСЃС‚Р°РІР»СЏРµРј РЅРѕРІС‹Рµ РїРѕ СЃРІРµР¶РµР№ СЂР°Р·Р±РёРІРєРµ,
 * РІРѕР·РІСЂР°С‰Р°СЏ РЅР° РЅРёС… СЃС‚РёР»Рё Рё System-С‚РµРєСЃС‚С‹. Р§СѓР¶РёРµ РєР»РёРїС‹ РЅР° С‚СЂРµРєРµ РЅРµ С‚СЂРѕРіР°РµРј.
 * compId вЂ” AE-РїРѕР»Рµ, Р·РґРµСЃСЊ РЅРµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ.
 * sequenceId вЂ” nested captions sequence (РµСЃР»Рё createCaptions СЃРґРµР»Р°Р» Nest).
 */
export const resegmentCaptions = (payload: {
  compId?: number;
  trackIndex?: number;
  sequenceId?: string;
  captions: CaptionLayer[];
}): { updated: boolean; created: number } | null => {
  try {
    const seq = resolveCaptionSequence(payload && payload.sequenceId);
    const captions = payload && payload.captions;
    if (!seq || !captions || !captions.length) return null;

    const caption = captions[0];
    const trackIndex = findCaptionTrackIndex(seq, payload.trackIndex);
    if (trackIndex < 0) return null;
    const track = seq.videoTracks[trackIndex];
    const clips = collectCaptionClips(track);
    if (!clips.length) return null;

    fillMogrtSystemProps(clips[0], {
      captionChunks: caption.captionChunks,
      captionsRawData: captionsRawDataJson(caption),
      segmentType: caption.segmentType,
      lineCount: caption.lineCount,
      charsPerLine: caption.charsPerLine,
      compositionHeight: seq.frameSizeVertical,
    });
    fitCaptionMogrtHeight(clips[0], seq.frameSizeVertical, 2048);
    for (let i = 1; i < clips.length; i++) {
      try {
        clips[i].remove(false, false);
      } catch (e) {
        // ignore leftover clips
      }
    }
    return { updated: true, created: 1 };
  } catch (e: any) {
    alert(e && e.message ? e.message : String(e));
    return null;
  }
};

/** CEP writes UTF-8 JSON and passes the path вЂ” avoids Cyrillic corruption in evalScript. */
export const resegmentCaptionsFromFile = (jsonPath: string) => {
  try {
    const payload = readJsonUtf8(jsonPath) as {
      compId?: number;
      trackIndex?: number;
      sequenceId?: string;
      captions: CaptionLayer[];
    };
    return resegmentCaptions(payload);
  } catch (e: any) {
    alert(e && e.message ? e.message : String(e));
    return null;
  }
};

// Session marker on nested captions sequence (Premiere analogue of AE marker layer).
// Payload shape intersects with aeft.ts (compId) so evalTS typing stays valid.
export const saveSessionData = (payload: {
  compId?: number;
  sequenceId?: string;
  json: string;
}): { saved: boolean } | null => {
  try {
    if (!payload || !payload.json) return null;
    const seq = payload.sequenceId
      ? findSequenceByNodeId(payload.sequenceId)
      : app.project.activeSequence;
    if (!seq) return null;
    if (!writeSessionMarker(seq, payload.json)) return null;
    return { saved: true };
  } catch (e) {
    return null;
  }
};

/**
 * Load availability: РІС‹Р±СЂР°РЅРЅС‹Р№ nest СЃ caption-mogrt'Р°РјРё, Р»РёР±Рѕ Р°РєС‚РёРІРЅР°СЏ
 * captions-СЃРµРєРІРµРЅС†РёСЏ (РѕС‚РєСЂС‹Р»Рё nest). Р‘РµР· session-РјР°СЂРєРµСЂРѕРІ Рё Р±РµР· В«РїРѕСЃР»РµРґРЅРµР№ СЃРµСЃСЃРёРёВ».
 */
export const findAppliedCaptions = (): {
  compId?: number;
  sequenceId?: string;
  sessionData: string;
  hasCaptions: boolean;
} | null => {
  try {
    const target = resolveLoadTargetSequence();
    if (!target) return null;
    let sessionData = "";
    try {
      const marker = findSessionMarker(target.seq);
      if (marker) sessionData = String(marker.comments || "");
    } catch (e) {
      sessionData = "";
    }
    return {
      sequenceId: target.sequenceId,
      sessionData,
      hasCaptions: true,
    };
  } catch (e) {
    return null;
  }
};

type TimelineCaptionSegment = {
  text: string;
  timestamp: [number, number];
};

/**
 * Load: ровно один выделенный MGT. Иначе null (тихая ошибка в панели).
 * Packed captions_batch_* + Segment Type / Line Count / Chars Per Line с клипа.
 */
export const loadCaptionsFromTimeline = (): {
  compId?: number;
  sequenceId?: string;
  trackIndex?: number;
  segments: TimelineCaptionSegment[];
  segmentType?: number;
  lineCount?: number;
  charsPerLine?: number;
} | null => {
  try {
    const active = app.project.activeSequence;
    if (!active) return null;
    let selection: TrackItem[] | null = null;
    try {
      selection = active.getSelection();
    } catch (e) {
      return null;
    }
    if (!selection || selection.length !== 1) return null;
    const clip = selection[0];
    let isMgt = false;
    try {
      isMgt = !!clip.isMGT();
    } catch (e) {
      return null;
    }
    if (!isMgt) return null;

    const segments = readMogrtCaptionSegments(clip);
    if (!segments.length) return null;

    let sequenceId = "";
    try {
      sequenceId = String(active.projectItem.nodeId);
    } catch (e) {
      sequenceId = "";
    }
    if (!sequenceId) return null;

    const pproSegment = readMogrtNumber(clip, CAPTION_SYSTEM.segmentType);
    const lineCount = readMogrtNumber(clip, CAPTION_SYSTEM.lineCount);
    const charsPerLine = readMogrtNumber(clip, CAPTION_SYSTEM.charsPerLine);

    return {
      sequenceId,
      trackIndex: findClipTrackIndex(active, clip),
      segments,
      segmentType: pproSegment == null ? undefined : Math.floor(pproSegment) + 1,
      lineCount: lineCount == null ? undefined : lineCount,
      charsPerLine: charsPerLine == null ? undefined : charsPerLine,
    };
  } catch (e) {
    return null;
  }
};

const findClipTrackIndex = (seq: Sequence, clip: TrackItem): number => {
  let startTicks = "";
  let clipName = "";
  try {
    startTicks = String(clip.start.ticks);
    clipName = String(clip.name || "");
  } catch (e) {
    return 0;
  }
  for (let t = 0; t < seq.videoTracks.numTracks; t++) {
    const clips = seq.videoTracks[t].clips;
    for (let c = 0; c < clips.numItems; c++) {
      try {
        if (String(clips[c].start.ticks) === startTicks && String(clips[c].name || "") === clipName) {
          return t;
        }
      } catch (e) {
        // skip
      }
    }
  }
  return 0;
};

const resolveLoadTargetSequence = (): { seq: Sequence; sequenceId: string } | null => {
  const active = app.project.activeSequence;
  if (!active) return null;

  try {
    const selection = active.getSelection();
    for (let i = 0; i < selection.length; i++) {
      try {
        const pi = selection[i].projectItem;
        if (!pi || !pi.isSequence()) continue;
        const sequenceId = String(pi.nodeId);
        const nested = findSequenceByNodeId(sequenceId);
        if (!nested) continue;
        if (findCaptionTrackIndex(nested) < 0) continue;
        return { seq: nested, sequenceId };
      } catch (e) {
        // ignore clip
      }
    }
  } catch (e) {
    // ignore
  }

  // Р°РєС‚РёРІРЅР°СЏ СЃРµРєРІРµРЅС†РёСЏ СЃР°РјР° СЃРѕРґРµСЂР¶РёС‚ captions (РѕС‚РєСЂС‹С‚ nest)
  if (findCaptionTrackIndex(active) >= 0) {
    let sequenceId = "";
    try {
      sequenceId = String(active.projectItem.nodeId);
    } catch (e) {
      return null;
    }
    if (!sequenceId) return null;
    return { seq: active, sequenceId };
  }

  return null;
};

interface ApplyStyleProjectPayload {
  styleId: string;
  styleName: string;
  aepPath?: string;
  mogrtPath?: string;
  values?: Record<string, unknown>;
}

/**
 * Import/place a downloaded caption style project in Premiere.
 * Panel already verified access and downloaded the package — local paths
 * arrive here. Places the mogrt/prproj on a fresh top track at the playhead
 * (no active sequence required for a plain project import). `values` are
 * applied later to the actual caption clips via `applyCaptionStyleValues`,
 * not at this import step.
 */
export const applyStyleProject = (payload: ApplyStyleProjectPayload) => {
  const filePath = payload.mogrtPath || payload.aepPath;
  if (!filePath) return { applied: false, reason: "no_project_file" };

  const result = applyPackItem({
    ctype: payload.mogrtPath ? "MOGRT" : "PROJECT",
    filePath,
    itemName: payload.styleName,
    binName: stylesBinName,
  });

  if (!result.applied) return { applied: false, reason: result.reason };
  return { applied: true };
};

/**
 * Apply style values to caption clips in the active sequence.
 * Caption mogrts are identified by captions_batch_01 (legacy: Captions_Raw_Data).
 * compId is AE-only and ignored here.
 */
export const applyCaptionStyleValues = (payload: {
  compId?: number;
  sequenceId?: string;
  trackIndex?: number;
  props: { path: string[]; type: number; value: unknown }[];
}) => {
  try {
    const seq = resolveCaptionSequence(payload && payload.sequenceId);
    if (!seq || !payload || !payload.props || !payload.props.length) return { updated: 0 };
    const trackIndex = findCaptionTrackIndex(seq, payload.trackIndex);
    if (trackIndex < 0) return { updated: 0 };
    const clips = collectCaptionClips(seq.videoTracks[trackIndex]);
    let updated = 0;
    for (let c = 0; c < clips.length; c++) {
      if (applyMogrtStyleProps(clips[c], payload.props) > 0) updated++;
    }
    return { updated };
  } catch (e: any) {
    return { updated: 0, error: String(e && e.message ? e.message : e) };
  }
};
