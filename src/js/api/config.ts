/**
 * Motion Flow API — production: https://motionflow.pro
 *
 * In dev (`vite`), requests use a relative path so they hit this
 * dev server's origin and get forwarded by `server.proxy` in
 * `vite.config.ts` (avoids CORS during local panel development).
 */
export const API_BASE = import.meta.env.DEV ? "" : "https://motionflow.pro";

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

/** Public — Spunkram extension update manifest + ffmpeg CDN URLs (Bearer unlocks beta). */
export const UPDATE_ENDPOINT = "/api/cep/update" as const;
/** Admin — full list of uploaded ZXP versions */
export const UPDATE_VERSIONS_ENDPOINT = "/api/cep/update/versions" as const;

/**
 * Каталог MOGRT/AEP-стилей — код из предыдущей версии продукта (Captions CEP),
 * оставлен в репозитории, но в текущем flow не используется.
 */
export const CAPTIONS_ENDPOINTS = {
  /** GET — дерево категорий → captions (публичный) */
  catalog: "/api/captions",
  /**
   * POST — скачать project.mogrt / project.aep
   * Body: { id, file?: "mogrt" | "aep" }
   * Требует session cookie + подписку.
   */
  download: "/api/captions",
} as const;

/** @deprecated используйте CAPTIONS_ENDPOINTS */
export const PRESET_ENDPOINTS = CAPTIONS_ENDPOINTS;

export const apiUrl = (path: string): string =>
  path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
