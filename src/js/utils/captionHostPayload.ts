import { fs, os, path } from "../lib/cep/node";
import type { Caption } from "../utils/transcribe";

/** Слово с таймингом относительно начала сегмента (для Essential Property `timings`). */
export type CaptionWordTiming = {
  text: string;
  timestamp: [number, number];
};

export type HostCaptionPayload = {
  text: string;
  timestamp: [number, number];
  words: CaptionWordTiming[];
  mogrtPath?: string;
  aepPath?: string;
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

/** Payload для evalTS("createCaptions" | resegment). */
export const toHostCaptionPayload = (
  captions: Caption[],
  opts: { offset?: number; mogrtPath?: string; aepPath?: string } = {},
): HostCaptionPayload[] => {
  const offset = opts.offset ?? 0;
  return captions.map((c) => {
    const start = (Number(c.timestamp[0]) || 0) + offset;
    let end = (Number(c.timestamp[1]) || 0) + offset;
    if (!(end > start)) end = start + MIN_CAPTION_DUR;
    const normalized: Caption = {
      ...c,
      timestamp: [start - offset, end - offset] as [number, number],
    };
    return {
      text: c.text,
      timestamp: [start, end] as [number, number],
      words: buildRelativeWordTimings(normalized),
      mogrtPath: opts.mogrtPath,
      aepPath: opts.aepPath,
    };
  });
};

/** JSON-строка для Essential Property `timings`. */
export const stringifyTimings = (words: CaptionWordTiming[]): string =>
  JSON.stringify(words);

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
