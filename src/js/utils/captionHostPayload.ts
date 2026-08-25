import { fs, os, path } from "../lib/cep/node";
import type { Caption, CaptionsChunk, CaptionWord, GroupingMode, ScribeWord, TranscribeResult } from "../utils/transcribe";
import {
  packToChunkLayers,
  SEGMENT_TYPE_INDEX,
  type CaptionBreak,
  type CaptionPackToken,
} from "../../shared/caption-system";
import { getBundledCaptionsJsxPath } from "./captionsJsx";

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
  styleName?: string;
  /** AE only: expression library the template loads as `footage("captions.jsx")`. */
  captionsJsxPath?: string;
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

/**
 * Разбивка панели → флаги по глобальному индексу слова (`CaptionWord.gi`, он же
 * индекс в `words.chunks`). Это всё, что нужно captions.jsx, чтобы нарисовать
 * сегменты as is: конец строки и конец сегмента.
 */
export const captionBreaks = (captions: Caption[]): Record<number, CaptionBreak> => {
  const out: Record<number, CaptionBreak> = {};
  for (const caption of captions) {
    const words = caption.words ?? [];
    if (!words.length) continue;
    const counts = caption.lineWordCounts ?? [];
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (counts.length > 1 && total === words.length) {
      let pos = 0;
      for (let li = 0; li < counts.length - 1; li++) {
        pos += counts[li];
        out[words[pos - 1].gi] = "line";
      }
    }
    out[words[words.length - 1].gi] = "segment";
  }
  return out;
};

/**
 * Как scribeToTranscription: в `words.chunks` попадают только словесные токены с
 * текстом, значит и `gi` считается по ним же. Пак считает словом любой непустой
 * токен, поэтому нумеровать маркеры его правилом нельзя — флаги съедут на
 * первом же audio_event.
 */
const isPanelWord = (token: CaptionPackToken): boolean => {
  if (token.type && token.type !== "word") return false;
  return String(token.text ?? "").trim() !== "";
};

/** Scribe-дамп → токены пака: словам в позициях с разбивкой ставим флаг. */
const withBreaks = (
  tokens: CaptionPackToken[],
  breaks: Record<number, CaptionBreak>,
): CaptionPackToken[] => {
  let gi = 0;
  return tokens.map((token) => {
    if (!isPanelWord(token)) return token;
    const brk = breaks[gi];
    gi++;
    return brk ? { ...token, breakAfter: brk } : token;
  });
};

/** Слова caption-ов → токены пака (word + spacing), когда Scribe-дампа нет. */
const wordsToPackTokens = (
  words: CaptionWord[],
  breaks: Record<number, CaptionBreak>,
): CaptionPackToken[] => {
  const tokens: CaptionPackToken[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    tokens.push({
      text: w.text,
      start: w.timestamp[0],
      end: w.timestamp[1],
      type: "word",
      breakAfter: breaks[w.gi] ?? null,
    });
    if (i < words.length - 1) {
      tokens.push({
        text: "",
        start: w.timestamp[1],
        end: words[i + 1].timestamp[0],
        type: "spacing",
      });
    }
  }
  return tokens;
};

/** words.chunks → Scribe tokens (word + spacing) for v4 pack. */
export const chunksToScribeWords = (chunks: CaptionsChunk[]): ScribeWord[] => {
  const tokens: ScribeWord[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const w = chunks[i];
    tokens.push({
      text: w.text,
      start: w.timestamp[0],
      end: w.timestamp[1],
      type: "word",
      speaker_id: null,
    });
    if (i < chunks.length - 1) {
      tokens.push({
        text: "",
        start: w.timestamp[1],
        end: chunks[i + 1].timestamp[0],
        type: "spacing",
        speaker_id: null,
      });
    }
  }
  return tokens;
};

/**
 * Keep Scribe `raw.words` aligned with `words.chunks` after a text edit.
 * If counts diverge (user added/removed words), rebuild the dump so we never
 * pack a single caption and wipe the rest of Store hidden.
 */
export const syncRawWordsFromChunks = (
  rawWords: ScribeWord[] | undefined,
  chunks: CaptionsChunk[],
): ScribeWord[] => {
  if (!chunks.length) return [];
  if (!rawWords?.length) return chunksToScribeWords(chunks);
  let wordCount = 0;
  for (let i = 0; i < rawWords.length; i++) {
    const t = rawWords[i];
    if (t.type && t.type !== "word") continue;
    wordCount++;
  }
  if (wordCount !== chunks.length) return chunksToScribeWords(chunks);
  let wi = 0;
  return rawWords.map((t) => {
    if (t.type && t.type !== "word") return cloneScribeWord(t);
    const chunk = chunks[wi++];
    const next = cloneScribeWord(t);
    next.text = chunk.text;
    next.start = chunk.timestamp[0];
    next.end = chunk.timestamp[1];
    return next;
  });
};

export const withSyncedRawWords = (
  source: TranscribeResult,
  wordChunks: CaptionsChunk[],
): TranscribeResult => {
  const rawWords = syncRawWordsFromChunks(source.raw?.words, wordChunks);
  return {
    ...source,
    words: { ...source.words, chunks: wordChunks },
    raw: source.raw ? { ...source.raw, words: rawWords } : { words: rawWords },
  };
};

/**
 * Full v4 batches for the whole transcript. Empty array = nothing to write (do not wipe host).
 * `captions` — текущая разбивка панели: без неё пак уедет без маркеров и mogrt
 * снова начнёт считать сегменты сам.
 */
export const packTranscriptionToChunks = (
  source: TranscribeResult,
  captions?: Caption[],
): string[] => {
  const wordChunks = source.words?.chunks ?? [];
  const tokens = source.raw?.words?.length
    ? source.raw.words
    : chunksToScribeWords(wordChunks);
  if (!tokens.length) return [];
  const packed = packToChunkLayers(
    captions?.length ? withBreaks(tokens, captionBreaks(captions)) : tokens,
  );
  for (let i = 0; i < packed.length; i++) {
    if (packed[i]) return packed;
  }
  return [];
};

/** @deprecated use withSyncedRawWords + packTranscriptionToChunks — never pack a single caption. */
export const patchCaptionsRawData = (
  rawWords: ScribeWord[] | undefined,
  caption: Caption,
  newText: string,
): string => {
  const captionWords = caption.words ?? [];
  const newTokens = newText.trim().split(/\s+/).filter(Boolean);
  if (!rawWords?.length) {
    if (captionWords.length !== newTokens.length) {
      return toCaptionsRawData({ ...caption, text: newText });
    }
    const patched = captionWords.map((w, i) => ({
      text: newTokens[i],
      timestamp: w.timestamp,
    }));
    return JSON.stringify(chunksToScribeWords(patched));
  }
  return JSON.stringify(syncRawWordsFromChunks(rawWords, captionWords.map((w, i) => ({
    text: i < newTokens.length ? newTokens[i] : w.text,
    timestamp: w.timestamp,
  }))));
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
    styleName?: string;
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
  // в пак кладём разбивку панели — mogrt рисует сегменты as is
  const breaks = captionBreaks(captions);
  const packTokens = opts.rawWords?.length
    ? withBreaks(opts.rawWords, breaks)
    : wordsToPackTokens(fallbackWords, breaks);

  return [
    {
      text,
      timestamp: [start, end] as [number, number],
      words: [],
      captionChunks: packToChunkLayers(packTokens),
      // тот же поток, что ушёл в chunks: если хост перепакует JSON, маркеры не потеряются
      captionsRawData: JSON.stringify(packTokens),
      segmentType: segmentTypeIndex(opts.mode ?? "custom"),
      lineCount: Math.max(1, opts.lines ?? 2),
      charsPerLine: Math.max(1, opts.characters ?? 20),
      mogrtPath: opts.mogrtPath,
      aepPath: opts.aepPath,
      styleName: opts.styleName,
      captionsJsxPath: getBundledCaptionsJsxPath() ?? undefined,
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
    return await run(filePath.replace(/\\/g, "/"));
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // temp cleanup best-effort
    }
  }
};
