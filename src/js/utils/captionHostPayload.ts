import { fs, os, path } from "../lib/cep/node";
import type { Caption, GroupingMode, ScribeWord } from "../utils/transcribe";
import { captionsRawJsonToChunks, SEGMENT_TYPE_INDEX } from "../../shared/caption-system";

export { captionsRawJsonToChunks } from "../../shared/caption-system";

/** Слово с таймингом относительно начала сегмента. */
export type CaptionWordTiming = {
  text: string;
  timestamp: [number, number];
};

/**
 * Segment Type в mogrt — 0-based значение по имени (`Segment Type`):
 * Words = 0, Custom = 1. Lines / caption → `Line Count`, Characters / line → `Chars Per Line`.
 */
export const segmentTypeIndex = (mode: GroupingMode): number => {
  if (mode === "words") return SEGMENT_TYPE_INDEX.words;
  return SEGMENT_TYPE_INDEX.custom;
};

export const groupingModeFromSegmentType = (index: number): GroupingMode => {
  if (index === SEGMENT_TYPE_INDEX.words) return "words";
  return "custom";
};

export type HostCaptionPayload = {
  text: string;
  timestamp: [number, number];
  words: CaptionWordTiming[];
  /** Packed captions_batch_01..15 — CEP собирает v4 LUT + батчи, хост только setValue. */
  captionChunks: string[];
  /** JSON Scribe-токенов; хост пакует сам, если captionChunks нет. */
  captionsRawData?: string;
  segmentType: number;
  lineCount: number;
  charsPerLine: number;
  mogrtPath?: string;
  aepPath?: string;
};

const cloneScribeWord = (w: ScribeWord): ScribeWord => ({
  text: w.text,
  start: w.start,
  end: w.end,
  type: w.type,
  speaker_id: w.speaker_id ?? null,
});

/** Полный Scribe `words[]` — таймкоды относительно In / Work Area (как в MP3). */
export const toFullCaptionsRawData = (rawWords?: ScribeWord[]): string => {
  if (!rawWords?.length) return "[]";
  return JSON.stringify(rawWords.map(cloneScribeWord));
};

/**
 * Токены Scribe v2 для одного caption — тот же schema, что в ответе AI.
 * Таймкоды относительно In / Work Area (без offset таймлайна): слой/клип
 * начинается в In, внутри шаблона time 0 = старт MP3.
 */
export const toCaptionsRawData = (
  caption: Caption,
  _offset = 0,
  rawWords?: ScribeWord[],
): string => {
  const captionWords = caption.words ?? [];
  const tokens: ScribeWord[] = [];

  if (rawWords?.length && captionWords.length) {
    const first = captionWords[0].timestamp[0];
    const last = captionWords[captionWords.length - 1].timestamp[1];
    for (const token of rawWords) {
      const t0 = token.start;
      if (typeof t0 !== "number") continue;
      if (token.type === "spacing") {
        if (t0 >= first - 0.001 && t0 < last + 0.001) tokens.push(cloneScribeWord(token));
        continue;
      }
      if (token.type && token.type !== "word") continue;
      const t1 = typeof token.end === "number" ? token.end : t0;
      if (t1 > first - 0.001 && t0 < last + 0.001) tokens.push(cloneScribeWord(token));
    }
  }

  if (!tokens.length) {
    for (let i = 0; i < captionWords.length; i++) {
      const w = captionWords[i];
      tokens.push({
        text: w.text,
        start: w.timestamp[0],
        end: w.timestamp[1],
        type: "word",
        speaker_id: null,
      });
      if (i < captionWords.length - 1) {
        tokens.push({
          text: "",
          start: w.timestamp[1],
          end: captionWords[i + 1].timestamp[0],
          type: "spacing",
          speaker_id: null,
        });
      }
    }
  }

  return JSON.stringify(tokens);
};

/** Патч текстов word-токенов в полном Scribe dump после live-edit карточки. */
export const patchCaptionsRawData = (
  rawWords: ScribeWord[] | undefined,
  caption: Caption,
  newText: string,
): string => {
  if (!rawWords?.length) return toCaptionsRawData({ ...caption, text: newText });
  const words = rawWords.map(cloneScribeWord);
  const captionWords = caption.words ?? [];
  const newTokens = newText.trim().split(/\s+/).filter(Boolean);
  const first = captionWords[0]?.timestamp[0];
  const last = captionWords[captionWords.length - 1]?.timestamp[1];
  let wi = 0;
  for (const token of words) {
    if (token.type && token.type !== "word") continue;
    if (typeof token.start !== "number") continue;
    if (first != null && last != null && (token.start < first - 0.02 || token.start > last + 0.02)) {
      continue;
    }
    if (wi < newTokens.length) token.text = newTokens[wi++];
  }
  return JSON.stringify(words);
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Тайминги слов относительно start сегмента (как в шаблоне: [0,…], […,…]).
 * Берём реальные word timestamps из транскрипции; иначе — пропорционально по символам.
 */
export const buildRelativeWordTimings = (caption: Caption): CaptionWordTiming[] => {
  const segStart = caption.timestamp[0];
  const segEnd = caption.timestamp[1];
  const segDur = Math.max(0.001, segEnd - segStart);

  if (caption.words?.length) {
    return caption.words.map((w) => {
      const start = clamp(w.timestamp[0] - segStart, 0, segDur);
      const end = clamp(w.timestamp[1] - segStart, start, segDur);
      return {
        text: w.text,
        timestamp: [start, end] as [number, number],
      };
    });
  }

  const tokens = caption.text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return [];

  const totalChars = tokens.reduce((s, t) => s + t.length, 0) || tokens.length;
  let cursor = 0;
  return tokens.map((text, i) => {
    const dur = segDur * (text.length / totalChars);
    const start = i === 0 ? 0 : cursor;
    const end = i === tokens.length - 1 ? segDur : clamp(start + dur, start, segDur);
    cursor = end;
    return { text, timestamp: [start, end] as [number, number] };
  });
};

/** Минимальная длительность клипа — иначе Premiere/AE падают на end <= start. */
const MIN_CAPTION_DUR = 0.05;

/** Один клип/слой на весь In/Out (Work Area): mogrt сам режет по Segment Type. */
export const toHostCaptionPayload = (
  captions: Caption[],
  opts: {
    offset?: number;
    durationSeconds?: number;
    mogrtPath?: string;
    aepPath?: string;
    rawWords?: ScribeWord[];
    mode?: GroupingMode;
    lines?: number;
    characters?: number;
  } = {},
): HostCaptionPayload[] => {
  const offset = opts.offset ?? 0;
  const lastEnd = captions.length ? Number(captions[captions.length - 1].timestamp[1]) || 0 : 0;
  const duration =
    opts.durationSeconds && opts.durationSeconds > 0
      ? opts.durationSeconds
      : Math.max(MIN_CAPTION_DUR, lastEnd);
  const start = offset;
  let end = offset + duration;
  if (!(end > start)) end = start + MIN_CAPTION_DUR;

  const text =
    captions
      .map((c) => String(c.text || "").trim())
      .filter(Boolean)
      .join(" ") || "Captions";
  const fallbackWords = captions.flatMap((c) => c.words ?? []);
  const captionsRawData = opts.rawWords?.length
    ? toFullCaptionsRawData(opts.rawWords)
    : toCaptionsRawData({
        text,
        timestamp: [0, duration],
        lines: [text],
        words: fallbackWords,
        edit: { target: "words", indices: fallbackWords.map((_, i) => i) },
      });

  return [
    {
      text,
      timestamp: [start, end] as [number, number],
      words: [],
      captionChunks: captionsRawJsonToChunks(captionsRawData),
      captionsRawData,
      segmentType: segmentTypeIndex(opts.mode ?? "custom"),
      lineCount: Math.max(1, opts.lines ?? 2),
      charsPerLine: Math.max(1, opts.characters ?? 20),
      mogrtPath: opts.mogrtPath,
      aepPath: opts.aepPath,
    },
  ];
};

/**
 * Пишет payload во временный JSON (только ASCII + \\uXXXX) и передаёт путь в JSX.
 * Так кириллица не ломается ни в evalScript, ни при чтении файла в ExtendScript.
 */
export const withHostJsonFile = async <T>(
  data: unknown,
  run: (filePath: string) => Promise<T>,
): Promise<T> => {
  const dir = path.join(os.tmpdir(), "aitools-cep");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `host-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  const asciiJson = JSON.stringify(data).replace(/[\u007f-\uffff]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${hex}`;
  });
  fs.writeFileSync(filePath, asciiJson, "utf8");
  try {
    return await run(filePath);
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // temp cleanup best-effort
    }
  }
};
