import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptionsTab } from "../../components/CaptionsTab";
import {
  ProgressDialog,
  CAPTIONS_PROGRESS_STEPS,
  type DescribeProgress,
  type DescribeType,
} from "../../components/ProgressDialog";
import { fs } from "../../lib/cep/node";
import { csi, reloadJSX } from "../../lib/utils/bolt";
import { hostSdk, sdkData } from "@/sdk/host-api";
import { convertToMp3, detectSpeechStart } from "../../utils/ffmpeg";
import { getBundledAudioPresetPath } from "../../utils/audioPreset";
import { getUserIdentity } from "../../api";
import { reportSupportError } from "../../api/support";
import { authErrorMessage, getLocalStyleAssetPaths } from "../../styles";
import { toHostCaptionPayload } from "../../utils/captionHostPayload";
import {
  captionsToChunks,
  clampTranscriptionToSpeechStart,
  grouping,
  moveWordToAdjacent,
  normalize,
  splitIntoWords,
  transcribe,
  wordsFromChunks,
  type AppliedSegmentConfig,
  type Caption,
  type CaptionsChunk,
  type GroupingMode,
  type TranscribeResult,
} from "../../utils/transcribe";
import "./CaptionsApp.scss";
import { useConfiguration } from "../../../context/ConfigurationWrapper";
import * as panelStore from "../../lib/userdata-store";

const STORAGE_KEY = "aitools-cep-transcription";
const META_KEY = "aitools-cep-caption-meta";
const CUSTOM_SEGMENTS_KEY = "aitools-cep-caption-custom-segments";
const APPLIED_CONFIG_KEY = "aitools-cep-caption-applied-config";

// куда пушить live-правки текста уже созданных captions: трек+клип в Premiere
// (опционально sequenceId nested-секвенции), comp в AE
type HostRef =
  | { trackIndex: number; sequenceId?: string }
  | { compId: number };
type Meta = {
  type: DescribeType;
  offset: number;
  hostRef?: HostRef;
  // AE: id композиции, в которой нажали Transcribe — sync scroll только в ней
  // (или внутри captions-precomp из hostRef)
  sourceCompId?: number;
};

// JSON, который кладём в SourceText маркер-слоя AE / marker.comments Premiere
type SessionPayload = {
  data: TranscribeResult;
  customSegments: CaptionsChunk[] | null;
  mode: GroupingMode;
  lines: number;
  characters: number;
  offset: number;
  type: DescribeType;
  sourceCompId?: number;
  selectedPresetId?: string;
  /** Premiere: track index внутри nested captions sequence */
  trackIndex?: number;
};

// ближайший к моменту t caption: попадание в диапазон — dist 0, иначе расстояние
// до края; null, если captions пуст (нечего искать)
const findCaptionIndex = (captions: Caption[], t: number): number | null => {
  if (!captions.length) return null;
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < captions.length; i++) {
    const [s, e] = captions[i].timestamp;
    const dist = t < s ? s - t : t > e ? t - e : 0;
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
    if (dist === 0) break;
  }
  return bestIndex;
};

// пересобрать слова из отредактированного текста: то же число слов — таймкоды 1:1,
// иначе время диапазона перераспределяется пропорционально длине слов
const rebuildWords = (orig: CaptionsChunk[], text: string): CaptionsChunk[] => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !orig.length) return [];
  if (tokens.length === orig.length) {
    return orig.map((w, i) => ({ text: tokens[i], timestamp: w.timestamp }));
  }
  const start = orig[0].timestamp[0];
  const end = orig[orig.length - 1].timestamp[1];
  const span = Math.max(0, end - start);
  const totalChars = tokens.reduce((sum, t) => sum + t.length, 0) || tokens.length;
  let cursor = start;
  return tokens.map((tok, i) => {
    const dur = i === tokens.length - 1 ? end - cursor : span * (tok.length / totalChars);
    const ws = cursor;
    cursor += dur;
    return { text: tok, timestamp: [ws, cursor] as [number, number] };
  });
};

const isAfterEffects = () => csi.hostEnvironment?.appId === "AEFT";

export const CaptionsApp = ({
  generationsLeft = 0,
}: {
  generationsLeft?: number;
}) => {
  const {
    mode,
    lines,
    characters,
    fontSize,
    mogrtPath,
    aepPath,
    audioPresetPath,
    srcLang,
    translateTo,
    presets,
    selectedPresetId,
    ensureStyleDownloaded,
    updateMode,
    updateLines,
    updateCharacters,
    selectPreset,
  } = useConfiguration();
  const [data, setData] = useState<TranscribeResult | null>(null);
  const [customSegments, setCustomSegments] = useState<CaptionsChunk[] | null>(null);
  const [progress, setProgress] = useState<DescribeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // разбивка, реально применённая к хосту в последний раз (создание/Update) —
  // пока текущие mode/lines/characters совпадают с ней, кнопка Update не нужна
  const [appliedConfig, setAppliedConfig] = useState<AppliedSegmentConfig | null>(null);
  // true на время запроса к хосту по кнопке Update — держим её disabled, чтобы
  // не наспамить повторными вызовами до завершения предыдущего
  const [resegmenting, setResegmenting] = useState(false);
  // источник транскрипции, сдвиг таймкодов и ссылка на уже созданные captions в хосте
  const [meta, setMeta] = useState<Meta>({ type: "composition", offset: 0 });
  // landing | editor — явный экран, чтобы Back не сбрасывал данные
  const [screen, setScreen] = useState<"landing" | "editor">("landing");
  // индекс caption под плейхедом — border остаётся, пока sync указывает на этот сегмент
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  // время плейхеда, на которое реагировала последняя синхронизация — если оно не
  // изменилось с прошлого тика, скролл пользователя по списку не трогаем
  const lastSyncedTimeRef = useRef<number | null>(null);
  const lastSyncedIndexRef = useRef<number | null>(null);
  // пропускаем первый тик session-save после restore/create
  const skipSessionSaveRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  // Load-кнопка на лендинге: активна, если выбран nest / открыта captions-seq
  const [canLoad, setCanLoad] = useState(false);

  // captions выводятся прямо из ответа API; align только внутри custom-ветки grouping
  const captions = useMemo(
    () => (data ? grouping(data, { mode, lines, characters }, { customSegments }) : []),
    [data, mode, lines, characters, customSegments],
  );

  // источник/мета в ref, чтобы колбэки правки были стабильными для memo блоков
  const dataRef = useRef(data);
  dataRef.current = data;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const customSegmentsRef = useRef(customSegments);
  customSegmentsRef.current = customSegments;
  const captionsRef = useRef(captions);
  captionsRef.current = captions;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const charactersRef = useRef(characters);
  charactersRef.current = characters;

  const persist = (next: TranscribeResult) => {
    panelStore.setItem(STORAGE_KEY, JSON.stringify(next));
    setData(next);
  };

  const persistCustomSegments = (next: CaptionsChunk[] | null) => {
    if (next) panelStore.setItem(CUSTOM_SEGMENTS_KEY, JSON.stringify(next));
    else panelStore.removeItem(CUSTOM_SEGMENTS_KEY);
    setCustomSegments(next);
  };

  const persistAppliedConfig = (next: AppliedSegmentConfig | null) => {
    if (next) panelStore.setItem(APPLIED_CONFIG_KEY, JSON.stringify(next));
    else panelStore.removeItem(APPLIED_CONFIG_KEY);
    setAppliedConfig(next);
  };

  // лениво инициализировать customSegments из текущего UI (для words/custom правок)
  const ensureCustomSegments = (): CaptionsChunk[] => {
    if (customSegmentsRef.current) return customSegmentsRef.current;
    return captionsToChunks(captionsRef.current);
  };

  // пушим текущую разбивку в AE captions-precomp (кнопка Update / правки границ).
  // Возвращает Promise, чтобы вызывающий (Update) мог дождаться реального
  // завершения запроса к хосту, прежде чем гасить disabled/индикатор
  const pushHostResegment = (opts?: {
    data?: TranscribeResult;
    customSegments?: CaptionsChunk[] | null;
  }): Promise<void> => {
    const hostRef = metaRef.current.hostRef;
    const source = opts?.data ?? dataRef.current;
    if (!hostRef || !source) return Promise.resolve();
    const custom =
      opts && "customSegments" in opts ? opts.customSegments : customSegmentsRef.current;
    const resegmented = grouping(
      source,
      { mode: modeRef.current, lines: linesRef.current, characters: charactersRef.current },
      { customSegments: custom },
    );
    const offset = metaRef.current.offset;
    const payload = toHostCaptionPayload(resegmented, {
      offset,
      mogrtPath,
      aepPath,
    });
    // единый payload под оба хоста: AE ищет comp по compId, Premiere — трек
    // по trackIndex (у чужого хоста лишнее поле просто игнорируется)
    return sdkData(
      hostSdk().resegmentCaptions({
      compId: "compId" in hostRef ? hostRef.compId : 0,
      trackIndex: "trackIndex" in hostRef ? hostRef.trackIndex : undefined,
      sequenceId: "sequenceId" in hostRef ? hostRef.sequenceId : undefined,
      captions: payload,
    }),
    )
      .then(() => undefined)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        reportSupportError("captions.resegment", e);
      });
  };

  const handleUpdateResegment = async () => {
    if (resegmenting) return;
    setResegmenting(true);
    try {
      // Update сбрасывает ручную разбивку words/custom — режим/слайдеры полностью пересобирают UI+хост
      if (customSegmentsRef.current) persistCustomSegments(null);
      await pushHostResegment({ customSegments: null });
      // теперь то, что реально в хосте, соответствует текущим настройкам —
      // запоминаем как применённый вариант, чтобы скрыть кнопку Update для него
      persistAppliedConfig({ mode: modeRef.current, lines: linesRef.current, characters: charactersRef.current });
    } finally {
      setResegmenting(false);
    }
  };

  const applySegmentEdit = (nextChunks: CaptionsChunk[], caption: Caption) => {
    if (caption.edit.target === "sentence" || modeRef.current === "sentence") {
      const source = dataRef.current;
      if (!source) return;
      const next = { ...source, chunk: { ...source.chunk, chunks: nextChunks } };
      persist(next);
      pushHostResegment({ data: next });
      return;
    }
    persistCustomSegments(nextChunks);
    pushHostResegment({ customSegments: nextChunks });
  };

  const restoreSession = (payload: SessionPayload, hostId: { compId?: number; sequenceId?: string }) => {
    const normalized = normalize(payload.data);
    persist(normalized);
    persistCustomSegments(payload.customSegments ?? null);
    if (payload.mode) updateMode(payload.mode);
    if (typeof payload.lines === "number") updateLines(payload.lines);
    if (typeof payload.characters === "number") updateCharacters(payload.characters);
    if (payload.selectedPresetId) selectPreset(payload.selectedPresetId);
    // то, что загрузили — уже применённая к хосту разбивка
    persistAppliedConfig({
      mode: payload.mode ?? modeRef.current,
      lines: payload.lines ?? linesRef.current,
      characters: payload.characters ?? charactersRef.current,
    });
    const hostRef: HostRef | undefined =
      typeof hostId.compId === "number"
        ? { compId: hostId.compId }
        : hostId.sequenceId
          ? {
              trackIndex:
                typeof payload.trackIndex === "number" ? payload.trackIndex : 0,
              sequenceId: hostId.sequenceId,
            }
          : undefined;
    const nextMeta: Meta = {
      type: payload.type ?? "composition",
      offset: payload.offset ?? 0,
      hostRef,
      sourceCompId: payload.sourceCompId,
    };
    panelStore.setItem(META_KEY, JSON.stringify(nextMeta));
    setMeta(nextMeta);
    skipSessionSaveRef.current = true;
    setScreen("editor");
  };

  // Проверяем наличие captions в выделении / активной seq — без кэша и fallback
  const checkLoadAvailability = async () => {
    try {
      const found = (await sdkData(hostSdk().findAppliedCaptions())) as
        | {
            compId?: number;
            sequenceId?: string;
            hasCaptions?: boolean;
          }
        | null
        | undefined;
      const hasId =
        typeof found?.compId === "number" ||
        (typeof found?.sequenceId === "string" && !!found.sequenceId);
      setCanLoad(!!found && !!found.hasCaptions && hasId);
    } catch {
      setCanLoad(false);
    }
  };

  // Premiere: читаем mogrt'ы из nest (текст + тайминг). AE: session marker.
  const handleLoad = async () => {
    if (progress) return;
    setError(null);
    try {
      if (!isAfterEffects()) {
        const loaded = (await sdkData(hostSdk().loadCaptionsFromTimeline())) as
          | {
              sequenceId?: string;
              trackIndex?: number;
              segments?: { text: string; timestamp: [number, number] }[];
            }
          | null
          | undefined;
        if (!loaded?.segments?.length || !loaded.sequenceId) {
          setCanLoad(false);
          setError("Select a captions nest on the timeline (or open it), then click Load");
          return;
        }
        const segments: CaptionsChunk[] = loaded.segments.map((s) => ({
          text: s.text,
          timestamp: s.timestamp,
        }));
        // translated: true — не пересобирать chunk через sentencesFromWords,
        // иначе сегменты без .!? сливаются в один (как на Load с таймлайна)
        const dataFromTimeline: TranscribeResult = normalize({
          chunk: { chunks: segments },
          words: { chunks: wordsFromChunks(segments) },
          translated: true,
        });
        persist(dataFromTimeline);
        persistCustomSegments(null);
        updateMode("sentence");
        persistAppliedConfig({
          mode: "sentence",
          lines: linesRef.current,
          characters: charactersRef.current,
        });
        const hostRef: HostRef = {
          trackIndex: typeof loaded.trackIndex === "number" ? loaded.trackIndex : 0,
          sequenceId: loaded.sequenceId,
        };
        const nextMeta: Meta = {
          type: "composition",
          offset: 0,
          hostRef,
        };
        panelStore.setItem(META_KEY, JSON.stringify(nextMeta));
        setMeta(nextMeta);
        skipSessionSaveRef.current = true;
        setScreen("editor");
        return;
      }

      const found = (await sdkData(hostSdk().findAppliedCaptions())) as
        | {
            compId?: number;
            sequenceId?: string;
            sessionData?: string;
            hasCaptions?: boolean;
          }
        | null
        | undefined;
      if (!found?.hasCaptions || typeof found.compId !== "number") {
        setCanLoad(false);
        setError("No captions found in the current composition");
        return;
      }
      let payload: SessionPayload;
      try {
        payload = JSON.parse(found.sessionData || "{}") as SessionPayload;
      } catch {
        setError("Could not read caption settings from this composition");
        return;
      }
      if (!payload?.data) {
        setError("This composition has caption layers, but no saved settings to load");
        return;
      }
      if (payload.sourceCompId == null) {
        const now = (await sdkData(hostSdk().getCurrentTime())) as { time?: number; compId?: number } | null;
        if (now && typeof now.compId === "number" && now.compId !== found.compId) {
          payload.sourceCompId = now.compId;
        }
      }
      restoreSession(payload, { compId: found.compId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      reportSupportError("captions.load", e);
    }
  };

  const throwIfCancelled = (signal: AbortSignal) => {
    if (signal.aborted) throw new Error("Cancelled");
  };

  // временные файлы рендера (wav/avi + mp3) удаляем в самом конце flow:
  // Premiere может держать хендл на только что отрендеренный файл, а удаление
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

  const runTranscription = async (signal: AbortSignal) => {
    const user = getUserIdentity();
    const selected = presets.find((p) => p.id === selectedPresetId);
    let activeMogrtPath = mogrtPath;
    let activeAepPath = aepPath;

    // доступ / скачивание пресета — только здесь, после Transcribe
    if (selected) {
      try {
        await ensureStyleDownloaded(selected.styleId);
        const paths = getLocalStyleAssetPaths(selected.styleId);
        if (paths?.mogrt) activeMogrtPath = paths.mogrt;
        if (paths?.aep) activeAepPath = paths.aep;
      } catch (e) {
        const authMsg = authErrorMessage(e);
        if (authMsg) throw new Error(authMsg);
        throw e;
      }
    }
    throwIfCancelled(signal);

    // Premiere вставляет captions только из .mogrt — падаем сразу с понятной
    // ошибкой, а не после рендера и транскрипции алертом из ExtendScript
    if (!isAfterEffects() && !activeMogrtPath) {
      throw new Error(
        "This style has no .mogrt file for Premiere Pro. Select a style with Premiere support and try again.",
      );
    }

    setProgress({ stage: "rendering" });
    // Premiere: пользовательский .epr из Settings, иначе бандленный WAV-пресет;
    // AE игнорирует параметр
    const effectivePresetPath = audioPresetPath || getBundledAudioPresetPath() || undefined;
    const describeRaw = await sdkData(hostSdk().describe(effectivePresetPath));
    throwIfCancelled(signal);
    const describeFail = describeRaw as {
      ok?: false;
      message?: string;
      reason?: string;
      source?: string;
      dest?: string;
      offset?: number;
      type?: "composition" | "selected";
    } | null;
    if (!describeRaw || !describeFail?.source || !describeFail.dest) {
      const soft =
        describeFail?.reason === "NO_ACTIVE_COMP" ||
        describeFail?.reason === "NO_ACTIVE_SEQUENCE" ||
        describeFail?.reason === "NO_AUDIO";
      const msg =
        (typeof describeFail?.message === "string" && describeFail.message) ||
        "Could not export audio from the composition. Check the work area / selected layers and try again.";
      const err = new Error(msg);
      (err as Error & { soft?: boolean }).soft = soft;
      throw err;
    }
    const res = {
      source: describeFail.source,
      dest: describeFail.dest,
      offset: describeFail.offset ?? 0,
      type: (describeFail.type ?? "composition") as "composition" | "selected",
    };

    try {
      setProgress({ stage: "converting" });
      const result = await convertToMp3(res.source, res.dest);
      throwIfCancelled(signal);

      // leading silence → speech start; подрежем первый сегмент после ASR
      let speechStart = 0;
      try {
        speechStart = await detectSpeechStart(result);
      } catch {
        speechStart = 0;
      }
      throwIfCancelled(signal);

      setProgress({ stage: "transcribing" });
      let transcription: TranscribeResult;
      try {
        transcription = await transcribe(result, {
          language: srcLang,
          translateTo,
          signal,
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

      // запоминаем источник и сдвиг (selected → inPoint первого клипа/слоя); старая
      // hostRef сознательно не переносится — новая транскрипция ещё не выведена в хост
      const nextMeta: Meta = { type: res.type, offset: res.offset ?? 0 };

      // чиним разорванные ИИ предложения + подрезаем ведущую тишину
      const normalized = clampTranscriptionToSpeechStart(normalize(transcription), speechStart);
      persistCustomSegments(null);
      persist(normalized);

      // сразу вставляем captions в хост — отдельного шага "Create Captions" больше нет,
      // Transcribe делает всё за один проход
      setProgress({ stage: "creating" });
      throwIfCancelled(signal);
      const newCaptions = grouping(normalized, { mode, lines, characters });
      const payload = toHostCaptionPayload(newCaptions, {
        offset: nextMeta.offset,
        mogrtPath: activeMogrtPath,
        aepPath: activeAepPath,
      });
      await reloadJSX();
      const createRes = await sdkData(hostSdk().createCaptions(payload));
      throwIfCancelled(signal);
      // evalTS() типизирует createCaptions по пересечению сигнатур ppro.ts/aeft.ts,
      // так что trackIndex/compId выглядят для TS как один фиксированный (не оба
      // опциональных) набор — приводим к реальной форме явно, определяем по хосту
      const createResult = createRes as
        | {
            trackIndex?: number;
            sequenceId?: string;
            compId?: number;
            sourceCompId?: number;
          }
        | null
        | undefined;
      // запоминаем, куда именно легли captions — нужно для live-edit (updateCaptionText)
      const hostRef: HostRef | undefined =
        createResult && typeof createResult.trackIndex === "number"
          ? {
              trackIndex: createResult.trackIndex,
              ...(createResult.sequenceId ? { sequenceId: createResult.sequenceId } : {}),
            }
          : createResult && typeof createResult.compId === "number"
            ? { compId: createResult.compId }
            : undefined;
      const finalMeta: Meta = {
        ...nextMeta,
        ...(hostRef ? { hostRef } : {}),
        ...(typeof createResult?.sourceCompId === "number" ? { sourceCompId: createResult.sourceCompId } : {}),
      };
      panelStore.setItem(META_KEY, JSON.stringify(finalMeta));
      setMeta(finalMeta);
      skipSessionSaveRef.current = false;
      setScreen("editor");
      // теперь в композиции есть captions — Load должен быть доступен, если вернуться на лендинг
      setCanLoad(true);
      // captions только что созданы ровно с текущими mode/lines/characters — это и есть применённый вариант
      persistAppliedConfig({ mode, lines, characters });

      try {
        window.dispatchEvent(new Event("aitools-credits-changed"));
      } catch {
        // ignore
      }

      // сразу сохранить сессию в маркер AE / Premiere nested sequence
      if (hostRef) {
        const session: SessionPayload = {
          data: normalized,
          customSegments: null,
          mode,
          lines,
          characters,
          offset: finalMeta.offset,
          type: finalMeta.type,
          sourceCompId: finalMeta.sourceCompId,
          selectedPresetId: selectedPresetId || undefined,
          trackIndex: "trackIndex" in hostRef ? hostRef.trackIndex : undefined,
        };
        const saveArgs =
          "compId" in hostRef
            ? { compId: hostRef.compId, json: JSON.stringify(session) }
            : {
                // Nest → sequenceId; без Nest — маркер на активной секвенции
                sequenceId: "sequenceId" in hostRef ? hostRef.sequenceId : undefined,
                json: JSON.stringify(session),
              };
        try {
          await sdkData(hostSdk().saveSessionData(saveArgs));
        } catch {
          // Load без маркера будет недоступен — не валим весь Transcribe
        }
      }
    } finally {
      // wav/avi + mp3 — только когда flow полностью завершён (успех, ошибка
      // или отмена), чтобы не дёргать файлы, которые хост ещё держит открытыми
      cleanupTempAudio([res.source, res.dest]);
    }
  };

  const handleCancelDescribe = () => {
    abortRef.current?.abort();
  };

  const handleDescribe = async () => {
    if (progress) return;
    if (generationsLeft <= 0) {
      setError("No generations left. Upgrade your plan or buy extra credits.");
      return;
    }
    setError(null);
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      await runTranscription(controller.signal);
    } catch (e) {
      if (e instanceof Error && e.message === "Cancelled") {
        // тихая отмена — без error-banner
      } else {
        setError(e instanceof Error ? e.message : String(e));
        const soft = !!(e && typeof e === "object" && (e as { soft?: boolean }).soft);
        if (!soft) reportSupportError("captions.transcribe", e);
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  // пушим правку текста в уже созданный caption на таймлайне (если Create Captions уже запускался).
  // Payload — единая форма с опциональными полями под оба хоста: evalTS() типизирует
  // updateCaptionText по пересечению сигнатур ppro.ts/aeft.ts, так что аргумент должен
  // структурно подходить под обе сразу, а не под одну из двух через ветвление
  const pushLiveEdit = (index: number, text: string) => {
    const hostRef = metaRef.current.hostRef;
    if (!hostRef) return;
    const isPremiere = csi.hostEnvironment?.appId === "PPRO";
    hostSdk()
      .updateCaptionText({
      trackIndex: isPremiere ? (hostRef as { trackIndex: number }).trackIndex : undefined,
      clipIndex: isPremiere ? index : undefined,
      sequenceId:
        isPremiere && "sequenceId" in hostRef ? hostRef.sequenceId : undefined,
      compId: !isPremiere ? (hostRef as { compId: number }).compId : undefined,
      captionIndex: !isPremiere ? index : undefined,
      text,
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.error);
      })
      .catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
      reportSupportError("captions.live_edit", e);
    });
  };

  // правка текста одного caption — по режиму пишем в нужный chunk-массив
  const handleSaveCaption = useCallback((caption: Caption, index: number, text: string) => {
    const source = dataRef.current;
    if (!source) return;

    if (caption.edit.target === "sentence") {
      const idx = caption.edit.index;
      const chunks = (source.chunk.chunks ?? []).map((c, i) => (i === idx ? { ...c, text: text.trim() } : c));
      persist({ ...source, chunk: { ...source.chunk, chunks } });
      pushLiveEdit(index, text.trim());
      return;
    }

    // words/custom: правку всегда фиксируем как ручную разбивку (customSegments) —
    // иначе следующий пересчёт по characters стирал бы переносы строк, которые
    // пользователь расставил вручную в textarea (см. captionsFromChunks).
    // Слова (words.chunks) синхронизируем отдельно с новым текстом: отображение
    // рисуется по caption.words, а не по тексту сегмента, так что без этого
    // карточка продолжала бы показывать старые слова.
    const segsBefore = ensureCustomSegments();
    const indices = caption.edit.indices;
    const wordChunks = source.words.chunks ?? [];
    if (indices.length && wordChunks.length) {
      const orig = indices.map((i) => wordChunks[i]);
      const rebuilt = rebuildWords(orig, text);
      const chunks = [...wordChunks];
      chunks.splice(indices[0], indices.length, ...rebuilt);
      persist({ ...source, words: { ...source.words, chunks } });
    }

    const segs = segsBefore.map((c, i) => (i === index ? { ...c, text: text.trim() } : c));
    persistCustomSegments(segs);
    pushLiveEdit(index, text.trim());
  }, []);

  // split: режем предложение по слову (слово начинает новое предложение)
  const handleSplit = useCallback((caption: Caption, wordPos: number) => {
    const source = dataRef.current;
    if (!source || caption.edit.target !== "sentence" || !caption.words) return;
    const words = caption.words;
    if (wordPos <= 0 || wordPos >= words.length) return;
    const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const toChunk = (ws: typeof words): CaptionsChunk => {
      const texts = ws.map((w) => w.text);
      texts[0] = cap(texts[0]); // начало предложения с заглавной
      return { text: texts.join(" "), timestamp: [ws[0].timestamp[0], ws[ws.length - 1].timestamp[1]] };
    };
    const chunks = [...(source.chunk.chunks ?? [])];
    chunks.splice(caption.edit.index, 1, toChunk(words.slice(0, wordPos)), toChunk(words.slice(wordPos)));
    const next = { ...source, chunk: { ...source.chunk, chunks } };
    persist(next);
    pushHostResegment({ data: next });
  }, []);

  // merge: сшиваем предложение с соседним (prev: i-1+i, next: i+i+1)
  const handleMerge = useCallback((caption: Caption, dir: "prev" | "next") => {
    const source = dataRef.current;
    if (!source || caption.edit.target !== "sentence") return;
    const i = dir === "prev" ? caption.edit.index - 1 : caption.edit.index;
    const chunks = [...(source.chunk.chunks ?? [])];
    if (i < 0 || i + 1 >= chunks.length) return;
    const a = chunks[i];
    const b = chunks[i + 1];
    chunks.splice(i, 2, { text: `${a.text} ${b.text}`.trim(), timestamp: [a.timestamp[0], b.timestamp[1]] });
    const next = { ...source, chunk: { ...source.chunk, chunks } };
    persist(next);
    pushHostResegment({ data: next });
  }, []);

  // перенос первого слова вверх / последнего вниз
  const handleMoveWord = useCallback((caption: Caption, uiIndex: number, dir: "prev" | "next") => {
    const isSentence = caption.edit.target === "sentence" || modeRef.current === "sentence";
    const backing = isSentence
      ? [...(dataRef.current?.chunk.chunks ?? [])]
      : ensureCustomSegments();
    const segIndex = caption.edit.target === "sentence" ? caption.edit.index : uiIndex;
    const next = moveWordToAdjacent(backing, segIndex, dir, caption.words);
    if (!next) return;
    applySegmentEdit(next, caption);
  }, []);

  // разбить сегмент на однословные с сохранением таймингов
  const handleSplitIntoWords = useCallback((caption: Caption, uiIndex: number) => {
    if (!caption.words || caption.words.length < 2) return;
    const isSentence = caption.edit.target === "sentence" || modeRef.current === "sentence";
    const backing = isSentence
      ? [...(dataRef.current?.chunk.chunks ?? [])]
      : ensureCustomSegments();
    const segIndex = caption.edit.target === "sentence" ? caption.edit.index : uiIndex;
    const next = splitIntoWords(backing, segIndex, caption.words);
    if (!next) return;
    applySegmentEdit(next, caption);
  }, []);

  // клик по caption в списке — переставляем плейхед хоста на середину сегмента и
  // сразу подсвечиваем строку, не дожидаясь очередного тика авто-синхронизации.
  // Середина, а не начало: конец предыдущего сегмента совпадает с началом этого —
  // findCaptionIndex на границе матчит предыдущий (dist 0 там же), из-за чего
  // авто-синхронизация секунду спустя откатывала подсветку/скролл назад.
  const handleSeek = (caption: Caption, index: number) => {
    const mid = (caption.timestamp[0] + caption.timestamp[1]) / 2;
    const absoluteTime = mid + metaRef.current.offset;
    setHighlightIndex(index);
    lastSyncedIndexRef.current = index;
    lastSyncedTimeRef.current = absoluteTime;
    hostSdk()
      .setCurrentTime({ time: absoluteTime })
      .then((r) => {
        if (!r.ok) throw new Error(r.error);
      })
      .catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  };

  // скролл + постоянная подсветка caption под моментом t (уже с учётом offset)
  const syncToTime = (t: number) => {
    const bestIndex = findCaptionIndex(captions, t);
    if (bestIndex == null) return;
    // border остаётся на сегменте; скроллим только когда индекс сменился
    setHighlightIndex(bestIndex);
    if (bestIndex === lastSyncedIndexRef.current) return;
    lastSyncedIndexRef.current = bestIndex;
    document.querySelector(`[data-caption-index="${bestIndex}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // Авто-синхронизация с плейхедом: раз в 1.5с, и только когда панель видима
  // и пользователь не печатает — раньше evalTS раз в секунду без этих гвардов
  // лагал UI при правке текста caption.
  const TIMELINE_AUTO_SYNC = true;
  const TIMELINE_SYNC_INTERVAL_MS = 1500;
  useEffect(() => {
    if (!TIMELINE_AUTO_SYNC) return;
    const isTypingInField = () => {
      const active = document.activeElement;
      if (!active) return false;
      const tag = active.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || (active as HTMLElement).isContentEditable;
    };
    const tick = async () => {
      if (!captions.length || screen !== "editor") return;
      if (document.hidden || isTypingInField()) return;
      try {
        const current = await sdkData(hostSdk().getCurrentTime());
        if (current == null || typeof current !== "object") return;
        const { time, compId } = current as { time: number; compId?: number };

        // AE: не скроллим чужие композиции
        if (isAfterEffects()) {
          const sourceId = metaRef.current.sourceCompId;
          const captionsCompId =
            metaRef.current.hostRef && "compId" in metaRef.current.hostRef
              ? metaRef.current.hostRef.compId
              : undefined;
          if (sourceId != null || captionsCompId != null) {
            const allowed =
              (sourceId != null && compId === sourceId) ||
              (captionsCompId != null && compId === captionsCompId);
            if (!allowed) return;
          }
        }

        if (time === lastSyncedTimeRef.current) return;
        lastSyncedTimeRef.current = time;
        // UI-таймкоды относительные; в слоях offset уже заложен — для sync всегда вычитаем
        syncToTime(time - metaRef.current.offset);
      } catch {
        // нет активной композиции/секвенции — молча пропускаем тик
      }
    };
    const cron = setInterval(tick, TIMELINE_SYNC_INTERVAL_MS);
    return () => clearInterval(cron);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captions, screen]);

  // сброс ручной разбивки при смене mode/lines/characters — эти контролы
  // полностью пересобирают сегменты из слов (только UI; хост — по кнопке Update)
  const prevConfigRef = useRef({ mode, lines, characters });
  useEffect(() => {
    const prev = prevConfigRef.current;
    if (prev.mode !== mode || prev.lines !== lines || prev.characters !== characters) {
      prevConfigRef.current = { mode, lines, characters };
      if (customSegmentsRef.current) persistCustomSegments(null);
    }
  }, [mode, lines, characters]);

  // держим JSON сессии в маркере AE / Premiere синхронно с правками
  useEffect(() => {
    const hostRef = metaRef.current.hostRef;
    const source = dataRef.current;
    if (!hostRef || !source) return;
    const canSave =
      ("compId" in hostRef && isAfterEffects()) ||
      ("sequenceId" in hostRef && !!hostRef.sequenceId && !isAfterEffects());
    if (!canSave) return;
    if (skipSessionSaveRef.current) {
      skipSessionSaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const session: SessionPayload = {
        data: source,
        customSegments: customSegmentsRef.current,
        mode,
        lines,
        characters,
        offset: metaRef.current.offset,
        type: metaRef.current.type,
        sourceCompId: metaRef.current.sourceCompId,
        selectedPresetId: selectedPresetId || undefined,
        trackIndex: "trackIndex" in hostRef ? hostRef.trackIndex : undefined,
      };
      const saveArgs =
        "compId" in hostRef
          ? { compId: hostRef.compId, json: JSON.stringify(session) }
          : {
              sequenceId: "sequenceId" in hostRef ? hostRef.sequenceId : undefined,
              json: JSON.stringify(session),
            };
      hostSdk().saveSessionData(saveArgs).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, customSegments, mode, lines, characters, meta, selectedPresetId]);

  // Back — только UI, данные и композиция остаются; заодно обновляем Load —
  // пока панель была в editor, выделение в хосте могло смениться
  const handleBack = () => {
    setScreen("landing");
    checkLoadAvailability();
  };

  // загрузка метаданных + проверка Load; на лендинг не прыгаем в editor
  // с последним сохранением — иначе кажется, что Load поднял «прошлую» сессию
  // вместо выбранного nest
  useEffect(() => {
    const storedMeta = panelStore.getItem(META_KEY);
    if (storedMeta) {
      try {
        setMeta(JSON.parse(storedMeta));
      } catch {
        // ignore
      }
    }
    const storedApplied = panelStore.getItem(APPLIED_CONFIG_KEY);
    if (storedApplied) {
      try {
        setAppliedConfig(JSON.parse(storedApplied));
      } catch {
        // ignore corrupt
      }
    }

    checkLoadAvailability();
    // window "focus" срабатывает при переключении между приложениями, но CEP-панели,
    // закреплённые внутри одного окна хоста, часто не теряют/получают фокус при
    // переключении между вкладками/панелями — поэтому дублируем проверку на mouseover
    const onFocus = () => checkLoadAvailability();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell" onMouseEnter={() => checkLoadAvailability()}>
      <ProgressDialog
        progress={progress}
        onCancel={handleCancelDescribe}
        title="Generating captions"
        steps={CAPTIONS_PROGRESS_STEPS}
      />
      {error && (
        <div className="error-banner">
          <p className="error-banner__text">{error}</p>
        </div>
      )}
      <CaptionsTab
        captions={captions}
        meta={meta}
        progress={progress}
        sentenceCount={data?.chunk.chunks?.length ?? 0}
        fontSize={fontSize}
        highlightIndex={highlightIndex}
        screen={screen}
        canLoad={canLoad}
        onLoad={handleLoad}
        onDescribe={handleDescribe}
        onBack={handleBack}
        onSaveCaption={handleSaveCaption}
        onSeek={handleSeek}
        onSplit={handleSplit}
        onMerge={handleMerge}
        onMoveWord={handleMoveWord}
        onSplitWords={handleSplitIntoWords}
        onUpdateResegment={handleUpdateResegment}
        appliedResegmentConfig={appliedConfig}
        resegmenting={resegmenting}
      />
    </div>
  );
};
