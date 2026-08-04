export { importMedia, importVoiceoverAudio } from "./ppro-import-media";
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
import {
  applyMogrtSnapshot,
  applyMogrtStyleProps,
  collectCaptionClips,
  dumpMogrtParams,
  ensureTopVideoTrack,
  fillFirstMogrtText,
  fillMogrtSystemProps,
  fillMogrtText,
  findCaptionTrackIndex,
  getNextCaptionsName,
  isCaptionMogrtClip,
  readMogrtText,
  secondsToTime,
  snapshotMogrtStyle,
  type MogrtMatchDebug,
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
    if (item.mediaType === "Audio") {
      map[item.parentTrackIndex] = true;
      continue;
    }
    if (typeof item.getLinkedItems !== "function") {
      resolved = false;
      continue;
    }
    const linked = item.getLinkedItems();
    for (let j = 0; j < linked.numItems; j++) {
      const l = linked[j];
      if (l.mediaType === "Audio") map[l.parentTrackIndex] = true;
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
    saved.push({ index: i, muted: track.isMuted() });
    track.setMute(keep[i] ? 0 : 1);
  }
  return () => {
    for (let i = 0; i < saved.length; i++) {
      seq.audioTracks[saved[i].index].setMute(saved[i].muted ? 1 : 0);
    }
  };
};

// РѕРґРёРЅ Describe: Р±РµР· РІС‹РґРµР»РµРЅРёСЏ вЂ” СЂРµРЅРґРµСЂРёРј РІСЃСЋ СЃРµРєРІРµРЅС†РёСЋ; СЃ РІС‹РґРµР»РµРЅРёРµРј вЂ”
// РѕС‚ inPoint РїРµСЂРІРѕРіРѕ РєР»РёРїР° РґРѕ outPoint РїРѕСЃР»РµРґРЅРµРіРѕ, СЃРѕР»Рѕ С‚РѕР»СЊРєРѕ РЅР° РµРіРѕ Р·РІСѓРєРµ
export const describe = (audioPresetPath?: string) => {
  try {
    const seq = app.project.activeSequence;
    if (!seq) {
      alert("Open a sequence first");
      return null;
    }

    const selection = seq.getSelection();
    if (!selection || selection.length === 0) {
      const { source, dest } = exportSequenceAudio(seq, audioPresetPath, ENCODE_ENTIRE);
      // offset вЂ” С‚РѕС‡РєР° СЃС‚Р°СЂС‚Р° СЂРµРЅРґРµСЂР° РІ С‚Р°Р№РјР»Р°Р№РЅРµ; С‚Р°Р№РјРєРѕРґС‹ С‚СЂР°РЅСЃРєСЂРёРїС†РёРё РѕС‚ РЅРµС‘
      return { source, dest, offset: 0, type: "composition" as const };
    }

    let start = Infinity;
    let end = -Infinity;
    for (const item of selection) {
      if (item.start.seconds < start) start = item.start.seconds;
      if (item.end.seconds > end) end = item.end.seconds;
    }

    const audio = resolveAudioTrackIndices(selection);
    if (!audio.indices.length && audio.resolved) {
      alert("Selected clip has no audio");
      return null;
    }

    const savedIn = seq.getInPointAsTime().seconds;
    const savedOut = seq.getOutPointAsTime().seconds;
    seq.setInPoint(start);
    seq.setOutPoint(end);
    // РЅРµ СЃРјРѕРіР»Рё РѕРїСЂРµРґРµР»РёС‚СЊ Р»РёРЅРєРѕРІР°РЅРЅРѕРµ Р°СѓРґРёРѕ вЂ” СЂРµРЅРґРµСЂРёРј РґРёР°РїР°Р·РѕРЅ Р±РµР· solo
    const restoreAudio = audio.indices.length
      ? soloAudioTracks(seq, audio.indices)
      : () => {};
    let source: string, dest: string;
    try {
      ({ source, dest } = exportSequenceAudio(seq, audioPresetPath, ENCODE_IN_TO_OUT));
    } finally {
      seq.setInPoint(savedIn);
      seq.setOutPoint(savedOut);
      restoreAudio();
    }
    // offset РЅР° СЃС‚Р°СЂС‚ РІС‹РґРµР»РµРЅРёСЏ вЂ” С‚Р°Р№РјРєРѕРґС‹ С‚СЂР°РЅСЃРєСЂРёРїС†РёРё РѕС‚ РЅРµРіРѕ
    return { source, dest, offset: start, type: "selected" as const };
  } catch (e: any) {
    alert(e.message);
    return null;
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
export const createCaptionsFromFile = (_jsonPath: string) => ({
  created: 0,
  reason: "PPRO_USE_createCaptions",
});
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
}

const timingsJson = (caption: CaptionLayer): string => {
  const words = caption.words && caption.words.length
    ? caption.words
    : [{ text: caption.text.replace(/\n/g, " "), timestamp: [0, Math.max(0.001, caption.timestamp[1] - caption.timestamp[0])] }];
  return JSON.stringify(words);
};

// СЃРѕР·РґР°С‘Рј РїРѕ РѕРґРЅРѕРјСѓ СЌРєР·РµРјРїР»СЏСЂСѓ MOGRT РЅР° РєР°Р¶РґС‹Р№ caption,
// System: Main text / Highlight text / timings.
// Р—Р°С‚РµРј Nest: createSubsequence СЃР°Рј РїРѕ СЃРµР±Рµ РќР• РєР»Р°РґС‘С‚ nest РЅР° С‚Р°Р№РјР»Р°Р№РЅ
// (СЃРј. Premiere Scripting Guide) вЂ” РЅСѓР¶РµРЅ overwriteClip РѕР±СЂР°С‚РЅРѕ РЅР° С‚СЂРµРє.
export const createCaptions = (captions: CaptionLayer[]) => {
  const seq = app.project.activeSequence;
  if (!seq) {
    alert("Open a sequence first");
    return null;
  }
  if (!captions.length) return { created: 0 };
  const mogrtPath = captions[0].mogrtPath;
  if (!mogrtPath) {
    alert("Caption style project (.mogrt) is not available. Run Transcribe after selecting a style.");
    return null;
  }

  const trackIndex = ensureTopVideoTrack();
  const captionsName = getNextCaptionsName(seq, seq.name);
  try {
    seq.videoTracks[trackIndex].name = captionsName;
  } catch (e) {
    // ignore
  }

  try {
    let created = 0;
    const createdClips: TrackItem[] = [];
    for (let i = 0; i < captions.length; i++) {
      const caption = captions[i];
      const startTicks = secondsToTime(caption.timestamp[0]).ticks;
      const trackItem = seq.importMGT(mogrtPath, startTicks, trackIndex, 0);
      if (!trackItem) continue;
      trackItem.end = secondsToTime(caption.timestamp[1]);
      trackItem.name = caption.text.split("\n").join(" ");
      fillMogrtSystemProps(trackItem, caption.text, timingsJson(caption));
      createdClips.push(trackItem);
      created++;
    }

    let sequenceId: string | undefined;
    let nestedTrackIndex = trackIndex;

    if (createdClips.length > 0) {
      const nestResult = nestCaptionClips(seq, createdClips, trackIndex, captionsName);
      if (nestResult) {
        sequenceId = nestResult.sequenceId;
        nestedTrackIndex = nestResult.trackIndex;
      }
    }

    return {
      created,
      trackIndex: nestedTrackIndex,
      sequenceId,
      compId: undefined as number | undefined,
      sourceCompId: undefined as number | undefined,
    };
  } catch (e: any) {
    alert(e && e.message ? e.message : String(e));
    return null;
  }
};

/**
 * Nest caption clips into a subsequence and place it on the timeline.
 * Premiere createSubsequence() only builds a new sequence from In/Out вЂ” it does
 * not replace the selection. Official pattern: set In/Out -> createSubsequence ->
 * overwriteClip(projectItem) on the captions track.
 */
const nestCaptionClips = (
  seq: Sequence,
  clips: TrackItem[],
  trackIndex: number,
  captionsName: string,
): { sequenceId?: string; trackIndex: number } | null => {
  let startSec = clips[0].start.seconds;
  let endSec = clips[0].end.seconds;
  for (let i = 1; i < clips.length; i++) {
    const s = clips[i].start.seconds;
    const e = clips[i].end.seconds;
    if (s < startSec) startSec = s;
    if (e > endSec) endSec = e;
  }
  if (!(endSec > startSec)) endSec = startSec + 0.05;

  let oldIn = 0;
  let oldOut = 0;
  try {
    oldIn = seq.getInPointAsTime().seconds;
    oldOut = seq.getOutPointAsTime().seconds;
  } catch (e) {
    // ignore
  }

  // Targeting: only the captions video track (and no audio), so the nest
  // does not swallow the footage underneath.
  const videoTargeted: boolean[] = [];
  const audioTargeted: boolean[] = [];
  try {
    for (let i = 0; i < seq.videoTracks.numTracks; i++) {
      let was = false;
      try {
        was = !!seq.videoTracks[i].isTargeted();
      } catch (e) {
        // ignore
      }
      videoTargeted.push(was);
      try {
        seq.videoTracks[i].setTargeted(i === trackIndex, false);
      } catch (e) {
        // ignore
      }
    }
    for (let i = 0; i < seq.audioTracks.numTracks; i++) {
      let was = false;
      try {
        was = !!seq.audioTracks[i].isTargeted();
      } catch (e) {
        // ignore
      }
      audioTargeted.push(was);
      try {
        seq.audioTracks[i].setTargeted(false, false);
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }

  try {
    seq.setInPoint(startSec);
    seq.setOutPoint(endSec);
  } catch (e) {
    // ignore
  }

  let nested: Sequence | null = null;
  try {
    // false = respect track targeting (captions track only)
    nested = seq.createSubsequence(false);
  } catch (e) {
    try {
      nested = seq.createSubsequence(true);
    } catch (e2) {
      nested = null;
    }
  }

  let sequenceId: string | undefined;
  let nestedTrackIndex = trackIndex;

  if (nested) {
    try {
      nested.name = captionsName;
    } catch (e) {
      // ignore
    }
    try {
      sequenceId = String(nested.projectItem.nodeId);
    } catch (e) {
      // ignore
    }
    nestedTrackIndex = Math.max(0, nested.videoTracks.numTracks - 1);
    try {
      nested.videoTracks[nestedTrackIndex].name = captionsName;
    } catch (e) {
      // ignore
    }

    // Put nest on the main timeline (this is the actual "Nest" step)
    try {
      seq.videoTracks[trackIndex].overwriteClip(nested.projectItem, startSec);
    } catch (e) {
      // subsequence exists in Project, but timeline replace failed
    }

    // Remove leftover individual caption mogrts on this track (keep the nest)
    try {
      const track = seq.videoTracks[trackIndex];
      for (let i = track.clips.numItems - 1; i >= 0; i--) {
        const clip = track.clips[i];
        let isNest = false;
        try {
          const pi = clip.projectItem;
          isNest = !!(pi && pi.isSequence && pi.isSequence());
        } catch (e) {
          // ignore
        }
        if (isNest) continue;
        try {
          if (isCaptionMogrtClip(clip)) {
            clip.remove(false, false);
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }
  }

  try {
    seq.setInPoint(oldIn);
    seq.setOutPoint(oldOut);
  } catch (e) {
    // ignore
  }

  try {
    for (let i = 0; i < videoTargeted.length; i++) {
      try {
        seq.videoTracks[i].setTargeted(videoTargeted[i], false);
      } catch (e) {
        // ignore
      }
    }
    for (let i = 0; i < audioTargeted.length; i++) {
      try {
        seq.audioTracks[i].setTargeted(audioTargeted[i], false);
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }

  if (!nested) return null;
  return { sequenceId, trackIndex: nestedTrackIndex };
};

interface UpdateCaptionText {
  trackIndex?: number;
  clipIndex?: number;
  compId?: number;
  captionIndex?: number;
  /** Premiere nested captions sequence nodeId (from createCaptions). */
  sequenceId?: string;
  text: string;
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

export const updateCaptionText = ({ trackIndex, clipIndex, sequenceId, text }: UpdateCaptionText) => {
  const seq = resolveCaptionSequence(sequenceId);
  if (!seq || trackIndex == null || clipIndex == null) return null;
  try {
    const track = seq.videoTracks[trackIndex];
    if (!track) return null;
    const trackItem = track.clips[clipIndex];
    if (!trackItem) return null;
    trackItem.name = text.split("\n").join(" ");
    if (!fillMogrtText(trackItem, "Main text", text)) {
      fillFirstMogrtText(trackItem, text);
    } else {
      fillMogrtText(trackItem, "Highlight text", text);
    }
    return { updated: true };
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
    const mogrtPath = captions[0].mogrtPath;
    if (!mogrtPath || !new File(mogrtPath).exists) {
      alert("Caption style project (.mogrt) is not available. Select a style and try again.");
      return null;
    }

    const trackIndex = findCaptionTrackIndex(seq, payload.trackIndex);
    if (trackIndex < 0) return null;
    const track = seq.videoTracks[trackIndex];
    const clips = collectCaptionClips(track);

    // СЂРµС„РµСЂРµРЅСЃ СЃС‚РёР»РµР№ вЂ” РїРµСЂРІС‹Р№ РєР»РёРї; СЃРЅР°РїС€РѕС‚ РІ РїР°РјСЏС‚СЊ РґРѕ СѓРґР°Р»РµРЅРёСЏ
    const snapshot = snapshotMogrtStyle(clips[0]);

    for (let i = clips.length - 1; i >= 0; i--) {
      try {
        clips[i].remove(false, false);
      } catch (e) {
        // РєР»РёРї РјРѕРі Р±С‹С‚СЊ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ вЂ” РѕСЃС‚Р°РІР»СЏРµРј, РЅРѕРІС‹Рµ Р»СЏРіСѓС‚ РїРѕРІРµСЂС…
      }
    }

    let created = 0;
    for (let i = 0; i < captions.length; i++) {
      const caption = captions[i];
      let start = Number(caption.timestamp[0]);
      let end = Number(caption.timestamp[1]);
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end <= start) end = start + 0.05;
      const startTicks = secondsToTime(start).ticks;
      const trackItem = seq.importMGT(mogrtPath, startTicks, trackIndex, 0);
      if (!trackItem) continue;
      trackItem.end = secondsToTime(end);
      trackItem.name = caption.text.split("\n").join(" ");
      fillMogrtSystemProps(trackItem, caption.text, timingsJson(caption));
      applyMogrtSnapshot(trackItem, snapshot);
      created++;
    }
    return { updated: true, created };
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
    return {
      sequenceId: target.sequenceId,
      sessionData: "",
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
 * Load: Р·Р°Р№С‚Рё РІ РІС‹Р±СЂР°РЅРЅС‹Р№ nest (РёР»Рё Р°РєС‚РёРІРЅСѓСЋ captions-seq), СЃРѕР±СЂР°С‚СЊ РІСЃРµ caption
 * mogrt'С‹ РїРѕ РІСЂРµРјРµРЅРё вЂ” С‚РµРєСЃС‚ + start/end. Р­С‚Рѕ РёСЃС‚РѕС‡РЅРёРє РїСЂР°РІРґС‹ РґР»СЏ РїР°РЅРµР»Рё,
 * РЅРµ localStorage Рё РЅРµ session marker.
 */
export const loadCaptionsFromTimeline = (): {
  compId?: number;
  sequenceId?: string;
  trackIndex?: number;
  segments: TimelineCaptionSegment[];
} | null => {
  try {
    const target = resolveLoadTargetSequence();
    if (!target) return null;
    const trackIndex = findCaptionTrackIndex(target.seq);
    if (trackIndex < 0) return null;
    const clips = collectCaptionClips(target.seq.videoTracks[trackIndex]);
    // sort by start time (ExtendScript вЂ” Р±РµР· Array.sort comparator РЅР°РґС‘Р¶РЅРµРµ bubble)
    for (let i = 0; i < clips.length; i++) {
      for (let j = i + 1; j < clips.length; j++) {
        if (clips[j].start.seconds < clips[i].start.seconds) {
          const tmp = clips[i];
          clips[i] = clips[j];
          clips[j] = tmp;
        }
      }
    }
    const segments: TimelineCaptionSegment[] = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      let start = Number(clip.start.seconds);
      let end = Number(clip.end.seconds);
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end <= start) end = start + 0.05;
      const text = readMogrtText(clip).split("\n").join(" ").replace(/^\s+|\s+$/g, "");
      segments.push({
        text: text || String(clip.name || "Caption"),
        timestamp: [start, end],
      });
    }
    if (!segments.length) return null;
    return {
      sequenceId: target.sequenceId,
      trackIndex,
      segments,
    };
  } catch (e) {
    return null;
  }
};

/** Р’С‹Р±СЂР°РЅРЅС‹Р№ nest РЅР° Р°РєС‚РёРІРЅРѕРј С‚Р°Р№РјР»Р°Р№РЅРµ, РёРЅР°С‡Рµ Р°РєС‚РёРІРЅР°СЏ seq РµСЃР»Рё РІ РЅРµР№ РµСЃС‚СЊ captions. */
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
    binName: "Spunkram Styles",
  });

  if (!result.applied) return { applied: false, reason: result.reason };
  return { applied: true };
};

/**
 * РџСЂРёРјРµРЅРµРЅРёРµ style values РєРѕ РІСЃРµРј caption-РєР»РёРїР°Рј Р°РєС‚РёРІРЅРѕР№ СЃРµРєРІРµРЅС†РёРё.
 * РќР°С€Рё РєР»РёРїС‹ РІС‹С‡Р»РµРЅСЏРµРј РїРѕ System-СЃРІРѕР№СЃС‚РІСѓ "timings" РІ MGT-РєРѕРјРїРѕРЅРµРЅС‚Рµ вЂ”
 * РїРѕСЃС‚РѕСЂРѕРЅРЅРёРµ mogrt РІ РїСЂРѕРµРєС‚Рµ РЅРµ С‚СЂРѕРіР°РµРј. compId вЂ” AE-РїРѕР»Рµ, Р·РґРµСЃСЊ РЅРµ РЅСѓР¶РЅРѕ.
 */
export const applyCaptionStyleValues = (payload: {
  compId?: number;
  sequenceId?: string;
  props: { path: string[]; type: number; value: unknown }[];
}) => {
  try {
    const seq = resolveCaptionSequence(payload && payload.sequenceId);
    if (!seq || !payload || !payload.props || !payload.props.length) return { updated: 0 };
    let updated = 0;
    // РґРёР°РіРЅРѕСЃС‚РёРєР° РїРµСЂРІРѕРіРѕ caption-РєР»РёРїР°: РїР°СЂР°РјРµС‚СЂС‹ mogrt + СЂРµР·СѓР»СЊС‚Р°С‚ РјР°С‚С‡РёРЅРіР° вЂ”
    // РїРёС€РµС‚СЃСЏ РІ %TEMP%/captions_cep/style_apply_debug.json РЅР° РєР°Р¶РґС‹Р№ РІС‹Р·РѕРІ
    let debugParams: { i: number; name: string; raw: string }[] | null = null;
    let debugMatches: MogrtMatchDebug[] | null = null;
    for (let t = 0; t < seq.videoTracks.numTracks; t++) {
      const track = seq.videoTracks[t];
      for (let c = 0; c < track.clips.numItems; c++) {
        const clip = track.clips[c];
        if (!isCaptionMogrtClip(clip)) continue;
        const collect = debugMatches === null;
        const matches: MogrtMatchDebug[] = [];
        if (applyMogrtStyleProps(clip, payload.props, collect ? matches : undefined) > 0) updated++;
        if (collect) {
          debugMatches = matches;
          debugParams = dumpMogrtParams(clip);
        }
      }
    }
    writeStyleDebug({
      // РјР°СЂРєРµСЂ РІРµСЂСЃРёРё jsx-РєРѕРґР° вЂ” РїРѕ РЅРµРјСѓ РІРёРґРЅРѕ, С‡С‚Рѕ С…РѕСЃС‚ РїРѕРґС…РІР°С‚РёР» СЃРІРµР¶РёР№ Р±РёР»Рґ
      debugVersion: 4,
      updated,
      props: payload.props,
      params: debugParams,
      matches: debugMatches,
    });
    return { updated };
  } catch (e: any) {
    return { updated: 0, error: String(e && e.message ? e.message : e) };
  }
};

// РґР°РјРї РїРѕСЃР»РµРґРЅРµРіРѕ РїСЂРёРјРµРЅРµРЅРёСЏ СЃС‚РёР»РµР№ вЂ” С‡РёС‚Р°РµС‚СЃСЏ СЃРЅР°СЂСѓР¶Рё РґР»СЏ РѕС‚Р»Р°РґРєРё РјР°С‚С‡РёРЅРіР°
const writeStyleDebug = (data: unknown) => {
  try {
    const dir = new Folder(Folder.temp.fsName + "/captions_cep");
    if (!dir.exists) dir.create();
    const f = new File(dir.fsName + "/style_apply_debug.json");
    f.encoding = "UTF-8";
    f.open("w");
    f.write(JSON.stringify(data as object));
    f.close();
  } catch (e) {
    // РґРёР°РіРЅРѕСЃС‚РёРєР° РЅРµ РґРѕР»Р¶РЅР° Р»РѕРјР°С‚СЊ РѕСЃРЅРѕРІРЅРѕР№ С„Р»РѕСѓ
  }
};
