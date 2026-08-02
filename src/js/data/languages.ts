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
