/**
 * System EP names — must match definition.json clientControls uiName (en_US).
 * CEP writes packed caption chunks into captions_batch_01..15; AE expression
 * concatenates them into Captions_Raw_Data / Captions_Data.
 * Styles UI hides groups whose uiName contains "hidden" (and all children).
 */
export const CAPTION_SYSTEM = {
  group: "System hidden",
  rawData: "Captions_Raw_Data",
  segmentType: "Segment Type",
  lineCount: "Line Count",
  charsPerLine: "Chars Per Line",
  compositionHeight: "Composition Height",
} as const;

/** Essential Graphics text fields CEP fills. Always all 15, even if empty. */
export const CAPTION_BATCH_COUNT = 15;

export const captionBatchLayerName = (i: number): string => {
  return "captions_batch_" + (i < 10 ? "0" + i : String(i));
};

const buildCaptionBatchNames = (): string[] => {
  const names: string[] = [];
  for (let i = 1; i <= CAPTION_BATCH_COUNT; i++) {
    names.push(captionBatchLayerName(i));
  }
  return names;
};

export const CAPTION_BATCH_NAMES: readonly string[] = buildCaptionBatchNames();

/** Segment Type menucontent order (1-based, as in AE / definition value). */
export const SEGMENT_TYPE_INDEX = {
  words: 1,
  sentence: 2,
  custom: 3,
} as const;

/** CEP fills these on create / resegment / live-edit. Not user style. */
const buildCepWrittenSystemNames = (): string[] => {
  const names: string[] = [CAPTION_SYSTEM.rawData];
  for (let i = 0; i < CAPTION_BATCH_NAMES.length; i++) {
    names.push(CAPTION_BATCH_NAMES[i]);
  }
  names.push(
    CAPTION_SYSTEM.segmentType,
    CAPTION_SYSTEM.lineCount,
    CAPTION_SYSTEM.charsPerLine,
    CAPTION_SYSTEM.compositionHeight,
  );
  return names;
};

export const CEP_WRITTEN_SYSTEM_NAMES: readonly string[] = buildCepWrittenSystemNames();

export type CaptionPackToken = {
  text?: string | null;
  start?: number | null;
  end?: number | null;
};

/** JSON array → packed `text~start~end~~...`. type / speaker_id are dropped. */
export const packCaptions = (captions: CaptionPackToken[] | null | undefined): string => {
  if (!captions || !captions.length) return "";
  const parts: string[] = [];
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i];
    const text = c.text == null ? "" : String(c.text);
    const start = c.start == null ? 0 : c.start;
    const end = c.end == null ? 0 : c.end;
    parts.push([text, start, end].join("~"));
  }
  return parts.join("~~");
};

/** Split equally by characters into n chunks (mid-token cuts are OK). */
export const splitEqual = (str: string | null | undefined, n: number): string[] => {
  str = str == null ? "" : String(str);
  const size = Math.ceil(str.length / n) || 0;
  const chunks: string[] = [];
  for (let i = 0; i < n; i++) {
    chunks.push(size ? str.substring(i * size, (i + 1) * size) : "");
  }
  return chunks;
};

export const parseCaptionsRawJson = (
  rawJson: string | CaptionPackToken[] | null | undefined,
): CaptionPackToken[] => {
  if (!rawJson) return [];
  if (typeof rawJson !== "string") {
    if (typeof (rawJson as CaptionPackToken[]).length === "number") {
      return rawJson as CaptionPackToken[];
    }
    return [];
  }
  try {
    const parsed = JSON.parse(String(rawJson));
    if (parsed && typeof parsed.length === "number") return parsed as CaptionPackToken[];
  } catch (e) {
    // not JSON
  }
  return [];
};

export const normalizeCaptionChunks = (chunks: string[] | null | undefined): string[] => {
  const out: string[] = [];
  for (let i = 0; i < CAPTION_BATCH_COUNT; i++) {
    const c = chunks && i < chunks.length ? chunks[i] : "";
    out.push(c == null ? "" : String(c));
  }
  return out;
};

export const captionsRawJsonToChunks = (
  rawJson: string | CaptionPackToken[] | null | undefined,
): string[] => {
  return splitEqual(packCaptions(parseCaptionsRawJson(rawJson)), CAPTION_BATCH_COUNT);
};

/** Prefer pre-packed CEP chunks; fall back to packing Scribe JSON on the host. */
export const resolveCaptionChunks = (
  chunks?: string[] | null,
  rawJson?: string | CaptionPackToken[] | null,
): string[] => {
  if (chunks && chunks.length) {
    const normalized = normalizeCaptionChunks(chunks);
    let packed = "";
    for (let i = 0; i < normalized.length; i++) packed += normalized[i];
    if (packed) return normalized;
  }
  return captionsRawJsonToChunks(rawJson);
};

/** Decoder: last two `~` fields are start/end; text may contain `~`. */
export const unpackCaptions = (packed: string | null | undefined): CaptionPackToken[] => {
  if (!packed) return [];
  const items = String(packed).split("~~");
  const out: CaptionPackToken[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const last = item.lastIndexOf("~");
    if (last < 0) continue;
    const prev = item.lastIndexOf("~", last - 1);
    if (prev < 0) continue;
    out.push({
      text: item.substring(0, prev),
      start: Number(item.substring(prev + 1, last)),
      end: Number(item.substring(last + 1)),
    });
  }
  return out;
};

export const packedCaptionsDisplayText = (packed: string | null | undefined): string => {
  const caps = unpackCaptions(packed);
  const words: string[] = [];
  for (let i = 0; i < caps.length; i++) {
    const t = String(caps[i].text == null ? "" : caps[i].text).replace(/^\s+|\s+$/g, "");
    if (t) words.push(t);
  }
  return words.join(" ");
};
