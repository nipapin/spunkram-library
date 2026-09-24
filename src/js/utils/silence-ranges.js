const MIN_CUT_SEC = 0.04;
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
/**
 * Pauses are gaps between speech (and other kept sounds), not waveform energy.
 * Scribe `spacing` tokens are the gaps. `audio_event` (laugh, breath) is kept.
 */
const isKeptSound = (token) => {
    if (token.type === "spacing")
        return false;
    if (token.type === "audio_event")
        return true;
    if (token.type && token.type !== "word")
        return false;
    if (token.text != null && token.text.trim() === "" && token.type !== "word")
        return false;
    return isFiniteNumber(token.start) && isFiniteNumber(token.end) && token.end > token.start;
};
const mergeSpans = (spans) => {
    const sorted = spans.slice().sort((a, b) => a.start - b.start);
    const merged = [];
    for (const span of sorted) {
        const last = merged[merged.length - 1];
        if (last && span.start <= last.end) {
            last.end = Math.max(last.end, span.end);
        }
        else {
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
export function silenceRangesFromTokens(tokens, options) {
    const minGap = Math.max(0, options.minGapSec);
    const pad = Math.max(0, options.padSec);
    const kept = [];
    for (const token of tokens) {
        if (!isKeptSound(token))
            continue;
        const start = token.start;
        const end = token.end;
        kept.push({ start, end });
    }
    const speech = mergeSpans(kept);
    if (!speech.length)
        return [];
    const ranges = [];
    const pushGap = (gapStart, gapEnd) => {
        if (gapEnd - gapStart < minGap)
            return;
        const start = gapStart + pad;
        const end = gapEnd - pad;
        if (end - start >= MIN_CUT_SEC)
            ranges.push({ start, end });
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
