/**
 * Essential Graphics / controls.json names — must match uiName (en_US).
 * CEP writes v4 lookup + offset batches into captions_batch_01..15.
 * Captions_Raw_Data / Captions_Data are computed by AE expressions — do not fill.
 *
 * Styles UI is the `groups` tree in controls.json.
 * Segment Type / Line Count / Chars Per Line stay CEP-written, not Styles.
 */
export const CAPTION_SYSTEM = {
  group: "Store hidden",
  storeGroup: "Store hidden",
  bridgeGroup: "Bridge hidden",
  legacyGroup: "System hidden",
  rawData: "Captions_Raw_Data",
  segmentType: "Segment Type",
  lineCount: "Line Count",
  charsPerLine: "Chars Per Line",
  compositionHeight: "Composition Height",
} as const;

/** AE Essential Properties groups that may hold system props (new + legacy). */
export const CAPTION_SYSTEM_GROUPS: readonly string[] = [
  CAPTION_SYSTEM.storeGroup,
  CAPTION_SYSTEM.bridgeGroup,
  CAPTION_SYSTEM.legacyGroup,
  "System",
];

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
  custom: 2,
} as const;

/** CEP fills these on create / resegment / live-edit. Not user style. */
const buildCepWrittenSystemNames = (): string[] => {
  const names: string[] = [];
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
  type?: string | null;
};

const MS = 1000;
const LUT_SECONDS = 1800;
const LUT_HOLD_PAD = 1;
const INDEXED_LOOKUP_PREFIX = "v4lut~";
const INDEXED_BATCH_PREFIX = "v4~";
const BATCH_SEP = "|||";

const toMs = (seconds: number | null | undefined): number => {
  const n = Number(seconds);
  if (!isFinite(n)) return 0;
  return Math.round(n * MS);
};

/**
 * SDK spacing is empty string (`wordIndex: -1`), never `" "`.
 * Scribe / CEP fallbacks often send `type: "spacing"` with a space character.
 */
const packTokenText = (token: CaptionPackToken): string => {
  if (token.type === "spacing") return "";
  const text = token.text == null ? "" : String(token.text);
  if (!text.replace(/^\s+|\s+$/g, "")) return "";
  return text;
};

const escapeRowText = (text: string): string => {
  if (!text) return "";
  if (text.indexOf("\\") === -1 && text.indexOf("~") === -1 && text.indexOf("@") === -1) {
    return text;
  }
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\\") out += "\\0";
    else if (ch === "~") out += "\\1";
    else if (ch === "@") out += "\\2";
    else out += ch;
  }
  return out;
};

const unescapeRowText = (text: string): string => {
  if (!text || text.indexOf("\\") === -1) return text || "";
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch !== "\\" || i + 1 >= text.length) {
      result += ch;
      continue;
    }
    const code = text.charAt(i + 1);
    i++;
    if (code === "0") result += "\\";
    else if (code === "1") result += "~";
    else if (code === "2") result += "@";
    else result += code;
  }
  return result;
};

export const isIndexedPack = (text: string | null | undefined): boolean => {
  return !!(text && String(text).indexOf(INDEXED_LOOKUP_PREFIX) === 0);
};

/** JSON array → packed `text~start~end~~...`. Legacy only; prefer packToChunkLayers. */
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

/** Split equally by characters into n chunks (mid-token cuts are OK). Legacy only. */
export const splitEqual = (str: string | null | undefined, n: number): string[] => {
  str = str == null ? "" : String(str);
  const size = Math.ceil(str.length / n) || 0;
  const chunks: string[] = [];
  for (let i = 0; i < n; i++) {
    chunks.push(size ? str.substring(i * size, (i + 1) * size) : "");
  }
  return chunks;
};

/**
 * v4 layers for captions_batch_01..15: lookup by second, then data batches
 * with row offsets. Must match captions.jsx packToChunkLayers.
 */
export const packToChunkLayers = (
  captions: CaptionPackToken[] | null | undefined,
): string[] => {
  const list = captions || [];
  const n = list.length;
  const rows: string[] = [];
  const starts: number[] = [];
  let wcount = 0;
  let lastSec = 0;
  let i: number;

  for (i = 0; i < n; i++) {
    const text = packTokenText(list[i]);
    const startMs = toMs(list[i].start);
    const endMs = toMs(list[i].end);
    const wordIndex = text === "" ? -1 : wcount;
    if (text !== "") wcount++;
    rows.push(startMs + "~" + endMs + "~" + wordIndex + "~" + escapeRowText(text));
    starts.push(startMs);
    let sec = Math.floor(startMs / MS);
    if (sec > lastSec) lastSec = sec;
    sec = Math.floor(endMs / MS + LUT_HOLD_PAD);
    if (sec > lastSec) lastSec = sec;
  }
  if (lastSec < 0) lastSec = 0;
  const secCount = n ? lastSec + 1 : 0;

  let lutCount = secCount ? Math.ceil(secCount / LUT_SECONDS) || 1 : 1;
  if (lutCount < 1) lutCount = 1;
  if (lutCount > CAPTION_BATCH_COUNT - 1) lutCount = CAPTION_BATCH_COUNT - 1;
  const dataCount = CAPTION_BATCH_COUNT - lutCount;

  const overlaps: string[] = [];
  const lastAt: number[] = [];
  for (i = 0; i < secCount; i++) {
    overlaps.push("");
    lastAt.push(-1);
  }
  let last = -1;
  let capI = 0;
  let s: number;
  for (s = 0; s < secCount; s++) {
    const limit = (s + 1) * MS - 1;
    while (capI < n && starts[capI] <= limit) {
      last = capI;
      capI++;
    }
    lastAt[s] = last;
  }
  for (i = 0; i < n; i++) {
    let a = Math.floor(starts[i] / MS);
    let b = Math.floor(toMs(list[i].end) / MS + LUT_HOLD_PAD);
    if (a < 0) a = 0;
    if (b >= secCount) b = secCount - 1;
    const token = String(i);
    for (s = a; s <= b; s++) {
      overlaps[s] = overlaps[s] ? overlaps[s] + "," + token : token;
    }
  }

  const chunks: string[] = [];
  for (i = 0; i < lutCount; i++) {
    const from = i * LUT_SECONDS;
    let to = i === lutCount - 1 ? secCount : from + LUT_SECONDS;
    if (to > secCount) to = secCount;
    let lutBody = "";
    for (let j = from; j < to; j++) {
      if (j > from) lutBody += ";";
      let entry = String(lastAt[j]) + "|";
      if (overlaps[j]) entry += overlaps[j];
      lutBody += entry;
    }
    if (i === 0) {
      chunks.push(INDEXED_LOOKUP_PREFIX + n + "~" + lutCount + ";;;" + lutBody);
    } else {
      chunks.push(INDEXED_LOOKUP_PREFIX + n + ";;;" + lutBody);
    }
  }

  const per = Math.ceil(n / dataCount) || 1;
  for (let bIdx = 0; bIdx < dataCount; bIdx++) {
    const startIndex = bIdx * per;
    if (startIndex >= n) {
      chunks.push("");
      continue;
    }
    let endIndex = startIndex + per;
    if (endIndex > n) endIndex = n;
    const offsets: number[] = [];
    let payload = "";
    let off = 0;
    for (i = startIndex; i < endIndex; i++) {
      offsets.push(off);
      payload += rows[i];
      off += rows[i].length;
      if (i < endIndex - 1) {
        payload += "@";
        off += 1;
      }
    }
    chunks.push(
      INDEXED_BATCH_PREFIX + startIndex + "~" + offsets.join(",") + BATCH_SEP + payload,
    );
  }

  while (chunks.length < CAPTION_BATCH_COUNT) chunks.push("");
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
  return packToChunkLayers(parseCaptionsRawJson(rawJson));
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

const unpackLegacyPacked = (packed: string): CaptionPackToken[] => {
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

const parseV4LookupHeader = (
  raw: string,
): { maxCaption: number; lutCount: number } | null => {
  if (!isIndexedPack(raw)) return null;
  const sep = raw.indexOf(";;;");
  if (sep < 0) return null;
  const header = raw.substring(INDEXED_LOOKUP_PREFIX.length, sep);
  const tilde = header.indexOf("~");
  let maxCaption: number;
  let lutCount: number;
  if (tilde < 0) {
    maxCaption = parseInt(header, 10);
    lutCount = 1;
  } else {
    maxCaption = parseInt(header.substring(0, tilde), 10);
    lutCount = parseInt(header.substring(tilde + 1), 10);
  }
  if (!isFinite(maxCaption) || maxCaption < 0) maxCaption = 0;
  if (!isFinite(lutCount) || lutCount < 1) lutCount = 1;
  if (lutCount > CAPTION_BATCH_COUNT - 1) lutCount = CAPTION_BATCH_COUNT - 1;
  return { maxCaption: maxCaption, lutCount: lutCount };
};

const parseV4Row = (row: string): CaptionPackToken => {
  const t1 = row.indexOf("~");
  const t2 = t1 >= 0 ? row.indexOf("~", t1 + 1) : -1;
  const t3 = t2 >= 0 ? row.indexOf("~", t2 + 1) : -1;
  if (t1 < 0 || t2 < 0 || t3 < 0) {
    return { text: "", start: 0, end: 0 };
  }
  return {
    start: parseInt(row.substring(0, t1), 10) / MS,
    end: parseInt(row.substring(t1 + 1, t2), 10) / MS,
    text: unescapeRowText(row.substring(t3 + 1)),
  };
};

const unpackIndexedChunks = (chunks: string[]): CaptionPackToken[] => {
  const header = parseV4LookupHeader(chunks[0] || "");
  if (!header) return [];
  const out: CaptionPackToken[] = [];
  const dataCount = CAPTION_BATCH_COUNT - header.lutCount;
  for (let slot = 0; slot < dataCount; slot++) {
    const raw = chunks[header.lutCount + slot] || "";
    if (!raw || raw.indexOf(INDEXED_BATCH_PREFIX) !== 0) continue;
    const sep = raw.indexOf(BATCH_SEP);
    if (sep < 0) continue;
    const payload = raw.substring(sep + BATCH_SEP.length);
    if (!payload) continue;
    const rows = payload.split("@");
    for (let r = 0; r < rows.length; r++) {
      if (!rows[r]) continue;
      out.push(parseV4Row(rows[r]));
    }
  }
  return out;
};

export const unpackCaptionChunks = (chunks: string[] | null | undefined): CaptionPackToken[] => {
  const normalized = normalizeCaptionChunks(chunks);
  if (isIndexedPack(normalized[0])) return unpackIndexedChunks(normalized);
  let packed = "";
  for (let i = 0; i < normalized.length; i++) packed += normalized[i];
  return unpackLegacyPacked(packed);
};

/** Decoder: v4 chunks, or legacy packed string (last two `~` fields are start/end). */
export const unpackCaptions = (
  packed: string | string[] | null | undefined,
): CaptionPackToken[] => {
  if (packed == null || packed === "") return [];
  if (typeof packed !== "string") return unpackCaptionChunks(packed);
  if (isIndexedPack(packed)) return [];
  return unpackLegacyPacked(packed);
};

export const packedCaptionsDisplayText = (
  packed: string | string[] | null | undefined,
): string => {
  const caps = unpackCaptions(packed);
  const words: string[] = [];
  for (let i = 0; i < caps.length; i++) {
    const t = String(caps[i].text == null ? "" : caps[i].text).replace(/^\s+|\s+$/g, "");
    if (t) words.push(t);
  }
  return words.join(" ");
};
