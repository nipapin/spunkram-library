import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptionsTab } from "../../components/CaptionsTab";
import {
  ProgressDialog,
  CAPTIONS_PROGRESS_STEPS,
  LOAD_CAPTIONS_PROGRESS_STEPS,
  type DescribeProgress,
  type DescribeType,
} from "../../components/ProgressDialog";
import { fs } from "../../lib/cep/node";
import { cepHostAppId } from "../../lib/utils/bolt";
import { Motionflow } from "@/sdk";
import { hostSdk, sdkData } from "@/sdk/host-api";
import { convertToMp3, detectSpeechStart } from "../../utils/ffmpeg";
import { getBundledAudioPresetPath } from "../../utils/audioPreset";
import { describeForExport } from "../../utils/describeForExport";
import { getUserIdentity } from "../../api";
import { reportSupportError } from "../../api/support";
import { authErrorMessage, getLocalStyleAssetPaths, matchPresetByStyleName } from "../../styles";
import { toHostCaptionPayload, packTranscriptionToChunks, withSyncedRawWords, groupingModeFromSegmentType } from "../../utils/captionHostPayload";
import {
  captionsToChunks,
  clampTranscriptionToSpeechStart,
  grouping,
  moveWordToAdjacent,
  normalize,
  rebuildWords,
  splitIntoWords,
  transcribe,
  type AppliedSegmentConfig,
  type Caption,
  type CaptionsChunk,
  type GroupingMode,
  type TranscribeResult,
} from "../../utils/transcribe";
import { useWorkRangeCost } from "../../hooks/useWorkRangeCost";
import { withGenerationCostLabel } from "../../utils/generationCost";
import "./CaptionsApp.scss";
import { useConfiguration } from "../../../context/ConfigurationWrapper";
import * as panelStore from "../../lib/userdata-store";
import { usePanelUI } from "../../lib/panel-ui-context";
import { friendlyErrorMessage, isSoftHostError } from "../../utils/user-error";

const STORAGE_KEY = "aitools-cep-transcription";
const META_KEY = "aitools-cep-caption-meta";
const CUSTOM_SEGMENTS_KEY = "aitools-cep-caption-custom-segments";
const APPLIED_CONFIG_KEY = "aitools-cep-caption-applied-config";

// куда пушить live-правки: трек с одним caption-mogrt в Premiere, слой на таймлайне в AE
type HostRef =
  | { trackIndex: number; sequenceId?: string }
  | { compId: number };
type Meta = {
  type: DescribeType;
  /** Timeline start of the caption mogrt (clip.start / layer.startTime). */
  offset: number;
  /** In/Out (PPro) / Work Area (AE) — длина единственного caption-клипа. */
  durationSeconds?: number;
  hostRef?: HostRef;
  // AE: id композиции, в которой нажали Transcribe — sync scroll только в ней
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
  /** Premiere: track index with the caption mogrt */
  trackIndex?: number;
  durationSeconds?: number;
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

const isAfterEffects = () => cepHostAppId() === "AEFT";
const isPremiere = () => cepHostAppId() === "PPRO";

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
    selectPreset,
    ensureStyleDownloaded,
    applySelectedPresetToHost,
    syncSelectedPresetFontFromHost,
    ensureDefinitionLoaded,
    updateMode,
    updateLines,
    updateCharacters,
  } = useConfiguration();
  const { showStatus } = usePanelUI();
  const workRange = useWorkRangeCost(true);
  const generationCost = workRange.cost;
  const [data, setData] = useState<TranscribeResult | null>(null);
  const [customSegments, setCustomSegments] = useState<CaptionsChunk[] | null>(null);
  const [progress, setProgress] = useState<DescribeProgress | null>(null);
  const [loadProgress, setLoadProgress] = useState<DescribeProgress | null>(null);
  // разбивка, реально применённая к хосту в последний раз (создание/Update) —
  // пока текущие mode/lines/characters совпадают с ней, кнопка Update не нужна
  const [appliedConfig, setAppliedConfig] = useState<AppliedSegmentConfig | null>(null);

  const showError = (err: unknown) => {
    const msg = friendlyErrorMessage(err);
    if (!msg || msg === "Cancelled") return;
    showStatus(msg, "error", 7000);
  };
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
    dataRef.current = next;
    panelStore.setItem(STORAGE_KEY, JSON.stringify(next));
    setData(next);
  };

  const persistCustomSegments = (next: CaptionsChunk[] | null) => {
    customSegmentsRef.current = next;
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

  // пушим Segment Type / Line Count / packed captions_batch_* в единственный слой/клип
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
      durationSeconds: metaRef.current.durationSeconds,
      mogrtPath,
      aepPath,
      styleName: presets.find((p) => p.id === selectedPresetId)?.name,
      rawWords: source.raw?.words,
      mode: modeRef.current,
      lines: linesRef.current,
      characters: charactersRef.current,
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
        showError(e);
        if (!isSoftHostError(e)) reportSupportError("captions.resegment", e);
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

  const handleLoad = async () => {
    if (progress || loadProgress) return;
    setLoadProgress({ stage: "loading" });
    try {
      const loaded = (await sdkData(hostSdk().loadCaptionsFromTimeline())) as
        | {
            sequenceId?: string;
            compId?: number;
            trackIndex?: number;
            startTime?: number;
            durationSeconds?: number;
            styleName?: string;
            fontId?: string;
            segments?: { text: string; timestamp: [number, number] }[];
            segmentType?: number;
            lineCount?: number;
            charsPerLine?: number;
          }
        | null
        | undefined;
      if (!loaded?.segments?.length) return;

      const wordChunks: CaptionsChunk[] = loaded.segments.map((s) => ({
        text: s.text,
        timestamp: s.timestamp,
      }));
      const nextMode =
        typeof loaded.segmentType === "number"
          ? groupingModeFromSegmentType(loaded.segmentType)
          : modeRef.current;
      const nextLines =
        typeof loaded.lineCount === "number"
          ? Math.max(1, Math.round(loaded.lineCount))
          : linesRef.current;
      const nextChars =
        typeof loaded.charsPerLine === "number"
          ? Math.max(1, Math.round(loaded.charsPerLine))
          : charactersRef.current;

      updateMode(nextMode);
      if (typeof loaded.lineCount === "number") updateLines(nextLines);
      if (typeof loaded.charsPerLine === "number") updateCharacters(nextChars);

      const dataFromTimeline: TranscribeResult = normalize({
        chunk: { chunks: [] },
        words: { chunks: wordChunks },
        translated: false,
      });
      persist(dataFromTimeline);
      persistCustomSegments(null);
      persistAppliedConfig({
        mode: nextMode,
        lines: nextLines,
        characters: nextChars,
      });

      const hostRef: HostRef | undefined =
        typeof loaded.compId === "number"
          ? { compId: loaded.compId }
          : loaded.sequenceId
            ? {
                trackIndex: typeof loaded.trackIndex === "number" ? loaded.trackIndex : 0,
                sequenceId: loaded.sequenceId,
              }
            : undefined;
      const startTime = Number(loaded.startTime);
      const durationSeconds = Number(loaded.durationSeconds);
      const nextMeta: Meta = {
        type: "composition",
        offset: Number.isFinite(startTime) ? startTime : 0,
        durationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
        hostRef,
      };
      panelStore.setItem(META_KEY, JSON.stringify(nextMeta));
      setMeta(nextMeta);
      skipSessionSaveRef.current = true;
      setScreen("editor");

      const styleName = typeof loaded.styleName === "string" ? loaded.styleName.trim() : "";
      const matched = styleName ? matchPresetByStyleName(presets, styleName) : undefined;
      if (matched) {
        selectPreset(matched.id, { applyToHost: false });
      }
      const fontId = typeof loaded.fontId === "string" ? loaded.fontId.trim() : "";
      if (fontId) {
        const styleKey = matched?.id;
        if (styleKey) {
          void ensureDefinitionLoaded(styleKey).then(() => {
            syncSelectedPresetFontFromHost(fontId);
          });
        } else {
          syncSelectedPresetFontFromHost(fontId);
        }
      }
    } catch {
      // не isMGT / несколько слоёв / пустой mogrt — тихая ошибка
    } finally {
      setLoadProgress(null);
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
    // Progress first — style download / JSX load can take seconds with no other UI.
    setProgress({ stage: "rendering" });
    await Motionflow.ready();
    throwIfCancelled(signal);

    const user = getUserIdentity();
    const selected = presets.find((p) => p.id === selectedPresetId);
    let activeMogrtPath = mogrtPath;
    let activeAepPath = aepPath;

    // доступ / скачивание пресета — только здесь, после Transcribe
    if (selected) {
      try {
        await ensureStyleDownloaded(selected.styleId);
        const paths = getLocalStyleAssetPaths();
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
    // AE pre-flight: ensure the selected style has an .aep asset, or the default
    // captions flow can still proceed without one. Fail before spending credits.
    if (isAfterEffects() && selected && !activeAepPath && !activeMogrtPath) {
      throw new Error(
        "This style has no .aep file for After Effects. Select a style with After Effects support and try again.",
      );
    }
    // Premiere: пользовательский .epr из Settings, иначе бандленный WAV-пресет;
    // AE игнорирует параметр
    const effectivePresetPath = audioPresetPath || getBundledAudioPresetPath() || undefined;
    const res = await describeForExport(effectivePresetPath);
    throwIfCancelled(signal);

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

      // запоминаем источник и сдвиг (selected → inPoint первого клипа/слоя); старая
      // hostRef сознательно не переносится — новая транскрипция ещё не выведена в хост
      const nextMeta: Meta = {
        type: res.type,
        offset: res.offset ?? 0,
        durationSeconds: res.durationSeconds > 0 ? res.durationSeconds : undefined,
      };

      // чиним разорванные ИИ предложения + подрезаем ведущую тишину
      const normalized = clampTranscriptionToSpeechStart(normalize(transcription), speechStart);
      if (!normalized.words?.chunks?.length && !normalized.chunk?.chunks?.length) {
        throw new Error("No speech found in the In/Out range. Check the audio and try again.");
      }
      persistCustomSegments(null);
      persist(normalized);

      // сразу вставляем captions в хост — отдельного шага "Create Captions" больше нет,
      // Transcribe делает всё за один проход
      setProgress({ stage: "creating" });
      throwIfCancelled(signal);
      const newCaptions = grouping(normalized, { mode, lines, characters });
      const payload = toHostCaptionPayload(newCaptions, {
        offset: nextMeta.offset,
        durationSeconds: nextMeta.durationSeconds,
        mogrtPath: activeMogrtPath,
        aepPath: activeAepPath,
        styleName: selected?.name,
        rawWords: normalized.raw?.words,
        mode,
        lines,
        characters,
      });
      const created = await hostSdk().createCaptions(payload);
      throwIfCancelled(signal);
      if (!created.ok) {
        throw new Error(
          created.error || "Could not create captions on the timeline. Select a style and try again.",
        );
      }
      const createRes = created.data as
        | {
            created?: number;
            error?: string;
            trackIndex?: number;
            sequenceId?: string;
            compId?: number;
            sourceCompId?: number;
            startTime?: number;
            durationSeconds?: number;
            fontId?: string;
          }
        | null
        | undefined;
      if (typeof createRes?.error === "string" && createRes.error) {
        throw new Error(createRes.error);
      }
      if (createRes == null || createRes.created === 0) {
        throw new Error("Could not create captions on the timeline. Select a style and try again.");
      }
      // evalTS() типизирует createCaptions по пересечению сигнатур ppro.ts/aeft.ts,
      // так что trackIndex/compId выглядят для TS как один фиксированный (не оба
      // опциональных) набор — приводим к реальной форме явно, определяем по хосту
      const createResult = createRes;
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
      const placedStart = Number(createResult?.startTime);
      const placedDuration = Number(createResult?.durationSeconds);
      const finalMeta: Meta = {
        ...nextMeta,
        offset: Number.isFinite(placedStart) ? placedStart : nextMeta.offset,
        durationSeconds:
          placedDuration > 0 ? placedDuration : nextMeta.durationSeconds,
        ...(hostRef ? { hostRef } : {}),
        ...(typeof createResult?.sourceCompId === "number" ? { sourceCompId: createResult.sourceCompId } : {}),
      };
      panelStore.setItem(META_KEY, JSON.stringify(finalMeta));
      setMeta(finalMeta);
      skipSessionSaveRef.current = false;
      setScreen("editor");
      persistAppliedConfig({ mode, lines, characters });

      if (hostRef) {
        // Shared master: catalog presets are JSON overlays — always push values after create.
        try {
          await applySelectedPresetToHost();
        } catch {
          // style did not apply — captions are already on the timeline
        }
      }

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
          durationSeconds: finalMeta.durationSeconds,
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
      await runTranscription(controller.signal);
    } catch (e) {
      if (e instanceof Error && e.message === "Cancelled") {
        // quiet cancel — no toast
      } else {
        showError(e);
        if (!isSoftHostError(e)) reportSupportError("captions.transcribe", e);
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  // пушим правку текста в уже созданный caption на таймлайне (если Create Captions уже запускался).
  // Всегда пишем полный v4 dump всего транскрипта — один сегмент в Store hidden
  // затирает остальные captions_batch_* и субтитры пропадают.
  const pushLiveEdit = (source: TranscribeResult) => {
    const hostRef = metaRef.current.hostRef;
    if (!hostRef) return;
    // разбивку считаем по свежим данным: captions в стейте пересоберутся только
    // на следующем рендере, а в пак она нужна уже сейчас
    const resegmented = grouping(
      source,
      { mode: modeRef.current, lines: linesRef.current, characters: charactersRef.current },
      { customSegments: customSegmentsRef.current },
    );
    const captionChunks = packTranscriptionToChunks(source, resegmented);
    if (!captionChunks.length) return;
    const premiere = isPremiere();
    hostSdk()
      .updateCaptionText({
      trackIndex: premiere ? (hostRef as { trackIndex: number }).trackIndex : undefined,
      clipIndex: premiere ? 0 : undefined,
      sequenceId:
        premiere && "sequenceId" in hostRef ? hostRef.sequenceId : undefined,
      compId: !premiere ? (hostRef as { compId: number }).compId : undefined,
      captionIndex: !premiere ? 0 : undefined,
      text: source.words?.text || "",
      captionChunks,
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.error);
      })
      .catch((e: unknown) => {
      showError(e);
      if (!isSoftHostError(e)) reportSupportError("captions.live_edit", e);
    });
  };

  const applyWordTextEdit = (source: TranscribeResult, caption: Caption, text: string): TranscribeResult => {
    const wordChunks = source.words.chunks ?? [];
    const indices =
      caption.edit.target === "words"
        ? caption.edit.indices
        : (caption.words ?? []).map((w) => w.gi);
    const orig = indices.map((i) => wordChunks[i]).filter(Boolean);
    if (!indices.length || !orig.length) {
      return withSyncedRawWords(source, wordChunks);
    }
    const rebuilt = rebuildWords(orig, text);
    if (!rebuilt.length) {
      return withSyncedRawWords(source, wordChunks);
    }
    const chunks = [...wordChunks];
    chunks.splice(indices[0], indices.length, ...rebuilt);
    return withSyncedRawWords(source, chunks);
  };

  // правка текста одного caption — по режиму пишем в нужный chunk-массив
  const handleSaveCaption = useCallback((caption: Caption, index: number, text: string) => {
    const source = dataRef.current;
    if (!source) return;
    const trimmed = text.trim();

    if (caption.edit.target === "sentence") {
      const idx = caption.edit.index;
      const sentenceChunks = (source.chunk.chunks ?? []).map((c, i) =>
        i === idx ? { ...c, text: trimmed } : c,
      );
      const next = applyWordTextEdit(
        { ...source, chunk: { ...source.chunk, chunks: sentenceChunks } },
        caption,
        trimmed,
      );
      persist(next);
      pushLiveEdit(next);
      return;
    }

    // words/custom: правку всегда фиксируем как ручную разбивку (customSegments) —
    // иначе следующий пересчёт по characters стирал бы переносы строк, которые
    // пользователь расставил вручную в textarea (см. captionsFromChunks).
    // manual — правленый сегмент читается as is, правила lines/characters на него
    // больше не распространяются.
    const segsBefore = ensureCustomSegments();
    const next = applyWordTextEdit(source, caption, trimmed);
    persist(next);

    const segs = segsBefore.map((c, i) => (i === index ? { ...c, text: trimmed, manual: true } : c));
    persistCustomSegments(segs);
    pushLiveEdit(next);
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
      showError(e);
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
      ("trackIndex" in hostRef && !isAfterEffects());
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
        durationSeconds: metaRef.current.durationSeconds,
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
  };

  useEffect(() => {
    // Keep last transcription in memory (Back stays cheap) but always open on
    // landing. Editor is only via Transcribe or Load — not a leftover session.
    const storedData = panelStore.getItem(STORAGE_KEY);
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData) as TranscribeResult;
        if (parsed?.chunk || parsed?.words) {
          setData(parsed);
          skipSessionSaveRef.current = true;
        }
      } catch {
        // ignore corrupt
      }
    }
    const storedCustom = panelStore.getItem(CUSTOM_SEGMENTS_KEY);
    if (storedCustom) {
      try {
        const parsed = JSON.parse(storedCustom) as CaptionsChunk[];
        if (Array.isArray(parsed)) {
          setCustomSegments(parsed);
        }
      } catch {
        // ignore
      }
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <ProgressDialog
        progress={progress}
        onCancel={handleCancelDescribe}
        title="Generating captions"
        steps={CAPTIONS_PROGRESS_STEPS}
      />
      <ProgressDialog
        progress={loadProgress}
        title="Loading captions"
        steps={LOAD_CAPTIONS_PROGRESS_STEPS}
      />
      <CaptionsTab
        captions={captions}
        meta={meta}
        progress={progress}
        loadingCaptions={!!loadProgress}
        sentenceCount={data?.chunk.chunks?.length ?? 0}
        fontSize={fontSize}
        highlightIndex={highlightIndex}
        screen={screen}
        onLoad={handleLoad}
        onDescribe={handleDescribe}
        transcribeLabel={withGenerationCostLabel("Transcribe", generationCost)}
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
