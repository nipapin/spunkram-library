/** Captions / Chapters: 1 generation per 10 minutes, rounded up. */
export const durationGenerationsCost = (durationSeconds: number): number => {
    const sec = Number(durationSeconds);
    if (!(sec > 0) || !Number.isFinite(sec)) return 1;
    const minutes = sec / 60;
    return Math.max(1, Math.ceil(minutes / 10));
};

/** Voiceover: 1 generation per 1000 characters, rounded up. */
export const textGenerationsCost = (charCount: number): number => {
    const n = Math.max(0, Math.floor(Number(charCount) || 0));
    if (n <= 0) return 1;
    return Math.max(1, Math.ceil(n / 1000));
};

/** Button label: `Transcribe ( 2 )`. */
export const withGenerationCostLabel = (label: string, cost: number): string =>
  `${label} ( ${Math.max(1, Math.floor(cost) || 1)} )`;
