import {
  CAPTION_BATCH_COUNT,
  CAPTION_SYSTEM,
  CEP_WRITTEN_SYSTEM_NAMES,
  captionBatchLayerName,
  packedCaptionsDisplayText,
  resolveCaptionChunks,
  unpackCaptionChunks,
  unpackCaptions,
} from "../../shared/caption-system";

// ProjectItem Helpers

export const forEachChild = (
  item: ProjectItem,
  callback: (item: ProjectItem) => void
) => {
  const len = item.children.numItems;
  for (let i = 0; i < len; i++) {
    callback(item.children[i]);
  }
};

export const deleteItem = (item: ProjectItem) => {
  if (item.type === 2 /* BIN */) {
    item.deleteBin();
  } else {
    const tmpBin = app.project.rootItem.createBin("tmp");
    item.moveBin(tmpBin);
    tmpBin.deleteBin();
  }
};

export const getChildByName = (item: ProjectItem, name: string) => {
  for (let i = 0; i < item.children.numItems; i++) {
    const child = item.children[i];
    if (child.name === name) {
      return child;
    }
  }
};

export const getChildByNodeId = (item: ProjectItem, nodeId: string) => {
  for (let i = 0; i < item.children.numItems; i++) {
    const child = item.children[i];
    if (child.nodeId === nodeId) {
      return child;
    }
  }
};

export const getChildFromTreePath = (project: Project, treePath: string) => {
  const elements = treePath.split("\\"); // first item is blank, second is root
  let projectItem: ProjectItem | undefined = project.rootItem;
  for (let i = 2; i < elements.length; i++) {
    const item = elements[i];
    projectItem = getChildByName(projectItem, item);
    if (!projectItem) return null;
  }
  return projectItem;
};

export const getDescendantByNodeId = (
  item: ProjectItem,
  nodeId: string
): ProjectItem | undefined => {
  for (let i = 0; i < item.children.numItems; i++) {
    const child = item.children[i];
    if (child.nodeId === nodeId) {
      return child;
    } else if (child.type === 2 /* BIN */) {
      const found = getDescendantByNodeId(child, nodeId);
      if (found) return found;
    }
  }
};

export const getParentItem = (item: ProjectItem) => {
  const dir = item.treePath.split("\\");
  if (dir.length < 2) {
    return app.project.rootItem;
  }
  let current = app.project.rootItem;
  for (let i = 2; i < dir.length - 1; i++) {
    const name = dir[i];
    const next = getChildByName(current, name);
    if (next) {
      current = next;
    }
  }
  return current;
};

export const findItemByPath = (
  item: ProjectItem,
  path: string
): ProjectItem | undefined => {
  const len = item.children.numItems;
  for (let i = 0; i < len; i++) {
    const child = item.children[i];
    if (child.children && child.children.numItems > 0) {
      const res = findItemByPath(child, path);
      if (res) {
        return res;
      }
    } else if (child.getMediaPath() === path) {
      return child;
    }
  }
};

// Sequence Helpers

export const getSequenceFromProjectItem = (item: ProjectItem) => {
  for (let i = 0; i < app.project.sequences.numSequences; i++) {
    const seq = app.project.sequences[i];
    if (seq.projectItem.nodeId === item.nodeId) {
      return seq;
    }
  }
};

export const getSequenceLengthInFrames = (seq: Sequence) => {
  const settings = seq.getSettings();
  const end = seq.end;
  const fps = settings.videoFrameRate.ticks;
  const frames = parseInt(end) / parseInt(fps);
  return frames;
};

export const forEachVideoTrack = (
  sequence: Sequence,
  callback: (track: Track, index: number) => void,
  reverse?: boolean
) => {
  const num = sequence.videoTracks.numTracks;
  if (reverse) {
    for (let i = num - 1; i > -1; i--) {
      callback(sequence.videoTracks[i], i);
    }
  } else {
    for (let i = 0; i < num; i++) {
      callback(sequence.videoTracks[i], i);
    }
  }
};

export const forEachAudioTrack = (
  sequence: Sequence,
  callback: (track: Track, index: number) => void,
  reverse?: boolean
) => {
  const num = sequence.audioTracks.numTracks;
  if (reverse) {
    for (let i = num - 1; i > -1; i--) {
      callback(sequence.audioTracks[i], i);
    }
  } else {
    for (let i = 0; i < num; i++) {
      callback(sequence.audioTracks[i], i);
    }
  }
};

// следующее свободное имя для трека субтитров: "{base} Captions N" — сканируем
// имена видеотреков, чтобы повторные Describe→Create не сталкивались друг с другом
export const getNextCaptionsName = (seq: Sequence, base: string): string => {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("^" + escaped + " Captions (\\d+)$");
  let max = 0;
  for (let i = 0; i < seq.videoTracks.numTracks; i++) {
    const match = pattern.exec(String(seq.videoTracks[i].name));
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return base + " Captions " + (max + 1);
};

export const forEachClip = (
  track: Track,
  callback: (clip: TrackItem, index: number) => void,
  reverse?: boolean
) => {
  const num = track.clips.numItems;
  if (reverse) {
    for (let i = num - 1; i > -1; i--) {
      callback(track.clips[i], i);
    }
  } else {
    for (let i = 0; i < num; i++) {
      callback(track.clips[i], i);
    }
  }
};

// Time Helpers

export const addTime = (a: Time, b: Time) => {
  const ticks = parseInt(a.ticks) + parseInt(b.ticks);
  let time = new Time();
  time.ticks = ticks.toString();
  return time;
};

export const subtractTime = (a: Time, b: Time) => {
  const ticks = parseInt(a.ticks) - parseInt(b.ticks);
  let time = new Time();
  time.ticks = ticks.toString();
  return time;
};
export const multiplyTime = (a: Time, factor: number) => {
  const ticks = parseInt(a.ticks) * factor;
  let time = new Time();
  time.ticks = ticks.toString();
  return time;
};
export const divideTime = (a: Time, factor: number) => {
  const ticks = parseInt(a.ticks) / factor;
  let time = new Time();
  time.ticks = ticks.toString();
  return time;
};

export const ticksToTime = (ticks: string) => {
  let time = new Time();
  time.ticks = ticks;
  return time;
};

const fpsTicksTable: { [key: number]: number } = {
  23.976: 10594584000,
  24: 10584000000,
  25: 10160640000,
  29.97: 8475667200,
  30: 8467200000,
  50: 5080320000,
  59.94: 4237833600,
  60: 4233600000,
};

export const getItemFrameRate = (item: ProjectItem) => {
  if (item.isSequence()) {
    const sequence = getSequenceFromProjectItem(item);
    if (sequence) {
      return 1 / sequence.getSettings().videoFrameRate.seconds;
    }
  } else {
    const key = "Column.Intrinsic.MediaTimebase";
    const mediaTimeBase = getPrMetadata(item, [key]);
    return parseFloat(mediaTimeBase[key]);
  }
};

export const getItemDuration = (item: ProjectItem) => {
  const key = "Column.Intrinsic.MediaDuration";
  const res = getPrMetadata(item, [key]);
  return parseFloat(res[key]);
};

export const getFPSTime = (fps: number) => {
  let time = new Time();
  let ticks = fpsTicksTable[fps];
  if (!ticks) return false;
  time.ticks = ticks.toString();
  return time;
};

export const ticksToFrames = (ticks: string, timebase: string) => {
  const timebaseNum = parseInt(timebase);
  return parseInt(ticks) / timebaseNum;
};

export const timecodeToSeconds = (timecode: string, frameRate: number) => {
  const segments = timecode.split(":");
  const hours = parseInt(segments[0]);
  const minutes = parseInt(segments[1]);
  const seconds = parseInt(segments[2]);
  const frames = parseInt(segments[3]);
  return hours * 3600 + minutes * 60 + seconds + frames / frameRate;
};

export const timecodeToTicks = (timecode: string, frameRate: number) => {
  const segments = timecode.split(":");
  const hours = parseInt(segments[0]);
  const minutes = parseInt(segments[1]);
  const seconds = parseInt(segments[2]);
  const frames = parseInt(segments[3]);
  const totalSeconds =
    hours * 3600 + minutes * 60 + seconds + frames / frameRate;
  const ticks = totalSeconds * 10000000; // 1 second = 10,000,000 ticks
  return Math.round(ticks);
};

export const secondsToTime = (seconds: number) => {
  let time = new Time();
  time.seconds = seconds;
  return time;
};

export const getTimecode = (
  t: Time,
  frameRateTime: Time,
  videoDisplayFormat: number
) => {
  const timecode = t.getFormatted(frameRateTime, videoDisplayFormat) as string;
  return timecode;
};

export const getTimecodeFromSequence = (t: Time, sequence: Sequence) => {
  return getTimecode(
    t,
    sequence.getSettings().videoFrameRate,
    sequence.getSettings().videoDisplayFormat
  );
};

// QE DOM Methods

export const qeGetClipAt = (track: Track, index: number) => {
  let curClipIndex = -1;
  for (let i = 0; i < track.numItems; i++) {
    const item = track.getItemAt(i);
    //@ts-ignore
    const type = item.type as "Empty" | "Clip";
    if (type === "Clip") {
      curClipIndex++;
      if (curClipIndex === index) {
        return item;
      }
    }
  }
};

// QE DOM doesn't understand some format, so this function so we convert to compatible ones
export const qeSafeTimeDisplayFormat = (timeDisplayFormat: number) => {
  const conversionTable: {
    [key: number]: number;
  } = {
    998: 110, // 23.89 > 23.976
  };
  const match = conversionTable[timeDisplayFormat];
  return match ? match : timeDisplayFormat;
};

// Metadata Helpers

export const getPrMetadata = (projectItem: ProjectItem, fields: string[]) => {
  let PProMetaURI = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
  if (ExternalObject.AdobeXMPScript === undefined) {
    ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
  }
  if (!app.isDocumentOpen() || !ExternalObject.AdobeXMPScript || !XMPMeta) {
    return {};
  }
  let xmp = new XMPMeta(projectItem.getProjectMetadata());
  let result: {
    [key: string]: string;
  } = {};
  for (let i = 0; i < fields.length; i++) {
    if (xmp.doesPropertyExist(PProMetaURI, fields[i])) {
      result[fields[i]] = xmp.getProperty(PProMetaURI, fields[i]).value;
    }
  }
  return result;
};

export const setPrMetadata = (
  projectItem: ProjectItem,
  data: {
    fieldName: string;
    fieldId: string;
    value: string;
  }[]
) => {
  let PProMetaURI = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
  if (ExternalObject.AdobeXMPScript === undefined) {
    ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
  }
  if (!app.isDocumentOpen() || !ExternalObject.AdobeXMPScript || !XMPMeta) {
    return {};
  }
  let xmp = new XMPMeta(projectItem.getProjectMetadata());
  for (var i = 0; i < data.length; i++) {
    let item = data[i];
    var successfullyAdded = app.project.addPropertyToProjectMetadataSchema(
      item.fieldName,
      item.fieldId,
      2
    );
  }
  var array = [];
  for (var i = 0; i < data.length; i++) {
    let item = data[i];
    xmp.setProperty(PProMetaURI, item.fieldName, item.value);
    array.push(item.fieldName);
  }
  var str = xmp.serialize();
  projectItem.setProjectMetadata(str, array);
};

export const removePrMetadata = (
  projectItem: ProjectItem,
  fields: string[]
) => {
  let PProMetaURI = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
  if (ExternalObject.AdobeXMPScript === undefined) {
    ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
  }
  if (!app.isDocumentOpen() || !ExternalObject.AdobeXMPScript || !XMPMeta) {
    return {};
  }
  let xmp = new XMPMeta(projectItem.getProjectMetadata());
  var array = [];
  for (var i = 0; i < fields.length; i++) {
    xmp.deleteProperty(PProMetaURI, fields[i]);
    array.push(fields[i]);
  }
  var str = xmp.serialize();
  projectItem.setProjectMetadata(str, array);
};

// Motion Graphics Template ( MOGRT ) Helpers

/**
 * JSON.stringify for Premiere setValue: ExtendScript json2 leaves Cyrillic/etc.
 * as raw characters, and ComponentParam.setValue throws "Unknown error exception".
 * Force \\uXXXX so the payload is pure ASCII.
 */
const jsonStringifyAscii = (value: unknown): string => {
  const raw = JSON.stringify(value as object);
  return raw.replace(/[\u007f-\uffff]/g, (ch) => {
    let hex = ch.charCodeAt(0).toString(16);
    while (hex.length < 4) hex = "0" + hex;
    return "\\u" + hex;
  });
};

/**
 * One write, same path as other System text fields.
 * updateUI=false until the last chunk — each true rebuilds mogrt expressions.
 */
const applyMogrtTextValue = (
  prop: ComponentParam,
  text: string,
  updateUI: boolean,
): string | null => {
  text = text == null ? "" : String(text);
  try {
    const value = JSON.parse(String(prop.getValue())) as any;
    if (value && typeof value === "object" && "textEditValue" in value) {
      value.textEditValue = text;
      if (value.fontTextRunLength && typeof value.fontTextRunLength.length === "number") {
        value.fontTextRunLength[0] = text.length;
      }
      prop.setValue(jsonStringifyAscii(value), updateUI);
      return "textDoc";
    }
  } catch (e) {
    // not a TextDocument JSON
  }
  try {
    prop.setValue(text, updateUI);
    return "plain";
  } catch (e2) {
    try {
      prop.setValue(jsonStringifyAscii(text), updateUI);
      return "ascii";
    } catch (e3) {
      return null;
    }
  }
};

const normalizeParamName = (s: string): string => {
  return String(s).toLowerCase().replace(/^\s+|\s+$/g, "");
};

const getMogrtParamByName = (
  mgt: NonNullable<ReturnType<TrackItem["getMGTComponent"]>>,
  name: string,
): ComponentParam | null => {
  try {
    const prop = mgt.properties.getParamForDisplayName(name);
    if (prop) return prop;
  } catch (e) {
    // fall through to scan
  }
  const want = normalizeParamName(name);
  try {
    const props = mgt.properties;
    for (let i = 0; i < props.numItems; i++) {
      if (normalizeParamName(String(props[i].displayName)) === want) return props[i];
    }
  } catch (e2) {
    // ignore
  }
  return null;
};

export const fillMogrtText = (
  clip: TrackItem,
  propName: string,
  text: string
) => {
  let mgt: ReturnType<TrackItem["getMGTComponent"]> | null = null;
  try {
    mgt = clip.getMGTComponent();
  } catch (e) {
    return false;
  }
  if (!mgt) return false;
  const prop = getMogrtParamByName(mgt, propName);
  if (!prop) return false;
  return !!applyMogrtTextValue(prop, text, true);
};

// подставляет текст в первый параметр MOGRT, чьё значение — JSON с полем
// textEditValue (форма Source Text у Essential Graphics). Так не нужно знать
// имя текстового слоя внутри конкретного шаблона.
export const fillFirstMogrtText = (clip: TrackItem, text: string): boolean => {
  let mgt: ReturnType<TrackItem["getMGTComponent"]> | null = null;
  try {
    mgt = clip.getMGTComponent();
  } catch (e) {
    return false;
  }
  if (!mgt) return false;
  const props = mgt.properties;
  for (let i = 0; i < props.numItems; i++) {
    try {
      const value = JSON.parse(props[i].getValue()) as any;
      if (value && typeof value === "object" && "textEditValue" in value) {
        value.textEditValue = text;
        props[i].setValue(jsonStringifyAscii(value), true);
        return true;
      }
    } catch (e) {
      // не текстовый параметр — getValue()/JSON.parse не даёт ожидаемую форму
    }
  }
  return false;
};

/** Packed captions → captions_batch_01..15 (Store hidden). Never writes Captions_Raw_Data. */
export const fillMogrtCaptionChunks = (
  clip: TrackItem,
  data?: string | string[] | null,
  rawJson?: string | null,
): boolean => {
  const chunks = typeof data !== "string" && data && typeof data.length === "number"
    ? resolveCaptionChunks(data as string[], rawJson)
    : resolveCaptionChunks(null, data == null ? rawJson : String(data));
  let mgt: ReturnType<TrackItem["getMGTComponent"]> | null = null;
  try {
    mgt = clip.getMGTComponent();
  } catch (e) {
    return false;
  }
  if (!mgt) return false;

  let ok = 0;
  const debug: { name: string; found: boolean; branch: string | null; len: number }[] = [];
  for (let i = 1; i <= CAPTION_BATCH_COUNT; i++) {
    const name = captionBatchLayerName(i);
    const prop = getMogrtParamByName(mgt, name);
    const updateUI = i === CAPTION_BATCH_COUNT;
    const branch = prop ? applyMogrtTextValue(prop, chunks[i - 1], updateUI) : null;
    if (branch) ok++;
    debug.push({
      name: name,
      found: !!prop,
      branch: branch,
      len: chunks[i - 1] ? chunks[i - 1].length : 0,
    });
  }
  writeChunkDebug({
    ok: ok,
    packedLen: chunks.join("").length,
    fields: debug,
    names: ok === 0 ? dumpMogrtDisplayNames(mgt) : [],
  });
  return ok > 0;
};

const dumpMogrtDisplayNames = (
  mgt: NonNullable<ReturnType<TrackItem["getMGTComponent"]>>,
): string[] => {
  const names: string[] = [];
  try {
    const props = mgt.properties;
    for (let i = 0; i < props.numItems; i++) {
      names.push(String(props[i].displayName));
    }
  } catch (e) {
    // ignore
  }
  return names;
};

const writeChunkDebug = (data: {
  ok: number;
  packedLen: number;
  fields: { name: string; found: boolean; branch: string | null; len: number }[];
  names: string[];
}) => {
  try {
    const dir = new Folder(Folder.temp.fsName + "/captions_cep");
    if (!dir.exists) dir.create();
    const lines: string[] = [];
    lines.push("ok=" + data.ok + " packedLen=" + data.packedLen);
    for (let i = 0; i < data.fields.length; i++) {
      const f = data.fields[i];
      lines.push(
        f.name +
          " found=" +
          f.found +
          " branch=" +
          (f.branch || "null") +
          " len=" +
          f.len,
      );
    }
    lines.push("--- displayNames ---");
    for (let n = 0; n < data.names.length; n++) {
      lines.push(String(n) + ": " + data.names[n]);
    }
    const f = new File(dir.fsName + "/chunk_write_debug.txt");
    f.encoding = "UTF-8";
    f.open("w");
    f.write(lines.join("\n"));
    f.close();
  } catch (e) {
    // диагностика не должна ломать запись
  }
};

/** Store/Bridge: captions_batch_*, Segment Type, Line Count, Chars Per Line, Composition Height. */
export const fillMogrtNumber = (clip: TrackItem, propName: string, n: number): boolean => {
  let mgt: ReturnType<TrackItem["getMGTComponent"]> | null = null;
  try {
    mgt = clip.getMGTComponent();
  } catch (e) {
    return false;
  }
  if (!mgt) return false;
  let prop: ComponentParam | null = null;
  try {
    prop = mgt.properties.getParamForDisplayName(propName);
  } catch (e) {
    return false;
  }
  if (!prop) return false;
  try {
    prop.setValue(n as unknown as object, true);
    return true;
  } catch (e) {
    try {
      prop.setValue(String(n), true);
      return true;
    } catch (e2) {
      return false;
    }
  }
};

/**
 * Fit caption MOGRT by height to the sequence.
 * Motion effect is found by matchName ("AE.ADBE Motion") because displayName depends on host language.
 * Scale is accessed via parameter index 1 (the 2nd parameter, 0-based index 1).
 * Sets Scale to (seqHeight / baseHeight) * 100 (where baseHeight defaults to 2048).
 */
export const fitCaptionMogrtHeight = (
  clip: TrackItem,
  seqHeight: number,
  baseHeight: number = 2048,
): boolean => {
  try {
    if (!clip || !clip.components || !seqHeight || seqHeight <= 0 || baseHeight <= 0) {
      return false;
    }
    const targetScale = (seqHeight / baseHeight) * 100;
    const components = clip.components;
    for (let a = 0; a < components.numItems; a++) {
      const fx = components[a];
      if (
        fx &&
        (fx.matchName === "AE.ADBE Motion" ||
          (fx.matchName && fx.matchName.indexOf("Motion") !== -1) ||
          fx.displayName === "Motion")
      ) {
        if (fx.properties && fx.properties.numItems > 1) {
          const prop = fx.properties[1];
          if (prop) {
            prop.setValue(targetScale, true);
            return true;
          }
        }
        for (let b = 0; b < fx.properties.numItems; b++) {
          const prop = fx.properties[b];
          if (prop && (prop.displayName === "Scale" || prop.displayName === "Масштаб")) {
            prop.setValue(targetScale, true);
            return true;
          }
        }
      }
    }
    return false;
  } catch (e) {
    return false;
  }
};

export const fillMogrtSystemProps = (
  clip: TrackItem,
  opts: {
    captionChunks?: string[];
    captionsRawData?: string;
    segmentType?: number;
    lineCount?: number;
    charsPerLine?: number;
    compositionHeight?: number;
  },
): boolean => {
  const rawOk = fillMogrtCaptionChunks(clip, opts.captionChunks, opts.captionsRawData);
  // Segment Type is a Menu: definition 1-based → Premiere 0-based
  if (opts.segmentType != null) {
    fillMogrtNumber(clip, CAPTION_SYSTEM.segmentType, Math.max(0, opts.segmentType - 1));
  }
  if (opts.lineCount != null) fillMogrtNumber(clip, CAPTION_SYSTEM.lineCount, opts.lineCount);
  if (opts.charsPerLine != null) fillMogrtNumber(clip, CAPTION_SYSTEM.charsPerLine, opts.charsPerLine);
  if (opts.compositionHeight != null && opts.compositionHeight > 0) {
    fillMogrtNumber(clip, CAPTION_SYSTEM.compositionHeight, opts.compositionHeight);
    fitCaptionMogrtHeight(clip, opts.compositionHeight, 2048);
  }
  return rawOk;
};

/** Caption mogrt: captions_batch_01 (legacy: Captions_Raw_Data). */
export const isCaptionMogrtClip = (clip: TrackItem): boolean => {
  try {
    const mgt = clip.getMGTComponent();
    if (!mgt) return false;
    if (getMogrtParamByName(mgt, captionBatchLayerName(1))) return true;
    return !!getMogrtParamByName(mgt, CAPTION_SYSTEM.rawData);
  } catch (e) {
    return false;
  }
};

const readMogrtTextProp = (
  mgt: NonNullable<ReturnType<TrackItem["getMGTComponent"]>>,
  name: string,
): string | null => {
  try {
    const prop = getMogrtParamByName(mgt, name);
    if (!prop) return null;
    const raw = String(prop.getValue());
    try {
      const value = JSON.parse(raw) as any;
      if (value && typeof value === "object" && "textEditValue" in value) {
        return String(value.textEditValue || "");
      }
    } catch (e) {
      // plain string
    }
    return raw;
  } catch (e) {
    return null;
  }
};

/** Packed captions_batch_01..15 as 15 strings (v4 lookup + batches, or legacy equal-split). */
export const readMogrtCaptionChunks = (clip: TrackItem): string[] => {
  const chunks: string[] = [];
  try {
    const mgt = clip.getMGTComponent();
    if (!mgt) return chunks;
    let sawBatch = false;
    for (let i = 1; i <= CAPTION_BATCH_COUNT; i++) {
      const chunk = readMogrtTextProp(mgt, captionBatchLayerName(i));
      if (chunk != null) sawBatch = true;
      chunks.push(chunk == null ? "" : chunk);
    }
    if (sawBatch) return chunks;
  } catch (e) {
    // ignore
  }
  return [];
};

/** Packed captions_batch_01..15 concatenated (legacy). Prefer readMogrtCaptionChunks. */
export const readMogrtPackedCaptions = (clip: TrackItem): string => {
  try {
    const mgt = clip.getMGTComponent();
    if (!mgt) return "";
    let packed = "";
    let sawBatch = false;
    for (let i = 1; i <= CAPTION_BATCH_COUNT; i++) {
      const chunk = readMogrtTextProp(mgt, captionBatchLayerName(i));
      if (chunk != null) sawBatch = true;
      packed += chunk == null ? "" : chunk;
    }
    if (sawBatch) return packed;
    return readMogrtTextProp(mgt, CAPTION_SYSTEM.rawData) || "";
  } catch (e) {
    return "";
  }
};

export const readMogrtNumber = (clip: TrackItem, propName: string): number | null => {
  try {
    const mgt = clip.getMGTComponent();
    if (!mgt) return null;
    const prop = getMogrtParamByName(mgt, propName);
    if (!prop) return null;
    const n = Number(prop.getValue());
    return isNaN(n) ? null : n;
  } catch (e) {
    return null;
  }
};

/** Word tokens from packed System captions_batch_* (spacing dropped). */
export const readMogrtCaptionSegments = (
  clip: TrackItem,
): { text: string; timestamp: [number, number] }[] => {
  const chunks = readMogrtCaptionChunks(clip);
  const tokens = chunks.length
    ? unpackCaptionChunks(chunks)
    : unpackCaptions(readMogrtPackedCaptions(clip));
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

/** Читает текст из System captions_batch_* (packed) / legacy Captions_Raw_Data или clip.name. */
export const readMogrtText = (clip: TrackItem): string => {
  try {
    const mgt = clip.getMGTComponent();
    if (!mgt) return String(clip.name || "");
    const tryProp = (name: string): string | null => readMogrtTextProp(mgt, name);
    const chunks: string[] = [];
    let sawBatch = false;
    for (let i = 1; i <= CAPTION_BATCH_COUNT; i++) {
      const chunk = tryProp(captionBatchLayerName(i));
      if (chunk != null) sawBatch = true;
      chunks.push(chunk == null ? "" : chunk);
    }
    if (sawBatch) return packedCaptionsDisplayText(chunks);
    const main = tryProp(CAPTION_SYSTEM.rawData);
    if (main != null && String(main).length) {
      try {
        const parsed = JSON.parse(String(main)) as { text?: string; type?: string }[];
        if (Array.isArray(parsed)) {
          const words = parsed
            .filter((t) => !t.type || t.type === "word")
            .map((t) => String(t.text || "").trim())
            .filter(Boolean);
          if (words.length) return words.join(" ");
        }
      } catch (e) {
        // not JSON — use as plain text
      }
      return String(main);
    }
    const props = mgt.properties;
    for (let i = 0; i < props.numItems; i++) {
      try {
        const value = JSON.parse(props[i].getValue()) as any;
        if (value && typeof value === "object" && "textEditValue" in value) {
          return String(value.textEditValue || "");
        }
      } catch (e) {
        // skip
      }
    }
  } catch (e) {
    // ignore
  }
  return String(clip.name || "");
};

// канал цвета 0..1 → 0..255
const colorChannelTo255 = (v: number): number => {
  const clamped = v < 0 ? 0 : v > 1 ? 1 : v;
  return Math.round(clamped * 255);
};

// Point-параметры mogrt хранятся нормализованной строкой "x,y" (0..1) от
// размера композиции шаблона; caption-шаблоны авторятся в 1920x1080
const MOGRT_COMP_WIDTH = 1920;
const MOGRT_COMP_HEIGHT = 1080;

const isPointValue = (v: unknown): v is { x: number; y: number } =>
  !!v && typeof v === "object" && "x" in (v as object) && "y" in (v as object);

// параметры-группы в плоском списке — это строки-перечисления UUID детей;
// setValue в них "успешен", но молча ломает группу — их надо пропускать
const isGroupParamValue = (raw: unknown): boolean =>
  typeof raw === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27};/i.test(raw);

// типы контролов из definition (совпадают с Essential Properties AE)
const CONTROL_TYPE_COLOR = 4;
const CONTROL_TYPE_POINT = 5;
const CONTROL_TYPE_MENU = 13;

// форма значения зависит от типа контрола: цвет — упакованное число, точка —
// нормализованная строка "x,y", текст — JSON с textEditValue, остальное —
// raw/JSON. Возвращает имя сработавшей ветки (для диагностики) или null.
const setMogrtParamValue = (
  param: ComponentParam,
  value: unknown,
  type?: number,
  updateUI = true,
): string | null => {
  if (type === CONTROL_TYPE_COLOR && value && (value as number[]).length >= 3) {
    // цвета — только через setColorValue: setValue на color-параметрах
    // молча пишет чёрный (известная особенность Premiere API)
    const rgba = value as number[];
    try {
      param.setColorValue(
        rgba.length > 3 ? colorChannelTo255(rgba[3]) : 255,
        colorChannelTo255(rgba[0]),
        colorChannelTo255(rgba[1]),
        colorChannelTo255(rgba[2]),
        updateUI,
      );
      return "setColorValue";
    } catch (e: any) {
      return "color-err:" + String(e && e.message ? e.message : e);
    }
  }
  if (type === CONTROL_TYPE_POINT && isPointValue(value)) {
    const nx = value.x / MOGRT_COMP_WIDTH;
    const ny = value.y / MOGRT_COMP_HEIGHT;
    try {
      param.setValue([nx, ny] as unknown as object, updateUI);
      return "point-arr";
    } catch (e) {
      try {
        param.setValue(String(nx) + "," + String(ny), updateUI);
        return "point-str";
      } catch (e2: any) {
        return "point-err:" + String(e2 && e2.message ? e2.message : e2);
      }
    }
  }
  // AE / definition menucontent is 1-based; Premiere mogrt dropdown is 0-based
  if (type === CONTROL_TYPE_MENU && typeof value === "number" && isFinite(value)) {
    const idx = Math.max(0, Math.floor(value) - 1);
    try {
      param.setValue(idx as unknown as object, updateUI);
      return "menu-0";
    } catch (e) {
      try {
        param.setValue(String(idx), updateUI);
        return "menu-0-str";
      } catch (e2: any) {
        return "menu-err:" + String(e2 && e2.message ? e2.message : e2);
      }
    }
  }
  try {
    const curRaw = param.getValue();
    if (typeof curRaw === "string") {
      try {
        const cur = JSON.parse(curRaw) as any;
        if (cur && typeof cur === "object" && "textEditValue" in cur && typeof value === "string") {
          cur.textEditValue = value;
          if (cur.fontTextRunLength && typeof cur.fontTextRunLength.length === "number") {
            cur.fontTextRunLength[0] = value.length;
          }
          param.setValue(jsonStringifyAscii(cur), updateUI);
          return "textEditValue";
        }
      } catch (e) {
        // текущее значение — не JSON
      }
    }
  } catch (e) {
    // getValue недоступен — пробуем вслепую
  }
  try {
    param.setValue(value as object, updateUI);
    return "raw";
  } catch (e) {
    try {
      param.setValue(JSON.stringify(value as unknown as object), updateUI);
      return "json";
    } catch (e2) {
      return null;
    }
  }
};

export type StylePropPayload = {
  path: string[];
  type: number;
  value: unknown;
  /** 0-based index among non-group params with the same displayName (definition order). */
  leafIndex?: number;
};

export type MogrtMatchDebug = {
  prop: string;
  path: string[];
  param: number;
  branch: string | null;
};

/** Дамп параметров MGT-компонента (для диагностики матчинга/форматов). */
export const dumpMogrtParams = (clip: TrackItem): { i: number; name: string; raw: string }[] => {
  const out: { i: number; name: string; raw: string }[] = [];
  try {
    const mgt = clip.getMGTComponent();
    if (!mgt) return out;
    const params = mgt.properties;
    for (let i = 0; i < params.numItems; i++) {
      let raw = "";
      try {
        raw = String(params[i].getValue());
      } catch (e) {
        raw = "<getValue failed>";
      }
      if (raw.length > 300) raw = raw.substring(0, 300) + "…";
      out.push({ i, name: String(params[i].displayName), raw });
    }
  } catch (e) {
    // ignore
  }
  return out;
};

/**
 * Применяет style values к MGT-компоненту клипа. Premiere отдаёт параметры
 * mogrt плоским списком display-имён (без структуры групп), поэтому листья с
 * одинаковыми именами (например несколько "Fill" в разных группах) матчим по
 * leafIndex из definition (N-й не-group параметр с этим именем). Без leafIndex —
 * fallback: первый unused / preferLast для Spacing>Spacing.
 */
export const applyMogrtStyleProps = (
  clip: TrackItem,
  props: StylePropPayload[],
  debug?: MogrtMatchDebug[],
): number => {
  const mgt = clip.getMGTComponent();
  if (!mgt) return 0;
  const params = mgt.properties;
  const used: { [index: number]: boolean } = {};
  let applied = 0;
  for (let p = 0; p < props.length; p++) {
    const prop = props[p];
    if (!prop.path || !prop.path.length) continue;
    const name = prop.path[prop.path.length - 1];
    // лист назван как его родительская группа (например Spacing > Spacing):
    // в плоском списке лист всегда идёт после группы — берём последнего
    // кандидата, это спасает и клипы, где uuid-список группы был затёрт
    const preferLast = prop.path.length >= 2 && prop.path[prop.path.length - 2] === name;
    const targetLeaf =
      typeof prop.leafIndex === "number" && isFinite(prop.leafIndex) ? Math.floor(prop.leafIndex) : -1;
    let paramIndex = -1;
    let matchCount = 0;
    for (let i = 0; i < params.numItems; i++) {
      const displayName = String(params[i].displayName);
      if (displayName !== name) continue;
      if (MOGRT_SYSTEM_PROP_NAMES[displayName]) continue;
      // группа с тем же именем, что и лист — не трогаем и не помечаем used:
      // она никогда не цель записи
      try {
        if (isGroupParamValue(params[i].getValue())) continue;
      } catch (e) {
        // getValue упал — считаем обычным параметром
      }
      if (targetLeaf >= 0) {
        if (matchCount === targetLeaf) {
          paramIndex = i;
          break;
        }
        matchCount++;
        continue;
      }
      if (used[i]) continue;
      paramIndex = i;
      if (!preferLast) break;
    }
    let branch: string | null = null;
    if (paramIndex >= 0) {
      used[paramIndex] = true;
      const updateUI = p === props.length - 1;
      branch = setMogrtParamValue(params[paramIndex], prop.value, prop.type, updateUI);
      if (branch && branch.indexOf("-err:") === -1) applied++;
    }
    if (debug) debug.push({ prop: name, path: prop.path, param: paramIndex, branch });
  }
  return applied;
};

// caption-клипы конкретного трека (посторонние клипы/mogrt не включаются)
export const collectCaptionClips = (track: Track): TrackItem[] => {
  const out: TrackItem[] = [];
  for (let i = 0; i < track.clips.numItems; i++) {
    const clip = track.clips[i];
    if (isCaptionMogrtClip(clip)) out.push(clip);
  }
  return out;
};

// трек с нашими caption-клипами: сначала подсказанный индекс (hostRef панели),
// иначе сканируем сверху вниз (на случай нескольких caption-треков)
export const findCaptionTrackIndex = (seq: Sequence, hint?: number): number => {
  if (
    typeof hint === "number" &&
    hint >= 0 &&
    hint < seq.videoTracks.numTracks &&
    collectCaptionClips(seq.videoTracks[hint]).length
  ) {
    return hint;
  }
  for (let i = seq.videoTracks.numTracks - 1; i >= 0; i--) {
    if (collectCaptionClips(seq.videoTracks[i]).length) return i;
  }
  return -1;
};

/**
 * Снапшот стилевых значений MGT-компонента — для переноса пользовательских
 * правок (Styles) на пересобранные клипы при resegment. Индекс в массиве ==
 * индекс параметра: mogrt один и тот же, порядок параметров стабилен.
 * System-тексты (заполняются per-caption) и группы — null.
 */
export type MogrtParamSnapshot = ({ name: string; color?: number[]; value?: unknown } | null)[];

const MOGRT_SYSTEM_PROP_NAMES: { [name: string]: boolean } = {};
for (let i = 0; i < CEP_WRITTEN_SYSTEM_NAMES.length; i++) {
  MOGRT_SYSTEM_PROP_NAMES[CEP_WRITTEN_SYSTEM_NAMES[i]] = true;
}

export const snapshotMogrtStyle = (clip: TrackItem): MogrtParamSnapshot => {
  const out: MogrtParamSnapshot = [];
  const mgt = clip.getMGTComponent();
  if (!mgt) return out;
  const params = mgt.properties;
  for (let i = 0; i < params.numItems; i++) {
    const name = String(params[i].displayName);
    if (MOGRT_SYSTEM_PROP_NAMES[name]) {
      out.push(null);
      continue;
    }
    // цвета читаем/пишем только через *ColorValue: getValue у них отдаёт
    // внутреннее упакованное число, а setValue молча пишет чёрный.
    // getColorValue на не-цветовых параметрах кидает исключение — так и различаем
    try {
      const color = params[i].getColorValue();
      if (color && color.length >= 4) {
        out.push({ name, color: [Number(color[0]), Number(color[1]), Number(color[2]), Number(color[3])] });
        continue;
      }
    } catch (e) {
      // не цвет
    }
    try {
      const value = params[i].getValue();
      if (isGroupParamValue(value)) {
        out.push(null);
        continue;
      }
      out.push({ name, value });
    } catch (e) {
      out.push(null);
    }
  }
  return out;
};

export const applyMogrtSnapshot = (clip: TrackItem, snap: MogrtParamSnapshot): number => {
  const mgt = clip.getMGTComponent();
  if (!mgt) return 0;
  const params = mgt.properties;
  let applied = 0;
  for (let i = 0; i < params.numItems && i < snap.length; i++) {
    const s = snap[i];
    if (!s) continue;
    // порядок параметров разошёлся со снапшотом (другой mogrt?) — не рискуем
    if (String(params[i].displayName) !== s.name) continue;
    try {
      if (s.color) {
        params[i].setColorValue(s.color[0], s.color[1], s.color[2], s.color[3], true);
      } else {
        params[i].setValue(s.value as object, true);
      }
      applied++;
    } catch (e) {
      // параметр не принял значение — оставляем дефолт шаблона
    }
  }
  return applied;
};

// добавляет пустой видеотрек поверх остальных через недокументированный QE DOM,
// чтобы caption-mogrt'ы не перекрывали/не сдвигали уже смонтированный материал.
// QE официально не поддерживается Adobe — при сбое просто используем верхний
// из уже существующих треков.
export const ensureTopVideoTrack = (): number => {
  const existingTop = Math.max(0, app.project.activeSequence.videoTracks.numTracks - 1);
  try {
    if (typeof qe === "undefined") app.enableQE();
    if (!qe) return existingTop;
    const qeSeq = qe.project.getActiveSequence();
    const before = Number(qeSeq.numVideoTracks);
    qeSeq.addTracks(1, before, 0, 1, 0, 0, 1, 0);
    const after = Number(qeSeq.numVideoTracks);
    return after > before ? after - 1 : existingTop;
  } catch (e) {
    return existingTop;
  }
};

/** True when no clip on `track` overlaps [position, position+duration) (seconds). */
export const isTrackFreeAtPosition = (
  track: Track,
  positionSeconds: number,
  durationSeconds: number,
): boolean => {
  try {
    if (typeof track.isLocked === "function" && track.isLocked()) return false;
  } catch (e) {
    // ignore lock probe failures
  }
  const end = positionSeconds + Math.max(0.05, durationSeconds);
  for (let i = 0; i < track.clips.numItems; i++) {
    const clip = track.clips[i];
    if (clip.start.seconds < end && clip.end.seconds > positionSeconds) return false;
  }
  return true;
};

/**
 * Lowest video track free for a contiguous `height` span at the playhead window.
 * Port of Beta `setPlacesForTracks` / `findFreeTrackIndex` (transitions + mogrt).
 * Adds tracks via QE only when nothing lower is free.
 */
export const findFreeVideoTrack = (
  sequence: Sequence,
  positionSeconds: number,
  durationSeconds = 5,
  height = 1,
): number => {
  const span = Math.max(1, Math.floor(height));
  const n = sequence.videoTracks.numTracks;
  for (let i = 0; i <= n - span; i++) {
    let ok = true;
    for (let j = 0; j < span; j++) {
      if (
        !isTrackFreeAtPosition(
          sequence.videoTracks[i + j],
          positionSeconds,
          durationSeconds,
        )
      ) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }

  const tracksToAdd = span;
  try {
    if (typeof qe === "undefined") app.enableQE();
    if (!qe) return Math.max(0, n - 1);
    const qeSeq = qe.project.getActiveSequence();
    const before = Number(qeSeq.numVideoTracks);
    qeSeq.addTracks(tracksToAdd, before, 0, 1, 0, 0, 1, 0);
    return before;
  } catch (e) {
    return Math.max(0, n - 1);
  }
};

/** Lowest free audio track at [position, position+duration); adds one via QE if needed. */
export const findFreeAudioTrack = (
  sequence: Sequence,
  positionSeconds: number,
  durationSeconds = 5,
): number => {
  for (let i = 0; i < sequence.audioTracks.numTracks; i++) {
    if (isTrackFreeAtPosition(sequence.audioTracks[i], positionSeconds, durationSeconds)) {
      return i;
    }
  }
  try {
    if (typeof qe === "undefined") app.enableQE();
    if (!qe) return Math.max(0, sequence.audioTracks.numTracks - 1);
    const qeSeq = qe.project.getActiveSequence();
    const audioIdx = sequence.audioTracks.numTracks;
    qeSeq.addTracks(0, 0, 1, 1, audioIdx);
    return audioIdx;
  } catch (e) {
    return Math.max(0, sequence.audioTracks.numTracks - 1);
  }
};

/**
 * Source WxH from Premiere project-item XMP `Column.Intrinsic.VideoInfo`
 * (e.g. "1920x1080 (1.0)"). Same source as Beta `getMOGRT_Sizes` / `fitClipScaleToSeq`.
 */
export const getClipOriginSize = (
  projectItem: ProjectItem,
): { width: number; height: number } | null => {
  try {
    const meta = getPrMetadata(projectItem, ["Column.Intrinsic.VideoInfo"]);
    const info = meta["Column.Intrinsic.VideoInfo"];
    if (!info) return null;
    const parts = String(info).toLowerCase().split("x");
    if (parts.length < 2) return null;
    const width = parseInt(parts[0], 10);
    const height = parseInt(parts[1], 10);
    if (!width || !height || !isFinite(width) || !isFinite(height)) return null;
    return { width, height };
  } catch (e) {
    return null;
  }
};

/**
 * Scale Motion → Scale so the clip covers the active sequence (Beta `fitClipScaleToSeq`).
 * Used for pack MOGRTs / footage and stock timeline imports.
 */
export const fitClipScaleToSeq = (
  clip: TrackItem,
  sequence: Sequence,
): boolean => {
  try {
    if (!clip || !sequence || !clip.projectItem) return false;
    const origin = getClipOriginSize(clip.projectItem);
    if (!origin) return false;

    const seqW = sequence.frameSizeHorizontal;
    const seqH = sequence.frameSizeVertical;
    if (!seqW || !seqH) return false;

    const divideW = origin.width / seqW;
    const divideH = origin.height / seqH;
    if (!divideW || !divideH || !isFinite(divideW) || !isFinite(divideH)) {
      return false;
    }

    const sourceAspect = origin.width / origin.height;
    const seqAspect = seqW / seqH;
    const components = clip.components;
    for (let a = 0; a < components.numItems; a++) {
      const fx = components[a];
      if (
        fx &&
        (fx.matchName === "AE.ADBE Motion" ||
          (fx.matchName && fx.matchName.indexOf("Motion") !== -1) ||
          fx.displayName === "Motion")
      ) {
        if (fx.properties && fx.properties.numItems > 1) {
          const prop = fx.properties[1];
          const current = Number(prop.getValue());
          if (isFinite(current)) {
            const next =
              seqAspect >= sourceAspect ? current / divideW : current / divideH;
            prop.setValue(next, true);
            return true;
          }
        }
        for (let b = 0; b < fx.properties.numItems; b++) {
          const prop = fx.properties[b];
          if (prop && (prop.displayName === "Scale" || prop.displayName === "Масштаб")) {
            const current = Number(prop.getValue());
            if (!isFinite(current)) return false;
            const next =
              seqAspect >= sourceAspect ? current / divideW : current / divideH;
            prop.setValue(next, true);
            return true;
          }
        }
      }
    }
    return false;
  } catch (e) {
    return false;
  }
};

/** Find a clip on `track` that starts near `positionSeconds` (after overwriteClip / insert). */
export const findClipNearPosition = (
  track: Track,
  positionSeconds: number,
  nameHint?: string,
): TrackItem | null => {
  const epsilon = 0.05;
  let byTime: TrackItem | null = null;
  for (let i = 0; i < track.clips.numItems; i++) {
    const clip = track.clips[i];
    if (Math.abs(clip.start.seconds - positionSeconds) <= epsilon) {
      if (nameHint && clip.name === nameHint) return clip;
      if (!byTime) byTime = clip;
    }
  }
  if (byTime) return byTime;
  if (nameHint) {
    for (let i = 0; i < track.clips.numItems; i++) {
      if (track.clips[i].name === nameHint) return track.clips[i];
    }
  }
  return null;
};

// Audio Conversions

export const dbToDec = (x: number) => Math.pow(10, (x - 15) / 20);

export const decToDb = (x: number) => 20 * Math.log(x) * Math.LOG10E + 15;
