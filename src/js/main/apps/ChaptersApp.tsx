import { useEffect, useRef, useState } from "react";
import { ChaptersTab, type ChaptersHistoryPreview } from "../../components/ChaptersTab";
import {
  ProgressDialog,
  CHAPTERS_PROGRESS_STEPS,
  type DescribeProgress,
} from "../../components/ProgressDialog";
import { fs } from "../../lib/cep/node";
import { reloadJSX } from "../../lib/utils/bolt";
import { storageKey } from "@brands";
import { Motionflow } from "@/sdk";
import { hostSdk, sdkData } from "@/sdk/host-api";
import { convertToMp3 } from "../../utils/ffmpeg";
import { getBundledAudioPresetPath } from "../../utils/audioPreset";
import { describeForExport } from "../../utils/describeForExport";
import { getUserIdentity } from "../../api";
import { reportSupportError } from "../../api/support";
import { authErrorMessage } from "../../styles";
import { normalize, transcribe, type CaptionsChunk, type TranscribeResult } from "../../utils/transcribe";
import {
  ChapterApiError,
  createChapter,
  formatFullDescription,
  generateAll,
  regenerateChapters,
  regenerateDescription,
  regenerateTags,
  regenerateTitles,
  sectionsToChapters,
  tagsToHashtags,
  tagsToText,
  parseTagsText,
  type Chapter,
} from "../../utils/chapters";
import { friendlyErrorMessage, isSoftHostError } from "../../utils/user-error";
import { useWorkRangeCost } from "../../hooks/useWorkRangeCost";
import { withGenerationCostLabel } from "../../utils/generationCost";
import { copyToClipboard } from "../../utils/clipboard";
import * as panelStore from "../../lib/userdata-store";
import { usePanelUI } from "../../lib/panel-ui-context";
import "./ChaptersApp.scss";
import { useConfiguration } from "../../../context/ConfigurationWrapper";

const TRANSCRIPTION_KEY = "aitools-cep-chapters-transcription";
const RESULT_KEY = "aitools-cep-chapters-result";
const HISTORY_KEY = storageKey("chaptersHistory");
const HISTORY_MAX = 20;

function reportChapterApiError(action: string, e: unknown) {
  const status = e instanceof ChapterApiError ? e.status : undefined;
  const code = e instanceof ChapterApiError ? e.code : undefined;
  if (status != null && status >= 400 && status < 500) return;
  if (
    code === "UNAUTHORIZED" ||
    code === "GENERATION_LIMIT_REACHED" ||
    code === "SUBSCRIPTION_REQUIRED"
  ) {
    return;
  }
  reportSupportError(action, e, {
    ...(status != null ? { http_status: status } : {}),
    ...(code ? { api_code: code } : {}),
  });
}

type ResultState = {
  titles: string[];
  // ÑÐµÐ´Ð°ÐºÑÐ¸ÑÑÐµÑÑÑ ÐºÐ°Ðº Ð¾Ð±ÑÑÐ½ÑÐ¹ ÑÐµÐºÑÑ, Ð° Ð½Ðµ Ð¼Ð°ÑÑÐ¸Ð² ÑÐ¸Ð¿Ð¾Ð²
  description: string;
  // ÑÐµÐ´Ð°ÐºÑÐ¸ÑÑÐµÑÑÑ ÐºÐ°Ðº Ð¾Ð´Ð¸Ð½ ÑÐµÐºÑÑ ÑÐµÑÐµÐ· Ð·Ð°Ð¿ÑÑÑÑ, Ð° Ð½Ðµ Ð¼Ð°ÑÑÐ¸Ð² ÑÐ¸Ð¿Ð¾Ð²
  tags: string;
  chapters: Chapter[];
  // ÑÐ´Ð²Ð¸Ð³ ÑÐµÐ½Ð´ÐµÑÐ° Ð¾ÑÐ½Ð¾ÑÐ¸ÑÐµÐ»ÑÐ½Ð¾ ÑÐ°Ð¹Ð¼Ð»Ð¸Ð½Ð¸Ð¸ ÑÐ¾ÑÑÐ° (offset Ð¸Ð· describe) â Ð½ÑÐ¶ÐµÐ½,
  // ÑÑÐ¾Ð±Ñ Ð¼Ð°ÑÐºÐµÑÑ Ð½Ð° ÐºÐ¾Ð¼Ð¿Ð¾Ð·Ð¸ÑÐ¸Ð¸/ÑÐµÐºÐ²ÐµÐ½ÑÐ¸Ð¸ Ð»ÐµÐ³Ð»Ð¸ Ð½Ð° ÑÐµÐ°Ð»ÑÐ½ÑÐµ ÑÐ°Ð¹Ð¼Ð¸Ð½Ð³Ð¸, Ð° Ð½Ðµ
  // Ð½Ð° ÑÐ°Ð¹Ð¼Ð¸Ð½Ð³Ð¸ Ð²Ð½ÑÑÑÐ¸ ÑÐµÐ½Ð´ÐµÑÐµÐ½Ð½Ð¾Ð³Ð¾ ÑÑÐ°Ð³Ð¼ÐµÐ½ÑÐ°
  offset: number;
};

type ChaptersHistoryItem = ChaptersHistoryPreview & {
  result: ResultState;
  transcription: TranscribeResult | null;
};

const emptyResult: ResultState = { titles: [], description: "", tags: "", chapters: [], offset: 0 };

function historyLabel(result: ResultState): string {
  const title = result.titles.find((t) => t.trim())?.trim();
  if (title) return title;
  const firstChapter = [...result.chapters].sort((a, b) => a.time - b.time)[0]?.title?.trim();
  if (firstChapter) return firstChapter;
  return "Untitled chapters";
}

function newHistoryId(): string {
  return `ch-hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isResultState(value: unknown): value is ResultState {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ResultState>;
  return Array.isArray(row.chapters) && row.chapters.length > 0;
}

function loadHistory(): ChaptersHistoryItem[] {
  try {
    const raw = panelStore.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ChaptersHistoryItem => {
        if (!item || typeof item !== "object") return false;
        const row = item as Partial<ChaptersHistoryItem>;
        return (
          typeof row.id === "string" &&
          typeof row.createdAt === "number" &&
          isResultState(row.result)
        );
      })
      .map((item) => ({
        ...item,
        label: typeof item.label === "string" && item.label.trim() ? item.label : historyLabel(item.result),
        chapterCount: item.result.chapters.length,
        transcription: item.transcription ?? null,
      }))
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function persistHistory(items: ChaptersHistoryItem[]) {
  try {
    panelStore.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    // CEP / private mode may block storage
  }
}

/** One-time migrate from the old single-result keys into history. */
function migrateLegacyResult(): ChaptersHistoryItem[] {
  try {
    const rawResult = panelStore.getItem(RESULT_KEY);
    if (!rawResult) return [];
    const parsed = JSON.parse(rawResult) as Partial<ResultState>;
    if (!parsed?.chapters?.length) return [];
    const result: ResultState = { ...emptyResult, ...parsed };
    let transcription: TranscribeResult | null = null;
    const rawTx = panelStore.getItem(TRANSCRIPTION_KEY);
    if (rawTx) {
      try {
        transcription = JSON.parse(rawTx) as TranscribeResult;
      } catch {
        transcription = null;
      }
    }
    return [
      {
        id: newHistoryId(),
        createdAt: Date.now(),
        label: historyLabel(result),
        chapterCount: result.chapters.length,
        result,
        transcription,
      },
    ];
  } catch {
    return [];
  }
}

export const ChaptersApp = ({
  generationsLeft = 0,
}: {
  generationsLeft?: number;
}) => {
  const { srcLang, translateTo } = useConfiguration();
  const { showStatus } = usePanelUI();
  const workRange = useWorkRangeCost(true);
  const generationCost = workRange.cost;
  const [transcription, setTranscription] = useState<TranscribeResult | null>(null);
  const [result, setResult] = useState<ResultState>(emptyResult);
  const [history, setHistory] = useState<ChaptersHistoryItem[]>([]);
  const [progress, setProgress] = useState<DescribeProgress | null>(null);
  const [regeneratingTitles, setRegeneratingTitles] = useState(false);
  const [regeneratingChapters, setRegeneratingChapters] = useState(false);
  const [regeneratingDescription, setRegeneratingDescription] = useState(false);
  const [regeneratingTags, setRegeneratingTags] = useState(false);
  const [addingMarkers, setAddingMarkers] = useState(false);
  // landing | results  ÿâíûé ýêðàí, ÷òîáû Back íå ñáðàñûâàë äàííûå
  const [screen, setScreen] = useState<"landing" | "results">("landing");

  const showError = (err: unknown) => {
    const msg = friendlyErrorMessage(err);
    if (!msg || msg === "Cancelled") return;
    showStatus(msg, "error", 7000);
  };

  const transcriptionRef = useRef(transcription);
  transcriptionRef.current = transcription;
  const activeHistoryIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ÐºÐ¾Ð³Ð´Ð° Ð²ÑÐ±ÑÐ°Ð½ Ð¿ÐµÑÐµÐ²Ð¾Ð´, ÐÐ¡Ð Ð¿Ð¾Ð»Ñ (title/description/tags/Ð³Ð»Ð°Ð²Ñ) Ð³ÐµÐ½ÐµÑÐ¸ÑÑÑÑÑÑ
  // Ð½Ð° ÑÑÐ¾Ð¼ ÑÐ·ÑÐºÐµ â Ð½Ðµ ÑÐ¾Ð»ÑÐºÐ¾ ÑÑÐ°Ð½ÑÐºÑÐ¸Ð¿Ñ; ÑÐ¸ÑÐ°ÐµÐ¼ Ð¿ÐµÑÐµÐ´ ÐºÐ°Ð¶Ð´ÑÐ¼ Ð²ÑÐ·Ð¾Ð²Ð¾Ð¼, ÑÑÐ¾Ð±Ñ
  // Regenerate Ð¾Ð´Ð½Ð¾Ð¹ ÑÐµÐºÑÐ¸Ð¸ ÑÑÐ°Ð·Ñ Ð¿Ð¾Ð´ÑÐ²Ð°ÑÑÐ²Ð°Ð» ÑÐµÐºÑÑÐ¸Ð¹ Ð²ÑÐ±Ð¾Ñ ÑÐ·ÑÐºÐ° Ð² Ð¿Ð°Ð½ÐµÐ»Ð¸
  const outputLanguage = translateTo !== "off" ? translateTo : undefined;

  const persistTranscription = (next: TranscribeResult) => {
    try {
      panelStore.setItem(TRANSCRIPTION_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    setTranscription(next);
  };

  /** Save current result + keep the active history entry in sync. */
  const persistResult = (next: ResultState) => {
    try {
      panelStore.setItem(RESULT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    setResult(next);

    const activeId = activeHistoryIdRef.current;
    if (!activeId) return;
    setHistory((prev) => {
      const updated = prev.map((item) =>
        item.id === activeId
          ? {
              ...item,
              result: next,
              label: historyLabel(next),
              chapterCount: next.chapters.length,
              transcription: transcriptionRef.current,
            }
          : item,
      );
      persistHistory(updated);
      return updated;
    });
  };

  /** New generation â prepend history and open results. */
  const commitNewGeneration = (nextResult: ResultState, nextTranscription: TranscribeResult) => {
    const id = newHistoryId();
    const item: ChaptersHistoryItem = {
      id,
      createdAt: Date.now(),
      label: historyLabel(nextResult),
      chapterCount: nextResult.chapters.length,
      result: nextResult,
      transcription: nextTranscription,
    };
    activeHistoryIdRef.current = id;
    setHistory((prev) => {
      const updated = [item, ...prev.filter((h) => h.id !== id)].slice(0, HISTORY_MAX);
      persistHistory(updated);
      return updated;
    });
    try {
      panelStore.setItem(RESULT_KEY, JSON.stringify(nextResult));
      panelStore.setItem(TRANSCRIPTION_KEY, JSON.stringify(nextTranscription));
    } catch {
      // ignore
    }
    setResult(nextResult);
    setTranscription(nextTranscription);
    setScreen("results");
  };

  const throwIfCancelled = (signal: AbortSignal) => {
    if (signal.aborted) throw new Error("Cancelled");
  };

  // Ð²ÑÐµÐ¼ÐµÐ½Ð½ÑÐµ ÑÐ°Ð¹Ð»Ñ ÑÐµÐ½Ð´ÐµÑÐ° (wav/avi + mp3) ÑÐ´Ð°Ð»ÑÐµÐ¼ Ð² ÑÐ°Ð¼Ð¾Ð¼ ÐºÐ¾Ð½ÑÐµ flow:
  // ÑÐ¾ÑÑ Ð¼Ð¾Ð¶ÐµÑ Ð´ÐµÑÐ¶Ð°ÑÑ ÑÐµÐ½Ð´Ð» Ð½Ð° ÑÐ¾Ð»ÑÐºÐ¾ ÑÑÐ¾ Ð¾ÑÑÐµÐ½Ð´ÐµÑÐµÐ½Ð½ÑÐ¹ ÑÐ°Ð¹Ð», Ð° ÑÐ´Ð°Ð»ÐµÐ½Ð¸Ðµ
  // Ð¾ÑÐºÑÑÑÐ¾Ð³Ð¾ ÑÐ°Ð¹Ð»Ð° Ð½Ð° Windows Ð¾ÑÑÐ°Ð²Ð»ÑÐµÑ ÐµÐ³Ð¾ Ð² "delete pending" Ð¸ ÑÐ¾Ð½ÑÐµÑ
  // ÑÐ»ÐµÐ´ÑÑÑÐ¸Ð¹ exportAsMediaDirect ("Unable To Delete Existing File")
  const cleanupTempAudio = (paths: (string | undefined)[]) => {
    for (const p of paths) {
      if (!p) continue;
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // ÑÐ°Ð¹Ð» ÐµÑÑ Ð·Ð°Ð½ÑÑ ÑÐ¾ÑÑÐ¾Ð¼ â Ð¾ÑÑÐ°Ð²Ð»ÑÐµÐ¼, temp Ð¿Ð¾ÑÐ¸ÑÑÐ¸Ñ ÑÐ¸ÑÑÐµÐ¼Ð°
      }
    }
  };

  const notifyCreditsChanged = () => {
    try {
      window.dispatchEvent(new Event("aitools-credits-changed"));
    } catch {
      // ignore
    }
  };

  const runGeneration = async (signal: AbortSignal) => {
    const user = getUserIdentity();

    setProgress({ stage: "rendering" });
    await Motionflow.ready();
    throwIfCancelled(signal);
    const effectivePresetPath = getBundledAudioPresetPath() || undefined;
    const res = await describeForExport(effectivePresetPath);
    throwIfCancelled(signal);

    try {
      setProgress({ stage: "converting" });
      const mp3Path = await convertToMp3(res.source, res.dest);
      throwIfCancelled(signal);

      setProgress({ stage: "transcribing" });
      let transcriptionResult: TranscribeResult;
      try {
        transcriptionResult = await transcribe(mp3Path, {
          language: srcLang,
          translateTo,
          signal,
          durationSeconds: res.durationSeconds > 0 ? res.durationSeconds : undefined,
          userId: user.id || undefined,
          email: user.email,
          token: user.token,
        });
      } catch (e) {
        const authMsg = authErrorMessage(e);
        if (authMsg) throw new Error(authMsg);
        throw e;
      }
      throwIfCancelled(signal);

      // ÑÐ¸Ð½Ð¸Ð¼ ÑÐ°Ð·Ð¾ÑÐ²Ð°Ð½Ð½ÑÐµ ÐÐ Ð¿ÑÐµÐ´Ð»Ð¾Ð¶ÐµÐ½Ð¸Ñ Ð¿ÐµÑÐµÐ´ ÑÑÐ¼Ð¼Ð°ÑÐ¸Ð·Ð°ÑÐ¸ÐµÐ¹
      const normalized = normalize(transcriptionResult);
      persistTranscription(normalized);

      setProgress({ stage: "summarizing" });
      const chunks: CaptionsChunk[] = normalized.chunk?.chunks ?? [];
      const { titles, sections, description, tags } = await generateAll(chunks, signal, outputLanguage, {
        chaptersReceipt: transcriptionResult.chaptersReceipt,
        durationSeconds: res.durationSeconds > 0 ? res.durationSeconds : undefined,
      });
      throwIfCancelled(signal);

      const nextResult: ResultState = {
        titles,
        description,
        tags: tagsToText(tags),
        chapters: sectionsToChapters(sections),
        offset: res.offset ?? 0,
      };
      commitNewGeneration(nextResult, normalized);
      notifyCreditsChanged();
    } finally {
      // wav/avi + mp3 â ÑÐ¾Ð»ÑÐºÐ¾ ÐºÐ¾Ð³Ð´Ð° flow Ð¿Ð¾Ð»Ð½Ð¾ÑÑÑÑ Ð·Ð°Ð²ÐµÑÑÑÐ½ (ÑÑÐ¿ÐµÑ, Ð¾ÑÐ¸Ð±ÐºÐ°
      // Ð¸Ð»Ð¸ Ð¾ÑÐ¼ÐµÐ½Ð°), ÑÑÐ¾Ð±Ñ Ð½Ðµ Ð´ÑÑÐ³Ð°ÑÑ ÑÐ°Ð¹Ð»Ñ, ÐºÐ¾ÑÐ¾ÑÑÐµ ÑÐ¾ÑÑ ÐµÑÑ Ð´ÐµÑÐ¶Ð¸Ñ Ð¾ÑÐºÑÑÑÑÐ¼Ð¸
      cleanupTempAudio([res.source, res.dest]);
    }
  };

  const handleCancelGenerate = () => {
    abortRef.current?.abort();
  };

  const handleGenerate = async () => {
    if (progress) return;
    const range = await workRange.refresh();
    if (range.error) {
      showError(range.error);
      return;
    }
    if (generationsLeft < range.cost) {
      showError("No generations left. Upgrade your plan or buy extra credits.");
      return;
    }
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      await runGeneration(controller.signal);
    } catch (e) {
      if (e instanceof Error && e.message === "Cancelled") {
        // quiet cancel  no toast
      } else {
        showError(e);
        if (!isSoftHostError(e)) reportChapterApiError("chapters.generate", e);
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  // Ð¿Ð¾Ð²ÑÐ¾ÑÐ½ÑÐ¹ Ð²ÑÐ·Ð¾Ð² /api/generations/chapters Ð¿Ð¾ ÑÐ¶Ðµ Ð³Ð¾ÑÐ¾Ð²Ð¾Ð¼Ñ ÑÑÐ°Ð½ÑÐºÑÐ¸Ð¿ÑÑ, Ð±ÐµÐ·
  // Ð¿Ð¾Ð²ÑÐ¾ÑÐ½Ð¾Ð³Ð¾ ÑÐµÐ½Ð´ÐµÑÐ°/ÑÑÐ°Ð½ÑÐºÑÐ¸Ð¿ÑÐ¸Ð¸; ÐºÐ°Ð¶Ð´Ð°Ñ ÑÐµÐºÑÐ¸Ñ ÑÐµÐ³ÐµÐ½ÐµÑÐ¸ÑÑÐµÑÑÑ Ð½ÐµÐ·Ð°Ð²Ð¸ÑÐ¸Ð¼Ð¾ â
  // ÑÐ¾ÑÐµÑÐ½ÑÐ¹ target Ð½Ð° Ð±ÑÐºÐµÐ½Ð´Ðµ Ð½Ðµ ÑÑÐ¾Ð³Ð°ÐµÑ Ð¾ÑÑÐ°Ð»ÑÐ½ÑÐµ Ð¿Ð¾Ð»Ñ, Ð½Ð¾ ÑÐ¿Ð¸ÑÑÐ²Ð°ÐµÑ 1
  // Ð³ÐµÐ½ÐµÑÐ°ÑÐ¸Ñ Ð¿Ð¾Ð»ÑÐ·Ð¾Ð²Ð°ÑÐµÐ»Ñ (ÐºÐ°Ðº Ð¸ generateAll)
  const runSectionRegenerate = async <T,>(opts: {
    busy: boolean;
    setBusy: (v: boolean) => void;
    action: string;
    run: (chunks: CaptionsChunk[]) => Promise<T>;
    apply: (value: T) => void;
  }) => {
    const source = transcriptionRef.current;
    if (!source || opts.busy) return;
    if (generationsLeft <= 0) {
      showError("No generations left. Upgrade your plan or buy extra credits.");
      return;
    }
    opts.setBusy(true);
    try {
      const chunks: CaptionsChunk[] = source.chunk.chunks ?? [];
      const value = await opts.run(chunks);
      opts.apply(value);
      notifyCreditsChanged();
    } catch (e) {
      showError(e);
      reportChapterApiError(opts.action, e);
      if (e instanceof ChapterApiError && e.code === "GENERATION_LIMIT_REACHED") {
        notifyCreditsChanged();
      }
    } finally {
      opts.setBusy(false);
    }
  };

  const handleRegenerateTitles = () =>
    runSectionRegenerate({
      busy: regeneratingTitles,
      setBusy: setRegeneratingTitles,
      action: "chapters.regenerate_titles",
      run: (chunks) => regenerateTitles(chunks, undefined, outputLanguage),
      apply: (titles) => persistResult({ ...result, titles }),
    });

  const handleRegenerateChapters = () =>
    runSectionRegenerate({
      busy: regeneratingChapters,
      setBusy: setRegeneratingChapters,
      action: "chapters.regenerate_chapters",
      run: (chunks) => regenerateChapters(chunks, undefined, outputLanguage),
      apply: (sections) =>
        persistResult({ ...result, chapters: sectionsToChapters(sections) }),
    });

  const handleRegenerateDescription = () =>
    runSectionRegenerate({
      busy: regeneratingDescription,
      setBusy: setRegeneratingDescription,
      action: "chapters.regenerate_description",
      run: (chunks) => regenerateDescription(chunks, undefined, outputLanguage),
      apply: (description) => persistResult({ ...result, description }),
    });

  const handleRegenerateTags = () =>
    runSectionRegenerate({
      busy: regeneratingTags,
      setBusy: setRegeneratingTags,
      action: "chapters.regenerate_tags",
      run: (chunks) => regenerateTags(chunks, undefined, outputLanguage),
      apply: (tags) => persistResult({ ...result, tags: tagsToText(tags) }),
    });

  const handleUpdateTitle = (index: number, title: string) => {
    persistResult({
      ...result,
      titles: result.titles.map((t, i) => (i === index ? title : t)),
    });
  };

  const handleUpdateDescription = (description: string) => {
    persistResult({ ...result, description });
  };

  const handleUpdateTags = (tags: string) => {
    persistResult({ ...result, tags });
  };

  const handleNormalizeTags = () => {
    const normalized = tagsToHashtags(parseTagsText(result.tags));
    if (normalized === result.tags) return;
    persistResult({ ...result, tags: normalized });
  };

  const handleUpdateChapterTitle = (id: string, title: string) => {
    persistResult({
      ...result,
      chapters: result.chapters.map((c) => (c.id === id ? { ...c, title } : c)),
    });
  };

  const handleUpdateChapterTime = (id: string, seconds: number) => {
    persistResult({
      ...result,
      chapters: result.chapters.map((c) => (c.id === id ? { ...c, time: seconds } : c)),
    });
  };

  const handleDeleteChapter = (id: string) => {
    if (result.chapters.length <= 1) return;
    persistResult({ ...result, chapters: result.chapters.filter((c) => c.id !== id) });
  };

  const handleAddChapter = () => {
    const lastTime = result.chapters.reduce((max, c) => Math.max(max, c.time), 0);
    const nextTime = result.chapters.length ? lastTime + 10 : 0;
    persistResult({ ...result, chapters: [...result.chapters, createChapter(nextTime)] });
  };

  // "Copy Description" Ð² ÑÑÑÐµÑÐµ â ÑÐµÐ»ÑÐ½ÑÐ¹ Ð±Ð»Ð¾Ðº Ð´Ð»Ñ Ð¿Ð¾Ð»Ñ Description Ð½Ð° YouTube:
  // ÑÐµÐºÑÑ Ð¾Ð¿Ð¸ÑÐ°Ð½Ð¸Ñ + ÑÐ¿Ð¸ÑÐ¾Ðº ÑÐ°Ð¹Ð¼ÐºÐ¾Ð´Ð¾Ð² Ð³Ð»Ð°Ð² + ÑÐµÐ³Ð¸ Ð² Ð²Ð¸Ð´Ðµ #ÑÑÑÑÐµÐ³Ð¾Ð²
  const handleCopyDescription = () =>
    copyToClipboard(formatFullDescription(result.description, result.chapters, result.tags));

  // Ð¼Ð°ÑÐºÐµÑÑ ÑÑÐ°Ð²Ð¸Ð¼ Ð½Ð° ÑÐµÐ°Ð»ÑÐ½ÑÐµ ÑÐ°Ð¹Ð¼Ð¸Ð½Ð³Ð¸ (time + offset ÑÐµÐ½Ð´ÐµÑÐ°), Ð±ÐµÐ· Ð¿ÑÐ°Ð²Ð¸Ð»Ð°
  // "Ð¿ÐµÑÐ²Ð°Ñ Ð³Ð»Ð°Ð²Ð° = 00:00" â Ð¾Ð½Ð¾ Ð½ÑÐ¶Ð½Ð¾ ÑÐ¾Ð»ÑÐºÐ¾ Ð´Ð»Ñ ÑÐµÐºÑÑÐ¾Ð²Ð¾Ð³Ð¾ YouTube-ÑÐ¾ÑÐ¼Ð°ÑÐ°
  const handleAddMarkers = async () => {
    if (addingMarkers || !result.chapters.length) return false;
    setAddingMarkers(true);
    try {
      await reloadJSX();
      const markers = [...result.chapters]
        .sort((a, b) => a.time - b.time)
        .map((c) => ({ time: c.time + result.offset, name: c.title.trim() || "Chapter" }));
      const res = await sdkData(hostSdk().addMarkers({ markers }));
      return !!(res && typeof res === "object" && (res as { ok?: boolean }).ok === true);
    } catch (e) {
      showError(e);
      reportSupportError("chapters.add_markers", e);
      return false;
    } finally {
      setAddingMarkers(false);
    }
  };

  // Back â ÑÐ¾Ð»ÑÐºÐ¾ UI; Ð¸ÑÑÐ¾ÑÐ¸Ñ Ð½Ð° landing Ð´Ð°ÑÑ ÑÐ½Ð¾Ð²Ð° Ð¾ÑÐºÑÑÑÑ ÑÐµÐ·ÑÐ»ÑÑÐ°Ñ
  const handleBack = () => {
    setScreen("landing");
  };

  const handleOpenHistory = (id: string) => {
    const item = history.find((h) => h.id === id);
    if (!item) return;
    activeHistoryIdRef.current = id;
    const nextResult = {
      ...item.result,
      tags: tagsToHashtags(parseTagsText(item.result.tags ?? "")),
    };
    setResult(nextResult);
    setTranscription(item.transcription);
    try {
      panelStore.setItem(RESULT_KEY, JSON.stringify(nextResult));
      if (item.transcription) {
        panelStore.setItem(TRANSCRIPTION_KEY, JSON.stringify(item.transcription));
      }
    } catch {
      // ignore
    }
    setScreen("results");
  };

  const handleDeleteHistory = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((h) => h.id !== id);
      persistHistory(updated);
      return updated;
    });
    if (activeHistoryIdRef.current === id) {
      activeHistoryIdRef.current = null;
    }
  };

  // Ð¸ÑÑÐ¾ÑÐ¸Ñ (+ Ð¼Ð¸Ð³ÑÐ°ÑÐ¸Ñ ÑÑÐ°ÑÐ¾Ð³Ð¾ Ð¾Ð´Ð¸Ð½Ð¾ÑÐ½Ð¾Ð³Ð¾ ÑÐµÐ·ÑÐ»ÑÑÐ°ÑÐ°); ÑÑÐ°ÑÑÑÐµÐ¼ Ð½Ð° landing
  useEffect(() => {
    let items = loadHistory();
    if (items.length === 0) {
      items = migrateLegacyResult();
      if (items.length) persistHistory(items);
    }
    setHistory(items);
  }, []);

  const historyPreview: ChaptersHistoryPreview[] = history.map(
    ({ id, createdAt, label, chapterCount }) => ({
      id,
      createdAt,
      label,
      chapterCount,
    }),
  );

  return (
    <div className="app-shell">
      <ProgressDialog
        progress={progress}
        onCancel={handleCancelGenerate}
        title="Generating chapters"
        steps={CHAPTERS_PROGRESS_STEPS}
      />
      <ChaptersTab
        screen={screen}
        progress={progress}
        onGenerate={handleGenerate}
        generateLabel={withGenerationCostLabel("Generate", generationCost)}
        onBack={handleBack}
        canRegenerate={generationsLeft > 0}
        history={historyPreview}
        onOpenHistory={handleOpenHistory}
        onDeleteHistory={handleDeleteHistory}
        titles={result.titles}
        onEditTitle={handleUpdateTitle}
        onRegenerateTitles={handleRegenerateTitles}
        regeneratingTitles={regeneratingTitles}
        description={result.description}
        onUpdateDescription={handleUpdateDescription}
        onRegenerateDescription={handleRegenerateDescription}
        regeneratingDescription={regeneratingDescription}
        tags={result.tags}
        onUpdateTags={handleUpdateTags}
        onNormalizeTags={handleNormalizeTags}
        onRegenerateTags={handleRegenerateTags}
        regeneratingTags={regeneratingTags}
        chapters={result.chapters}
        onUpdateChapterTitle={handleUpdateChapterTitle}
        onUpdateChapterTime={handleUpdateChapterTime}
        onDeleteChapter={handleDeleteChapter}
        onAddChapter={handleAddChapter}
        onRegenerateChapters={handleRegenerateChapters}
        regeneratingChapters={regeneratingChapters}
        onCopyDescription={handleCopyDescription}
        onAddMarkers={handleAddMarkers}
        addingMarkers={addingMarkers}
      />
    </div>
  );
};
