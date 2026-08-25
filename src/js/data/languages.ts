/** Source languages for ASR (Whisper large-v3 multilingual set — common subset). */
export const SRC_LANGS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "ru", label: "Russian" },
  { value: "es", label: "Spanish" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "tr", label: "Turkish" },
  { value: "pl", label: "Polish" },
  { value: "nl", label: "Dutch" },
  { value: "uk", label: "Ukrainian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
];

/**
 * Translation targets — must stay in sync with Motion Flow
 * `LANGUAGE_NAMES` used by /api/generations/captions translate pass
 * and /api/generations/chapters language.
 */
export const TRANSLATE_TARGETS: { value: string; label: string }[] = [
  { value: "off", label: "No translation" },
  { value: "en", label: "Translate → EN" },
  { value: "ru", label: "Translate → RU" },
  { value: "es", label: "Translate → ES" },
  { value: "de", label: "Translate → DE" },
  { value: "fr", label: "Translate → FR" },
  { value: "tr", label: "Translate → TR" },
  { value: "it", label: "Translate → IT" },
  { value: "pt", label: "Translate → PT" },
  { value: "pl", label: "Translate → PL" },
  { value: "uk", label: "Translate → UK" },
];

/** Scribe may return ISO-639-3; chapters API expects the 2-letter codes above. */
const ISO639_3_TO_1: Record<string, string> = {
  eng: "en",
  rus: "ru",
  spa: "es",
  deu: "de",
  ger: "de",
  fra: "fr",
  fre: "fr",
  ita: "it",
  por: "pt",
  tur: "tr",
  pol: "pl",
  nld: "nl",
  dut: "nl",
  ukr: "uk",
  jpn: "ja",
  kor: "ko",
  zho: "zh",
  chi: "zh",
  ara: "ar",
  hin: "hi",
};

/** ISO-639-1 for the chapters API, or undefined if the UI sent auto/off/empty. */
export const normalizeLanguageCode = (code?: string | null): string | undefined => {
  if (!code) return undefined;
  const primary = code.trim().toLowerCase().replace(/_/g, "-").split("-")[0];
  if (!primary || primary === "auto" || primary === "off") return undefined;
  return ISO639_3_TO_1[primary] ?? primary;
};

/**
 * Language for /api/generations/chapters: translation target if set, otherwise
 * the source language (or Scribe's detected code when source is Auto-detect).
 */
export const resolveChaptersLanguage = (opts: {
  srcLang?: string;
  translateTo?: string;
  detected?: string | null;
}): string | undefined =>
  normalizeLanguageCode(opts.translateTo) ??
  normalizeLanguageCode(opts.srcLang) ??
  normalizeLanguageCode(opts.detected);
