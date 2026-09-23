export type SilenceRange = { start: number; end: number };

/** Word or non-speech token from the captions transcription (Scribe or word chunks). */
export type SilenceToken = {
  start?: number | null;
  end?: number | null;
  /** "word" | "spacing" | "audio_event" — spacing is the gap, not speech. */
  type?: string;
  text?: string;
};

export type SilenceRangeOptions = {
  /** Raw pause between kept tokens must be at least this long (seconds). */
  minGapSec: number;
  /** Leave this much audio on each side of a cut so words are not clipped. */
  padSec: number;
  /** Export length. Used for silence after the last word. */
  durationSec?: number;
};

const MIN_CUT_SEC = 0.04;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Pauses are gaps between speech (and other kept sounds), not waveform energy.
 * Scribe `spacing` tokens are the gaps. `audio_event` (laugh, breath) is kept.
 */
const isKeptSound = (token: SilenceToken): boolean => {
  if (token.type === "spacing") return false;
  if (token.type === "audio_event") return true;
  if (token.type && token.type !== "word") return false;
  if (token.text != null && token.text.trim() === "" && token.type !== "word") return false;
  return isFiniteNumber(token.start) && isFiniteNumber(token.end) && token.end > token.start;
};

const mergeSpans = (spans: SilenceRange[]): SilenceRange[] => {
  const sorted = spans.slice().sort((a, b) => a.start - b.start);
  const merged: SilenceRange[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ start: span.start, end: span.end });
    }
  }
  return merged;
};

/**
 * Silence ranges relative to the exported audio (0 = In / Work Area start).
 * A gap is cut only when the unpadded pause is at least `minGapSec`.
 * Padding is removed from both edges of that gap.
 */
export function silenceRangesFromTokens(
  tokens: SilenceToken[],
  options: SilenceRangeOptions,
): SilenceRange[] {
  const minGap = Math.max(0, options.minGapSec);
  const pad = Math.max(0, options.padSec);
  const kept: SilenceRange[] = [];

  for (const token of tokens) {
    if (!isKeptSound(token)) continue;
    const start = token.start as number;
    const end = token.end as number;
    kept.push({ start, end });
  }

  const speech = mergeSpans(kept);
  if (!speech.length) return [];

  const ranges: SilenceRange[] = [];
  const pushGap = (gapStart: number, gapEnd: number) => {
    if (gapEnd - gapStart < minGap) return;
    const start = gapStart + pad;
    const end = gapEnd - pad;
    if (end - start >= MIN_CUT_SEC) ranges.push({ start, end });
  };

  pushGap(0, speech[0].start);
  for (let i = 0; i < speech.length - 1; i++) {
    pushGap(speech[i].end, speech[i + 1].start);
  }
  if (isFiniteNumber(options.durationSec) && options.durationSec > 0) {
    pushGap(speech[speech.length - 1].end, options.durationSec);
  }

  return ranges;
}
