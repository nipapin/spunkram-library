import { useEffect, useRef, useState } from "react";
import { ChaptersTab, type ChaptersHistoryPreview } from "../../components/ChaptersTab";
import {
  ProgressDialog,
  CHAPTERS_PROGRESS_STEPS,
  type DescribeProgress,
} from "../../components/ProgressDialog";
import { fs } from "../../lib/cep/node";
import { reloadJSX } from "../../lib/utils/bolt";
import { hostSdk, sdkData } from "@/sdk/host-api";
import { convertToMp3 } from "../../utils/ffmpeg";
import { getBundledAudioPresetPath } from "../../utils/audioPreset";
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
  tagsToText,
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
const HISTORY_KEY = "spunkram.chaptersHistory";
const HISTORY_MAX = 20;

function reportChapterApiError(action: string, e: unknown) {
  const status = e instanceof ChapterApiError ? e.status : undefined;
  const code = e instanceof ChapterApiError ? e.code : undefined;
  reportSupportError(action, e, {
    ...(status != null ? { http_status: status } : {}),
    ...(code ? { api_code: code } : {}),
  });
}

type ResultState = {
  titles: string[];
  // СЂРµРґР°РєС‚РёСЂСѓРµС‚СЃСЏ РєР°Рє РѕР±С‹С‡РЅС‹Р№ С‚РµРєСЃС‚, Р° РЅРµ РјР°СЃСЃРёРІ С‡РёРїРѕРІ
  description: string;
  // СЂРµРґР°РєС‚РёСЂСѓРµС‚СЃСЏ РєР°Рє РѕРґРёРЅ С‚РµРєСЃС‚ С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ, Р° РЅРµ РјР°СЃСЃРёРІ С‡РёРїРѕРІ
  tags: string;
  chapters: Chapter[];
  // СЃРґРІРёРі СЂРµРЅРґРµСЂР° РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ С‚Р°Р№РјР»РёРЅРёРё С…РѕСЃС‚Р° (offset РёР· describe) вЂ” РЅСѓР¶РµРЅ,
  // С‡С‚РѕР±С‹ РјР°СЂРєРµСЂС‹ РЅР° РєРѕРјРїРѕР·РёС†РёРё/СЃРµРєРІРµРЅС†РёРё Р»РµРіР»Рё РЅР° СЂРµР°Р»СЊРЅС‹Рµ С‚Р°Р№РјРёРЅРіРё, Р° РЅРµ
  // РЅР° С‚Р°Р№РјРёРЅРіРё РІРЅСѓС‚СЂРё СЂРµРЅРґРµСЂРµРЅРЅРѕРіРѕ С„СЂР°РіРјРµРЅС‚Р°
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
  // landing | results — явный экран, чтобы Back не сбрасывал данные
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

  // РєРѕРіРґР° РІС‹Р±СЂР°РЅ РїРµСЂРµРІРѕРґ, Р’РЎР• РїРѕР»СЏ (title/description/tags/РіР»Р°РІС‹) РіРµРЅРµСЂРёСЂСѓСЋС‚СЃСЏ
  // РЅР° СЌС‚РѕРј СЏР·С‹РєРµ вЂ” РЅРµ С‚РѕР»СЊРєРѕ С‚СЂР°РЅСЃРєСЂРёРїС‚; С‡РёС‚Р°РµРј РїРµСЂРµРґ РєР°Р¶РґС‹Рј РІС‹Р·РѕРІРѕРј, С‡С‚РѕР±С‹
  // Regenerate РѕРґРЅРѕР№ СЃРµРєС†РёРё СЃСЂР°Р·Сѓ РїРѕРґС…РІР°С‚С‹РІР°Р» С‚РµРєСѓС‰РёР№ РІС‹Р±РѕСЂ СЏР·С‹РєР° РІ РїР°РЅРµР»Рё
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

  /** New generation в†’ prepend history and open results. */
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

  // РІСЂРµРјРµРЅРЅС‹Рµ С„Р°Р№Р»С‹ СЂРµРЅРґРµСЂР° (wav/avi + mp3) СѓРґР°Р»СЏРµРј РІ СЃР°РјРѕРј РєРѕРЅС†Рµ flow:
  // С…РѕСЃС‚ РјРѕР¶РµС‚ РґРµСЂР¶Р°С‚СЊ С…РµРЅРґР» РЅР° С‚РѕР»СЊРєРѕ С‡С‚Рѕ РѕС‚СЂРµРЅРґРµСЂРµРЅРЅС‹Р№ С„Р°Р№Р», Р° СѓРґР°Р»РµРЅРёРµ
  // РѕС‚РєСЂС‹С‚РѕРіРѕ С„Р°Р№Р»Р° РЅР° Windows РѕСЃС‚Р°РІР»СЏРµС‚ РµРіРѕ РІ "delete pending" Рё СЂРѕРЅСЏРµС‚
  // СЃР»РµРґСѓСЋС‰РёР№ exportAsMediaDirect ("Unable To Delete Existing File")
  const cleanupTempAudio = (paths: (string | undefined)[]) => {
    for (const p of paths) {
      if (!p) continue;
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // С„Р°Р№Р» РµС‰С‘ Р·Р°РЅСЏС‚ С…РѕСЃС‚РѕРј вЂ” РѕСЃС‚Р°РІР»СЏРµРј, temp РїРѕС‡РёСЃС‚РёС‚ СЃРёСЃС‚РµРјР°
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
    const effectivePresetPath = getBundledAudioPresetPath() || undefined;
    const describeRaw = await sdkData(hostSdk().describe(effectivePresetPath));
    throwIfCancelled(signal);
    const describeFail = describeRaw as {
      ok?: false;
      message?: string;
      reason?: string;
      source?: string;
      dest?: string;
      offset?: number;
      durationSeconds?: number;
      type?: "composition" | "selected";
    } | null;
    if (!describeRaw || !describeFail?.source || !describeFail.dest) {
      const soft =
        describeFail?.reason === "NO_ACTIVE_SEQUENCE" ||
        describeFail?.reason === "NO_ACTIVE_COMP" ||
        describeFail?.reason === "NO_AUDIO" ||
        describeFail?.reason === "NO_INOUT" ||
        describeFail?.reason === "NO_WORK_AREA";
      const msg =
        (typeof describeFail?.message === "string" && describeFail.message) ||
        "Could not export audio. Set In/Out or Work Area and try again.";
      const err = new Error(msg);
      (err as Error & { soft?: boolean; reason?: string }).soft = soft;
      if (describeFail?.reason) {
        (err as Error & { reason?: string }).reason = describeFail.reason;
      }
      throw err;
    }
    const res = {
      source: describeFail.source,
      dest: describeFail.dest,
      offset: describeFail.offset ?? 0,
      durationSeconds: describeFail.durationSeconds ?? 0,
      type: (describeFail.type ?? "composition") as "composition" | "selected",
    };

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

      // С‡РёРЅРёРј СЂР°Р·РѕСЂРІР°РЅРЅС‹Рµ РР РїСЂРµРґР»РѕР¶РµРЅРёСЏ РїРµСЂРµРґ СЃСѓРјРјР°СЂРёР·Р°С†РёРµР№
      const normalized = normalize(transcriptionResult);
      persistTranscription(normalized);

      setProgress({ stage: "summarizing" });
      const chunks: CaptionsChunk[] = normalized.chunk.chunks ?? [];
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
      // wav/avi + mp3 вЂ” С‚РѕР»СЊРєРѕ РєРѕРіРґР° flow РїРѕР»РЅРѕСЃС‚СЊСЋ Р·Р°РІРµСЂС€С‘РЅ (СѓСЃРїРµС…, РѕС€РёР±РєР°
      // РёР»Рё РѕС‚РјРµРЅР°), С‡С‚РѕР±С‹ РЅРµ РґС‘СЂРіР°С‚СЊ С„Р°Р№Р»С‹, РєРѕС‚РѕСЂС‹Рµ С…РѕСЃС‚ РµС‰С‘ РґРµСЂР¶РёС‚ РѕС‚РєСЂС‹С‚С‹РјРё
      cleanupTempAudio([res.source, res.dest]);
    }
  };

  const handleCancelGenerate = () => {
    abortRef.current?.abort();
  };

  const handleGenerate = async () => {
    if (progress) return;
    if (generationsLeft < generationCost) {
      showError("No generations left. Upgrade your plan or buy extra credits.");
      return;
    }
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      await runGeneration(controller.signal);
    } catch (e) {
      if (e instanceof Error && e.message === "Cancelled") {
        // quiet cancel — no toast
      } else {
        showError(e);
        if (!isSoftHostError(e)) reportChapterApiError("chapters.generate", e);
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  // РїРѕРІС‚РѕСЂРЅС‹Р№ РІС‹Р·РѕРІ /api/generations/chapters РїРѕ СѓР¶Рµ РіРѕС‚РѕРІРѕРјСѓ С‚СЂР°РЅСЃРєСЂРёРїС‚Сѓ, Р±РµР·
  // РїРѕРІС‚РѕСЂРЅРѕРіРѕ СЂРµРЅРґРµСЂР°/С‚СЂР°РЅСЃРєСЂРёРїС†РёРё; РєР°Р¶РґР°СЏ СЃРµРєС†РёСЏ СЂРµРіРµРЅРµСЂРёСЂСѓРµС‚СЃСЏ РЅРµР·Р°РІРёСЃРёРјРѕ вЂ”
  // С‚РѕС‡РµС‡РЅС‹Р№ target РЅР° Р±СЌРєРµРЅРґРµ РЅРµ С‚СЂРѕРіР°РµС‚ РѕСЃС‚Р°Р»СЊРЅС‹Рµ РїРѕР»СЏ, РЅРѕ СЃРїРёСЃС‹РІР°РµС‚ 1
  // РіРµРЅРµСЂР°С†РёСЋ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (РєР°Рє Рё generateAll)
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

  // "Copy Description" РІ С„СѓС‚РµСЂРµ вЂ” С†РµР»СЊРЅС‹Р№ Р±Р»РѕРє РґР»СЏ РїРѕР»СЏ Description РЅР° YouTube:
  // С‚РµРєСЃС‚ РѕРїРёСЃР°РЅРёСЏ + СЃРїРёСЃРѕРє С‚Р°Р№РјРєРѕРґРѕРІ РіР»Р°РІ + С‚РµРіРё РІ РІРёРґРµ #С…СЌС€С‚РµРіРѕРІ
  const handleCopyDescription = () =>
    copyToClipboard(formatFullDescription(result.description, result.chapters, result.tags));

  // РјР°СЂРєРµСЂС‹ СЃС‚Р°РІРёРј РЅР° СЂРµР°Р»СЊРЅС‹Рµ С‚Р°Р№РјРёРЅРіРё (time + offset СЂРµРЅРґРµСЂР°), Р±РµР· РїСЂР°РІРёР»Р°
  // "РїРµСЂРІР°СЏ РіР»Р°РІР° = 00:00" вЂ” РѕРЅРѕ РЅСѓР¶РЅРѕ С‚РѕР»СЊРєРѕ РґР»СЏ С‚РµРєСЃС‚РѕРІРѕРіРѕ YouTube-С„РѕСЂРјР°С‚Р°
  const handleAddMarkers = async () => {
    if (addingMarkers || !result.chapters.length) return false;
    setAddingMarkers(true);
    try {
      await reloadJSX();
      const markers = [...result.chapters]
        .sort((a, b) => a.time - b.time)
        .map((c) => ({ time: c.time + result.offset, name: c.title.trim() || "Chapter" }));
      const res = await sdkData(hostSdk().addMarkers({ markers }));
      return !!res;
    } catch (e) {
      showError(e);
      reportSupportError("chapters.add_markers", e);
      return false;
    } finally {
      setAddingMarkers(false);
    }
  };

  // Back вЂ” С‚РѕР»СЊРєРѕ UI; РёСЃС‚РѕСЂРёСЏ РЅР° landing РґР°С‘С‚ СЃРЅРѕРІР° РѕС‚РєСЂС‹С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚
  const handleBack = () => {
    setScreen("landing");
  };

  const handleOpenHistory = (id: string) => {
    const item = history.find((h) => h.id === id);
    if (!item) return;
    activeHistoryIdRef.current = id;
    setResult(item.result);
    setTranscription(item.transcription);
    try {
      panelStore.setItem(RESULT_KEY, JSON.stringify(item.result));
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

  // РёСЃС‚РѕСЂРёСЏ (+ РјРёРіСЂР°С†РёСЏ СЃС‚Р°СЂРѕРіРѕ РѕРґРёРЅРѕС‡РЅРѕРіРѕ СЂРµР·СѓР»СЊС‚Р°С‚Р°); СЃС‚Р°СЂС‚СѓРµРј РЅР° landing
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
        generateLabel={withGenerationCostLabel("Generate Chapters", generationCost)}
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
