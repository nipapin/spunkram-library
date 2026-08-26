/**
 * Motion Flow API — production: https://motionflow.pro
 */
export const API_BASE = "https://motionflow.pro";

export const GENERATIONS_ENDPOINTS = {
  /** POST — транскрипция аудио (multipart/form-data), см. utils/transcribe.ts */
  captions: "/api/generations/captions",
  /**
   * POST — главы (chapters) + варианты названия ролика по таймингам транскрипта.
   * Body: { chunks: { text: string; timestamp: [number, number] }[] }
   */
  chapters: "/api/generations/chapters",
  /**
   * GET/POST — баланс генераций для CEP (session cookie или CEP identity).
   * @see /api/cep/generations
   */
  credits: "/api/cep/generations",
  /**
   * POST — TTS voiceover (Minimax via Motionflow).
   * Body: { text, voice_id, speed?, language_boost? }
   */
  voiceover: "/api/generations/voiceover",
} as const;

export const VOICEOVER_ENDPOINTS = {
  /** GET — Minimax voices + language_boost options */
  voices: "/api/cep/voiceover/voices",
} as const;

/** Signed-in CEP — Spunkram extension update manifest (Bearer required; beta allowlist unlocks beta.json). */
export const UPDATE_ENDPOINT = "/api/cep/update" as const;
/** Admin — full list of uploaded ZXP versions */
export const UPDATE_VERSIONS_ENDPOINT = "/api/cep/update/versions" as const;

/** POST — CEP error observer → Telegram support topic (optional Bearer). */
export const SUPPORT_ENDPOINT = "/api/cep/support/report" as const;

/** POST — host app version + OS after sign-in (Bearer required). */
export const TELEMETRY_SESSION_ENDPOINT = "/api/cep/telemetry/session" as const;

/**
 * Каталог MOGRT/AEP-стилей — код из предыдущей версии продукта (Captions CEP),
 * оставлен в репозитории, но в текущем flow не используется.
 */
export const CAPTIONS_ENDPOINTS = {
  /** GET — дерево категорий → captions (публичный) */
  catalog: "/api/captions",
  /**
   * POST — скачать `{Pack}.mogrt` / `{Pack}.aep`
   * Body: { id: packName, file?: "mogrt" | "aep" }
   * Требует session cookie + подписку.
   */
  download: "/api/captions",
} as const;

/** @deprecated используйте CAPTIONS_ENDPOINTS */
export const PRESET_ENDPOINTS = CAPTIONS_ENDPOINTS;

export const apiUrl = (path: string): string =>
  path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
