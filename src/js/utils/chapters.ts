import { API_BASE, GENERATIONS_ENDPOINTS } from "../api";
import { getUserIdentity } from "../api/user";
import type { CaptionsChunk } from "./transcribe";

export class ChapterApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ChapterApiError";
    this.status = status;
    this.code = code;
  }
}

/** Один timestamp-раздел, как возвращает сервер. */
export type ChapterSection = { topic: string; time: number };

/** Редактируемая глава в UI — есть стабильный id для React-ключей и правок. */
export type Chapter = {
  id: string;
  title: string;
  time: number; // секунды
};

let nextChapterId = 0;
const makeChapterId = () => `ch-${Date.now()}-${nextChapterId++}`;

export const sectionsToChapters = (sections: ChapterSection[]): Chapter[] =>
  sections.map((s) => ({ id: makeChapterId(), title: s.topic, time: s.time }));

export const createChapter = (time = 0, title = "New chapter"): Chapter => ({
  id: makeChapterId(),
  title,
  time,
});

// "all" — единственный запрос сразу после транскрипции; остальные — точечный
// Regenerate конкретной секции (не тратит токены модели на прочие поля).
// Каждый вызов, включая regenerate, списывает 1 генерацию пользователя на сервере.
export type GenerationTarget = "all" | "titles" | "chapters" | "description" | "tags";

type GenerationResponse = {
  titles?: string[];
  sections?: ChapterSection[];
  description?: string;
  tags?: string[];
};

export type GenerateAllResult = {
  titles: string[];
  sections: ChapterSection[];
  description: string;
  tags: string[];
};

const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

const callGenerations = async (
  chunks: CaptionsChunk[],
  target: GenerationTarget,
  signal?: AbortSignal,
  // ISO-код языка (см. TRANSLATE_TARGETS в ChaptersTab) — когда задан, ВСЕ
  // запрошенные поля (не только транскрипт) выводятся на этом языке
  language?: string,
  meter?: { chaptersReceipt?: string; durationSeconds?: number },
): Promise<GenerationResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort("cancelled");
  if (signal) {
    if (signal.aborted) controller.abort("cancelled");
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const user = getUserIdentity();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user.token) headers.Authorization = `Bearer ${user.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${GENERATIONS_ENDPOINTS.chapters}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        chunks,
        target,
        ...(language ? { language } : {}),
        ...(meter?.chaptersReceipt ? { chaptersReceipt: meter.chaptersReceipt } : {}),
        ...(typeof meter?.durationSeconds === "number" && meter.durationSeconds > 0
          ? { durationSeconds: meter.durationSeconds }
          : {}),
        email: user.email || undefined,
        userId: user.id || undefined,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      if (signal?.aborted) throw new Error("Cancelled");
      throw new Error("Chapter generation request timed out");
    }
    throw e;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onExternalAbort);
  }

  if (signal?.aborted) throw new Error("Cancelled");

  let data: { error?: string; code?: string } & GenerationResponse;
  try {
    data = await response.json();
  } catch {
    throw new ChapterApiError(`HTTP ${response.status}`, response.status);
  }

  if (!response.ok) {
    throw new ChapterApiError(
      data.error ?? `HTTP ${response.status}`,
      response.status,
      typeof data.code === "string" ? data.code : undefined,
    );
  }

  return data;
};

export const generateAll = async (
  chunks: CaptionsChunk[],
  signal?: AbortSignal,
  language?: string,
  meter?: { chaptersReceipt?: string; durationSeconds?: number },
): Promise<GenerateAllResult> => {
  const data = await callGenerations(chunks, "all", signal, language, meter);
  return {
    titles: Array.isArray(data.titles) ? data.titles : [],
    sections: Array.isArray(data.sections) ? data.sections : [],
    description: typeof data.description === "string" ? data.description : "",
    tags: Array.isArray(data.tags) ? data.tags : [],
  };
};

export const regenerateTitles = async (
  chunks: CaptionsChunk[],
  signal?: AbortSignal,
  language?: string,
): Promise<string[]> => {
  const data = await callGenerations(chunks, "titles", signal, language);
  return Array.isArray(data.titles) ? data.titles : [];
};

export const regenerateChapters = async (
  chunks: CaptionsChunk[],
  signal?: AbortSignal,
  language?: string,
): Promise<ChapterSection[]> => {
  const data = await callGenerations(chunks, "chapters", signal, language);
  return Array.isArray(data.sections) ? data.sections : [];
};

export const regenerateDescription = async (
  chunks: CaptionsChunk[],
  signal?: AbortSignal,
  language?: string,
): Promise<string> => {
  const data = await callGenerations(chunks, "description", signal, language);
  return typeof data.description === "string" ? data.description : "";
};

export const regenerateTags = async (
  chunks: CaptionsChunk[],
  signal?: AbortSignal,
  language?: string,
): Promise<string[]> => {
  const data = await callGenerations(chunks, "tags", signal, language);
  return Array.isArray(data.tags) ? data.tags : [];
};

/**
 * Теги в UI и при копировании — как YouTube-хэштеги: `#spunkram #adobe #etc`
 * (с решёткой, через пробел, без запятых).
 */
const toHashtag = (tag: string): string => {
  const cleaned = tag
    .trim()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .join("");
  if (!cleaned) return "";
  return `#${cleaned.toLowerCase()}`;
};

export const tagsToHashtags = (tags: string[]): string =>
  tags.map(toHashtag).filter(Boolean).join(" ");

/** Массив тегов → текст для textarea / storage. */
export const tagsToText = (tags: string[]): string => tagsToHashtags(tags);

/** Текст из textarea (`#a #b` или legacy `a, b`) → массив без решёток. */
export const parseTagsText = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#+/, ""))
    .filter(Boolean);

// YouTube требует минимум 3 главы, чтобы показать их как timestamps в описании
export const MIN_YOUTUBE_CHAPTERS = 3;
// минимальный интервал между главами, который YouTube ещё принимает
export const MIN_CHAPTER_GAP_SECONDS = 10;
const HOUR = 3600;

const pad = (value: number, size = 2) => String(Math.max(0, Math.trunc(value))).padStart(size, "0");

/** секунды -> "MM:SS" или "HH:MM:SS", если весь ролик длиннее часа */
export const formatChapterTimestamp = (seconds: number, useHours: boolean): string => {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / HOUR);
  const m = Math.floor((total % HOUR) / 60);
  const s = total % 60;
  return useHours ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** "MM:SS" / "HH:MM:SS" (или отдельные части через ":") -> секунды; null, если не распознано */
export const parseChapterTimestamp = (text: string): number | null => {
  const parts = text.trim().split(":");
  if (!parts.length || parts.some((p) => p.trim() === "" || Number.isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * HOUR + nums[1] * 60 + nums[2];
  return null;
};

/**
 * Список глав, отсортированных по времени, готовый для отображения/копирования.
 * Первая глава всегда показывается как 00:00 — так того требует YouTube,
 * даже если фактический таймкод первой темы больше нуля.
 */
export const buildYoutubeChapterLines = (chapters: Chapter[]): string[] => {
  const sorted = [...chapters].sort((a, b) => a.time - b.time);
  const useHours = sorted.length > 0 && sorted[sorted.length - 1].time >= HOUR;
  return sorted.map((c, i) => {
    const label = i === 0 ? formatChapterTimestamp(0, useHours) : formatChapterTimestamp(c.time, useHours);
    return `${label} ${c.title.trim()}`;
  });
};

export const formatChaptersForYoutube = (chapters: Chapter[]): string =>
  buildYoutubeChapterLines(chapters).join("\n");

/**
 * Цельный блок для поля Description на YouTube: текст описания, список таймкодов глав
 * и теги в виде #хэштегов в конце. Каждая часть — своим абзацем; отсутствующие части
 * пропускаются без лишних пустых строк.
 */
export const formatFullDescription = (description: string, chapters: Chapter[], tagsText: string): string => {
  const desc = description.trim();
  const chapterLines = formatChaptersForYoutube(chapters);
  const hashtags = tagsToHashtags(parseTagsText(tagsText));
  return [desc, chapterLines, hashtags].filter(Boolean).join("\n\n");
};
