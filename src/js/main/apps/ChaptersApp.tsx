import { useEffect, useRef, useState } from "react";
import { ChaptersTab } from "../../components/ChaptersTab";
import {
  ProgressDialog,
  CHAPTERS_PROGRESS_STEPS,
  type DescribeProgress,
} from "../../components/ProgressDialog";
import { fs } from "../../lib/cep/node";
import { evalTS, reloadJSX } from "../../lib/utils/bolt";
import { convertToMp3 } from "../../utils/ffmpeg";
import { getBundledAudioPresetPath } from "../../utils/audioPreset";
import { getUserIdentity } from "../../api";
import { reportSupportError } from "../../api/support";
import { authErrorMessage } from "../../styles";
import { normalize, transcribe, type CaptionsChunk, type TranscribeResult } from "../../utils/transcribe";
import {
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
import { copyToClipboard } from "../../utils/clipboard";
import "./ChaptersApp.scss";
import { useConfiguration } from "../../../context/ConfigurationWrapper";

const TRANSCRIPTION_KEY = "aitools-cep-chapters-transcription";
const RESULT_KEY = "aitools-cep-chapters-result";

type ResultState = {
  titles: string[];
  // редактируется как обычный текст, а не массив чипов
  description: string;
  // редактируется как один текст через запятую, а не массив чипов
  tags: string;
  chapters: Chapter[];
  // сдвиг рендера относительно таймлинии хоста (offset из describe) — нужен,
  // чтобы маркеры на композиции/секвенции легли на реальные тайминги, а не
  // на тайминги внутри рендеренного фрагмента
  offset: number;
};

const emptyResult: ResultState = { titles: [], description: "", tags: "", chapters: [], offset: 0 };

export const ChaptersApp = ({
  generationsLeft = 0,
}: {
  generationsLeft?: number;
}) => {
  const { srcLang, translateTo } = useConfiguration();
  const [transcription, setTranscription] = useState<TranscribeResult | null>(null);
  const [result, setResult] = useState<ResultState>(emptyResult);
  const [progress, setProgress] = useState<DescribeProgress | null>(null);
  const [regeneratingTitles, setRegeneratingTitles] = useState(false);
  const [regeneratingChapters, setRegeneratingChapters] = useState(false);
  const [regeneratingDescription, setRegeneratingDescription] = useState(false);
  const [regeneratingTags, setRegeneratingTags] = useState(false);
  const [addingMarkers, setAddingMarkers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // landing | results — явный экран, чтобы Back не сбрасывал данные
  const [screen, setScreen] = useState<"landing" | "results">("landing");

  const transcriptionRef = useRef(transcription);
  transcriptionRef.current = transcription;
  const abortRef = useRef<AbortController | null>(null);

  // когда выбран перевод, ВСЕ поля (title/description/tags/главы) генерируются
  // на этом языке — не только транскрипт; читаем перед каждым вызовом, чтобы
  // Regenerate одной секции сразу подхватывал текущий выбор языка в панели
  const outputLanguage = translateTo !== "off" ? translateTo : undefined;

  const persistTranscription = (next: TranscribeResult) => {
    localStorage.setItem(TRANSCRIPTION_KEY, JSON.stringify(next));
    setTranscription(next);
  };

  const persistResult = (next: ResultState) => {
    localStorage.setItem(RESULT_KEY, JSON.stringify(next));
    setResult(next);
  };

  const throwIfCancelled = (signal: AbortSignal) => {
    if (signal.aborted) throw new Error("Cancelled");
  };

  // временные файлы рендера (wav/avi + mp3) удаляем в самом конце flow:
  // хост может держать хендл на только что отрендеренный файл, а удаление
  // открытого файла на Windows оставляет его в "delete pending" и роняет
  // следующий exportAsMediaDirect ("Unable To Delete Existing File")
  const cleanupTempAudio = (paths: (string | undefined)[]) => {
    for (const p of paths) {
      if (!p) continue;
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // файл ещё занят хостом — оставляем, temp почистит система
      }
    }
  };

  const runGeneration = async (signal: AbortSignal) => {
    const user = getUserIdentity();

    setProgress({ stage: "rendering" });
    const effectivePresetPath = getBundledAudioPresetPath() || undefined;
    const res = await evalTS("describe", effectivePresetPath);
    throwIfCancelled(signal);
    if (!res) return;

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
          userId: user.id || undefined,
          email: user.email,
          devToken: user.devToken,
          token: user.token,
        });
      } catch (e) {
        const authMsg = authErrorMessage(e);
        if (authMsg) throw new Error(authMsg);
        throw e;
      }
      throwIfCancelled(signal);

      // чиним разорванные ИИ предложения перед суммаризацией
      const normalized = normalize(transcriptionResult);
      persistTranscription(normalized);

      setProgress({ stage: "summarizing" });
      const chunks: CaptionsChunk[] = normalized.chunk.chunks ?? [];
      const { titles, sections, description, tags } = await generateAll(chunks, signal, outputLanguage);
      throwIfCancelled(signal);

      const nextResult: ResultState = {
        titles,
        description,
        tags: tagsToText(tags),
        chapters: sectionsToChapters(sections),
        offset: res.offset ?? 0,
      };
      persistResult(nextResult);
      setScreen("results");
      window.dispatchEvent(new Event("aitools-credits-changed"));
    } finally {
      // wav/avi + mp3 — только когда flow полностью завершён (успех, ошибка
      // или отмена), чтобы не дёргать файлы, которые хост ещё держит открытыми
      cleanupTempAudio([res.source, res.dest]);
    }
  };

  const handleCancelGenerate = () => {
    abortRef.current?.abort();
  };

  const handleGenerate = async () => {
    if (progress) return;
    if (generationsLeft <= 0) {
      setError("No generations left. Upgrade your plan or buy extra credits.");
      return;
    }
    setError(null);
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      await runGeneration(controller.signal);
    } catch (e) {
      if (e instanceof Error && e.message === "Cancelled") {
        // тихая отмена — без error-banner
      } else {
        setError(e instanceof Error ? e.message : String(e));
        reportSupportError("chapters.generate", e);
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  // повторный вызов /api/generations/chapters по уже готовому транскрипту, без
  // повторного рендера/транскрипции; каждая секция регенерируется независимо —
  // точечный target на бэкенде не трогает остальные поля
  const handleRegenerateTitles = async () => {
    const source = transcriptionRef.current;
    if (!source || regeneratingTitles) return;
    if (generationsLeft <= 0) {
      setError("No generations left. Upgrade your plan or buy extra credits.");
      return;
    }
    setRegeneratingTitles(true);
    setError(null);
    try {
      const chunks: CaptionsChunk[] = source.chunk.chunks ?? [];
      const titles = await regenerateTitles(chunks, undefined, outputLanguage);
      persistResult({ ...result, titles });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      reportSupportError("chapters.regenerate_titles", e);
    } finally {
      setRegeneratingTitles(false);
    }
  };

  const handleRegenerateChapters = async () => {
    const source = transcriptionRef.current;
    if (!source || regeneratingChapters) return;
    if (generationsLeft <= 0) {
      setError("No generations left. Upgrade your plan or buy extra credits.");
      return;
    }
    setRegeneratingChapters(true);
    setError(null);
    try {
      const chunks: CaptionsChunk[] = source.chunk.chunks ?? [];
      const sections = await regenerateChapters(chunks, undefined, outputLanguage);
      persistResult({ ...result, chapters: sectionsToChapters(sections) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      reportSupportError("chapters.regenerate_chapters", e);
    } finally {
      setRegeneratingChapters(false);
    }
  };

  const handleRegenerateDescription = async () => {
    const source = transcriptionRef.current;
    if (!source || regeneratingDescription) return;
    if (generationsLeft <= 0) {
      setError("No generations left. Upgrade your plan or buy extra credits.");
      return;
    }
    setRegeneratingDescription(true);
    setError(null);
    try {
      const chunks: CaptionsChunk[] = source.chunk.chunks ?? [];
      const description = await regenerateDescription(chunks, undefined, outputLanguage);
      persistResult({ ...result, description });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      reportSupportError("chapters.regenerate_description", e);
    } finally {
      setRegeneratingDescription(false);
    }
  };

  const handleRegenerateTags = async () => {
    const source = transcriptionRef.current;
    if (!source || regeneratingTags) return;
    if (generationsLeft <= 0) {
      setError("No generations left. Upgrade your plan or buy extra credits.");
      return;
    }
    setRegeneratingTags(true);
    setError(null);
    try {
      const chunks: CaptionsChunk[] = source.chunk.chunks ?? [];
      const tags = await regenerateTags(chunks, undefined, outputLanguage);
      persistResult({ ...result, tags: tagsToText(tags) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      reportSupportError("chapters.regenerate_tags", e);
    } finally {
      setRegeneratingTags(false);
    }
  };

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

  // "Copy Description" в футере — цельный блок для поля Description на YouTube:
  // текст описания + список таймкодов глав + теги в виде #хэштегов
  const handleCopyDescription = () =>
    copyToClipboard(formatFullDescription(result.description, result.chapters, result.tags));

  // маркеры ставим на реальные тайминги (time + offset рендера), без правила
  // "первая глава = 00:00" — оно нужно только для текстового YouTube-формата
  const handleAddMarkers = async () => {
    if (addingMarkers || !result.chapters.length) return false;
    setAddingMarkers(true);
    try {
      await reloadJSX();
      const markers = [...result.chapters]
        .sort((a, b) => a.time - b.time)
        .map((c) => ({ time: c.time + result.offset, name: c.title.trim() || "Chapter" }));
      const res = await evalTS("addMarkers", { markers });
      return !!res;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      reportSupportError("chapters.add_markers", e);
      return false;
    } finally {
      setAddingMarkers(false);
    }
  };

  // Back — только UI, данные остаются, чтобы можно было вернуться в Results
  const handleBack = () => {
    setScreen("landing");
  };

  // загрузка последнего результата при открытии панели
  useEffect(() => {
    const storedTranscription = localStorage.getItem(TRANSCRIPTION_KEY);
    if (storedTranscription) {
      try {
        setTranscription(JSON.parse(storedTranscription));
      } catch {
        // ignore corrupt
      }
    }
    const storedResult = localStorage.getItem(RESULT_KEY);
    if (storedResult) {
      try {
        const parsed = JSON.parse(storedResult) as Partial<ResultState>;
        if (parsed?.chapters?.length) {
          // ...emptyResult подстраховывает старые записи (до появления description/tags)
          setResult({ ...emptyResult, ...parsed });
          setScreen("results");
        }
      } catch {
        // ignore corrupt
      }
    }
  }, []);

  return (
    <div className="app-shell">
      <ProgressDialog
        progress={progress}
        onCancel={handleCancelGenerate}
        title="Generating chapters"
        steps={CHAPTERS_PROGRESS_STEPS}
      />
      {error && (
        <div className="error-banner">
          <p className="error-banner__text">{error}</p>
        </div>
      )}
      <ChaptersTab
        screen={screen}
        progress={progress}
        onGenerate={handleGenerate}
        onBack={handleBack}
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
