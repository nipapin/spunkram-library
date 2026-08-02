import { API_BASE } from "../api";
import { fs } from "../lib/cep/node";
import { CaptionApiError } from "../styles/api";

// заменяет path.basename(): node "path" тянет за собой process/Buffer, которых нет
// в браузерном dev-preview (панель обычно работает только внутри CEP с --enable-nodejs)
const basename = (filePath: string) => filePath.split(/[\\/]/).pop() || filePath;

export type CaptionsChunk = {
    text: string;
    timestamp: [number, number];
};

export type WhisperTranscription = {
    text?: string;
    chunks?: CaptionsChunk[];
    speakers?: unknown[];
};

export type TranscribeResult = {
    words: WhisperTranscription;  // пословно
    chunk: WhisperTranscription;  // по предложениям
    /** true — текст уже переведён; chunk.chunks не пересобираем из words */
    translated?: boolean;
};

export type GroupingMode = "sentence" | "words" | "custom";

// вариант разбивки, который сейчас реально применён к хосту (создан/обновлён
// по кнопке Update) — сравнивается с текущими mode/lines/characters, чтобы
// решить, нужна ли кнопка Update: при совпадении она бессмысленна
export type AppliedSegmentConfig = { mode: GroupingMode; lines: number; characters: number };

export type GroupingConfig = {
    mode: GroupingMode;
    lines: number;       // numLines — максимум строк в одном caption
    characters: number;  // charactersPerLine — максимум символов в строке
};

// откуда caption берёт данные и куда писать правку текста
export type CaptionEdit =
    | { target: "sentence"; index: number }     // chunk.chunks[index]
    | { target: "words"; indices: number[] };   // words.chunks[indices] (непрерывный диапазон)

// слово предложения с таймкодом — для ПКМ split (нужна точка реза по времени)
export type CaptionWord = { text: string; gi: number; timestamp: [number, number] };

export type Caption = {
    lines: string[];                 // строки для отображения
    text: string;                    // строки через \n — значение поля правки
    timestamp: [number, number];
    edit: CaptionEdit;
    words?: CaptionWord[];           // слова предложения (sentence-режим) для split/merge
    lineWordCounts?: number[];       // custom-режим: сколько слов из words[] приходится на каждую строку lines[]
};

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

// "auto" / "off" — значения по умолчанию, бэкенду не передаются (см. README → Backend)
export type TranscribeOptions = {
    language?: string;    // исходный язык аудио, ISO-код ("en"/"ru"/"es") или "auto"
    translateTo?: string; // целевой язык перевода текста, ISO-код или "off"
    signal?: AbortSignal; // отмена из панели (кнопка Cancel)
    /** id / email — проверка доступа на сервере при Transcribe */
    userId?: string;
    email?: string;
    /** dev-admin секрет на проде (см. api/user.ts) */
    devToken?: string;
    /** Bearer-токен Motionflow CEP (device login) — основной способ auth */
    token?: string;
};

export const transcribe = async (audioPath: string, options: TranscribeOptions = {}): Promise<TranscribeResult> => {
    const buffer = fs.readFileSync(audioPath);

    const form = new FormData();
    form.append(
        "file",
        new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" }),
        basename(audioPath),
    );
    if (options.language && options.language !== "auto") form.append("language", options.language);
    if (options.translateTo && options.translateTo !== "off") form.append("translateTo", options.translateTo);
    if (options.userId) form.append("userId", options.userId);
    if (options.email) form.append("email", options.email);
    if (options.devToken) form.append("devToken", options.devToken);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort("cancelled");
    if (options.signal) {
        if (options.signal.aborted) controller.abort("cancelled");
        else options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    let response: Response;
    try {
        response = await fetch(`${API_BASE}/api/generations/captions`, {
            method: "POST",
            headers: options.token
                ? { Authorization: `Bearer ${options.token}` }
                : undefined,
            body: form,
            credentials: "include",
            signal: controller.signal,
        });
    } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
            if (options.signal?.aborted) throw new Error("Cancelled");
            throw new Error("Transcription request timed out");
        }
        throw e;
    } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onExternalAbort);
    }

    if (options.signal?.aborted) throw new Error("Cancelled");

    if (response.status === 401) {
        throw new CaptionApiError("Unauthorized", 401, "UNAUTHORIZED");
    }

    let data: { error?: string; code?: string } & Partial<TranscribeResult>;
    try {
        data = await response.json();
    } catch {
        throw new Error(`HTTP ${response.status}`);
    }

    if (!response.ok) {
        if (data.code === "SUBSCRIPTION_REQUIRED") {
            throw new CaptionApiError(data.error || "Subscription required", response.status, data.code);
        }
        if (data.code === "GENERATION_LIMIT_REACHED") {
            throw new CaptionApiError(
                data.error || "No generations left",
                response.status,
                data.code,
            );
        }
        throw new Error(data.error ?? `HTTP ${response.status}`);
    }

    return data as TranscribeResult;
};

// конец предложения: .!?… с возможными закрывающими кавычками/скобками
const SENTENCE_END = /[.!?…]["'»”’)\]]*$/;

// Собираем предложения из СЛОВ: слово, оканчивающееся на .!?…, закрывает предложение.
// Слова уже несут пунктуацию ("Pro.", "everything."), поэтому границы и тайминги
// получаются точными — независимо от того, как ИИ нарезал chunk.chunks.
export const sentencesFromWords = (words: CaptionsChunk[]): CaptionsChunk[] => {
    const out: CaptionsChunk[] = [];
    let cur: CaptionsChunk[] = [];
    const flush = () => {
        if (!cur.length) return;
        out.push({
            text: cur.map((w) => w.text.trim()).join(' '),
            timestamp: [cur[0].timestamp[0], cur[cur.length - 1].timestamp[1]],
        });
        cur = [];
    };
    for (const w of words) {
        cur.push(w);
        if (SENTENCE_END.test(w.text.trim())) flush();
    }
    flush(); // хвост без финальной пунктуации
    return out;
};

const MIN_WORD_SPAN = 0.02;

/**
 * Синтезирует пословные chunks из сегментов: разбивает текст по пробелам и
 * распределяет [start, end] пропорционально длине слова. Нужно когда бэкенд
 * после translate отдаёт chunk.chunks без words.chunks — иначе grouping в
 * режимах custom/words возвращает [].
 */
export const wordsFromChunks = (chunks: CaptionsChunk[]): CaptionsChunk[] => {
    const out: CaptionsChunk[] = [];
    for (const c of chunks) {
        const tokens = c.text.trim().split(/\s+/).filter(Boolean);
        if (!tokens.length) continue;
        const start = Number(c.timestamp[0]) || 0;
        let end = Number(c.timestamp[1]) || 0;
        const minEnd = start + Math.max(MIN_WORD_SPAN * tokens.length, 0.05);
        if (!(end > start) || end < minEnd) end = minEnd;
        const span = end - start;
        const totalChars = tokens.reduce((sum, t) => sum + t.length, 0) || tokens.length;
        let cursor = start;
        for (let i = 0; i < tokens.length; i++) {
            const text = tokens[i];
            const share = text.length / totalChars;
            const wordEnd = i === tokens.length - 1 ? end : cursor + span * share;
            out.push({
                text,
                timestamp: [cursor, Math.max(wordEnd, cursor + MIN_WORD_SPAN)] as [number, number],
            });
            cursor = Math.max(wordEnd, cursor + MIN_WORD_SPAN);
        }
        // гарантируем, что хвост сегмента закрыт точно в end
        out[out.length - 1] = {
            ...out[out.length - 1],
            timestamp: [Math.min(out[out.length - 1].timestamp[0], end - MIN_WORD_SPAN), end],
        };
    }
    return out;
};

// нормализуем ответ API: пересобираем предложения (chunk.chunks) из слов.
// Это чинит кривую нарезку ИИ (разорванные/слепленные предложения).
// Если words пусты (translate-путь на старом бэкенде), синтезируем слова из chunk.
// При translated=true chunk уже переведён 1:1 — не пересобираем (иначе без .!?
// всё сливается в один гигантский сегмент и Premiere падает на setValue).
export const normalize = (t: TranscribeResult): TranscribeResult => {
    const words = t.words?.chunks ?? [];
    const sentenceChunks = t.chunk?.chunks ?? [];

    if (!words.length) {
        if (!sentenceChunks.length) return t;
        const synthesized = wordsFromChunks(sentenceChunks);
        return {
            ...t,
            words: {
                ...(t.words ?? {}),
                text: t.words?.text ?? sentenceChunks.map((c) => c.text).join(" "),
                chunks: synthesized,
            },
            chunk: t.chunk ?? { chunks: sentenceChunks },
        };
    }

    if (t.translated && sentenceChunks.length) return t;

    return { ...t, chunk: { ...t.chunk, chunks: sentencesFromWords(words) } };
};

/**
 * Подрезает начало первого слова/сегмента под момент начала речи
 * (например после leading silence от ffmpeg silencedetect).
 * Не двигает таймкоды назад — только вперёд, если speechStart позже ASR.
 */
export const clampTranscriptionToSpeechStart = (
    t: TranscribeResult,
    speechStart: number,
): TranscribeResult => {
    if (!(speechStart > 0)) return t;
    const bump = (chunks: CaptionsChunk[] | undefined): CaptionsChunk[] | undefined => {
        if (!chunks?.length) return chunks;
        return chunks.map((c, i) => {
            if (i !== 0) return c;
            const start = Math.max(c.timestamp[0], speechStart);
            const end = Math.max(c.timestamp[1], start + 0.05);
            if (start === c.timestamp[0] && end === c.timestamp[1]) return c;
            return { ...c, timestamp: [start, end] as [number, number] };
        });
    };
    return {
        words: { ...t.words, chunks: bump(t.words.chunks) },
        chunk: { ...t.chunk, chunks: bump(t.chunk.chunks) },
    };
};

// seconds.ms -> "minutes:seconds:ms" (например 75.456 -> "01:15:456")
export const formatTimestamp = (seconds: number): string => {
    const total = Math.max(0, seconds);
    const mins = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    const ms = Math.round((total - Math.floor(total)) * 1000);
    const pad = (value: number, size: number) => String(value).padStart(size, "0");
    return `${pad(mins, 2)}:${pad(secs, 2)}:${pad(ms, 3)}`;
};

// перенос первого/последнего слова сегмента в соседний: prev = первое слово уходит
// в chunks[index-1], next = последнее — в chunks[index+1]; пустой сегмент удаляется.
// words — слова текущего сегмента (для точных таймингов); без них — пропорциональная оценка.
export const moveWordToAdjacent = (
    chunks: CaptionsChunk[],
    index: number,
    dir: "prev" | "next",
    words?: CaptionWord[],
): CaptionsChunk[] | null => {
    if (index < 0 || index >= chunks.length) return null;
    const neighbor = dir === "prev" ? index - 1 : index + 1;
    if (neighbor < 0 || neighbor >= chunks.length) return null;

    const tokens = chunks[index].text.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;

    const movedWord = words?.length
        ? dir === "prev"
            ? words[0]
            : words[words.length - 1]
        : null;
    const wordText = movedWord?.text ?? (dir === "prev" ? tokens[0] : tokens[tokens.length - 1]);
    const restTokens = dir === "prev" ? tokens.slice(1) : tokens.slice(0, -1);

    let wordTs: [number, number];
    let restTs: [number, number] | null;
    if (movedWord) {
        wordTs = movedWord.timestamp;
        restTs = restTokens.length
            ? dir === "prev"
                ? [wordTs[1], chunks[index].timestamp[1]]
                : [chunks[index].timestamp[0], wordTs[0]]
            : null;
    } else {
        const [segStart, segEnd] = chunks[index].timestamp;
        const span = Math.max(0, segEnd - segStart);
        const totalChars = tokens.reduce((sum, t) => sum + t.length, 0) || tokens.length;
        const wordDur = span * (wordText.length / totalChars);
        wordTs = dir === "prev" ? [segStart, segStart + wordDur] : [segEnd - wordDur, segEnd];
        restTs = restTokens.length
            ? dir === "prev"
                ? [wordTs[1], segEnd]
                : [segStart, wordTs[0]]
            : null;
    }

    const out = chunks.map((c) => ({ ...c, timestamp: [...c.timestamp] as [number, number] }));
    const neighborTokens = out[neighbor].text.trim().split(/\s+/).filter(Boolean);
    if (dir === "prev") {
        neighborTokens.push(wordText);
        out[neighbor] = {
            text: neighborTokens.join(" "),
            timestamp: [out[neighbor].timestamp[0], wordTs[1]],
        };
    } else {
        neighborTokens.unshift(wordText);
        out[neighbor] = {
            text: neighborTokens.join(" "),
            timestamp: [wordTs[0], out[neighbor].timestamp[1]],
        };
    }

    if (restTokens.length && restTs) {
        out[index] = { text: restTokens.join(" "), timestamp: restTs };
    } else {
        out.splice(index, 1);
    }
    return out;
};

// разбивает один сегмент на N однословных, сохраняя тайминги слов
export const splitIntoWords = (
    chunks: CaptionsChunk[],
    index: number,
    words: CaptionWord[],
): CaptionsChunk[] | null => {
    if (index < 0 || index >= chunks.length || words.length < 2) return null;
    const replacements: CaptionsChunk[] = words.map((w) => ({
        text: w.text,
        timestamp: w.timestamp,
    }));
    const out = [...chunks];
    out.splice(index, 1, ...replacements);
    return out;
};

// оборачивает уже готовый (границы не трогаем) список слов сегмента в строки по
// `characters` — только визуальный перенос, без правила `lines` (оно решает,
// сколько слов входит в caption, т.е. границы сегмента — это уже сделано раньше;
// пересчитывать его здесь значит конфликтовать с ручной правкой пользователя)
const wrapWordsToLines = (words: CaptionWord[], characters: number): CaptionWord[][] => {
    const C = Math.max(1, characters);
    const lines: CaptionWord[][] = [];
    let curLine: CaptionWord[] = [];
    let curLen = 0;
    for (const word of words) {
        const nextLen = curLine.length === 0 ? word.text.length : curLen + 1 + word.text.length;
        if (curLine.length === 0 || nextLen <= C) {
            curLine.push(word);
            curLen = nextLen;
        } else {
            lines.push(curLine);
            curLine = [word];
            curLen = word.text.length;
        }
    }
    if (curLine.length) lines.push(curLine);
    return lines;
};

// собрать Caption[] из готовых сегментов (override / ручная правка границ).
// слова привязываются последовательно по таймкоду конца сегмента — как в старой
// sentence-ветке grouping.
// wrapCharacters задан только для custom-режима: границы сегментов (сколько слов
// в caption) заданы извне и не пересчитываются — правило `lines` работает только
// при первичной раскладке (packByLinesAndChars); здесь пересобираем лишь переносы
// строк внутри каждого уже готового сегмента, чтобы правки (move/split/merge) не
// теряли многострочность и не конфликтовали с ручной разбивкой на captions.
const captionsFromChunks = (
    segments: CaptionsChunk[],
    wordChunks: CaptionsChunk[],
    editTarget: "sentence" | "words",
    wrapCharacters?: number,
): Caption[] => {
    let wi = 0;
    const last = segments.length - 1;
    return segments.map((c, index) => {
        const words: CaptionWord[] = [];
        while (wi < wordChunks.length && (index === last || wordChunks[wi].timestamp[0] < c.timestamp[1])) {
            words.push({
                text: wordChunks[wi].text.trim(),
                gi: wi,
                timestamp: wordChunks[wi].timestamp,
            });
            wi++;
        }
        const edit: CaptionEdit =
            editTarget === "sentence"
                ? { target: "sentence", index }
                : { target: "words", indices: words.map((w) => w.gi) };

        // явные переносы строк, которые пользователь расставил при редактировании
        // текста (textarea), — приоритет над авто-переносом по characters, иначе
        // правку стирал бы следующий пересчёт (см. wrapCharacters ниже).
        // Проверяем, что число слов по строкам совпадает с реально привязанными
        // словами сегмента — иначе (текст правился отдельно от слов) не доверяем.
        if (editTarget === "words") {
            const explicitLines = c.text.split("\n").map((l) => l.trim()).filter(Boolean);
            if (explicitLines.length > 1) {
                const lineWordCounts = explicitLines.map((line) => line.split(/\s+/).filter(Boolean).length);
                if (lineWordCounts.reduce((sum, n) => sum + n, 0) === words.length) {
                    return {
                        lines: explicitLines,
                        text: explicitLines.join("\n"),
                        timestamp: c.timestamp,
                        edit,
                        words,
                        lineWordCounts,
                    };
                }
            }
        }

        if (wrapCharacters != null && words.length > 1) {
            const wrapped = wrapWordsToLines(words, wrapCharacters);
            if (wrapped.length > 1) {
                const lines = wrapped.map((line) => line.map((w) => w.text).join(" "));
                return {
                    lines,
                    text: lines.join("\n"),
                    timestamp: c.timestamp,
                    edit,
                    words,
                    lineWordCounts: wrapped.map((line) => line.length),
                };
            }
        }

        const flatText = c.text.replace(/\n/g, " ").trim();
        return { lines: [flatText], text: flatText, timestamp: c.timestamp, edit, words };
    });
};

// ───────────────── custom-режим: жадная раскладка lines × characters ─────────────────
// слово не влезает в текущую строку → следующая строка;
// не влезает в последнюю строку caption → следующий caption.
// Одиночное слово длиннее C допускается целиком (иначе цикл).

type LWord = { text: string; timestamp: [number, number]; gi: number };

const lineCharLen = (words: LWord[]) =>
    words.length === 0 ? 0 : words.reduce((sum, w) => sum + w.text.length, 0) + (words.length - 1);

// пакует слова в captions: до `lines` строк, до `characters` символов в строке
const packByLinesAndChars = (words: LWord[], lines: number, characters: number): LWord[][][] => {
    const L = Math.max(1, lines);
    const C = Math.max(1, characters);
    const captions: LWord[][][] = [];
    let capLines: LWord[][] = [];
    let curLine: LWord[] = [];

    const flushLine = () => {
        if (!curLine.length) return;
        capLines.push(curLine);
        curLine = [];
    };
    const flushCaption = () => {
        flushLine();
        if (!capLines.length) return;
        captions.push(capLines);
        capLines = [];
    };

    for (const word of words) {
        const nextLen = curLine.length === 0 ? word.text.length : lineCharLen(curLine) + 1 + word.text.length;
        if (curLine.length === 0 || nextLen <= C) {
            curLine.push(word);
            continue;
        }
        // текущая строка полна — перенос слова
        if (capLines.length + 1 < L) {
            // есть ещё строка в этом caption
            flushLine();
            curLine.push(word);
        } else {
            // последняя строка caption полна — новый caption
            flushCaption();
            curLine.push(word);
        }
    }
    flushCaption();
    return captions;
};

export type GroupingOptions = {
    // ручная разбивка для words/custom: если задана — один chunk = один caption,
    // автоматический packing пропускается
    customSegments?: CaptionsChunk[] | null;
};

export const grouping = (
    transcription: TranscribeResult,
    config: GroupingConfig,
    options: GroupingOptions = {},
): Caption[] => {
    const sentenceChunks = transcription.chunk.chunks ?? [];
    const wordChunks = transcription.words.chunks ?? [];

    // sentence: один caption = один chunk предложения (как от API).
    // привязываем слова к предложению (две точки по времени) для ПКМ split/merge.
    if (config.mode === "sentence") {
        return captionsFromChunks(sentenceChunks, wordChunks, "sentence");
    }

    // words/custom с ручной разбивкой — рисуем ровно то, что сохранено; в custom
    // дополнительно пересобираем переносы строк по characters (см. captionsFromChunks)
    if (options.customSegments?.length) {
        const wrapCharacters = config.mode === "custom" ? config.characters : undefined;
        return captionsFromChunks(options.customSegments, wordChunks, "words", wrapCharacters);
    }

    // words: один caption = одно слово (как от API)
    if (config.mode === "words") {
        return wordChunks.map((w, index) => {
            const text = w.text.trim();
            const words: CaptionWord[] = [{ text, gi: index, timestamp: w.timestamp }];
            return { lines: [text], text, timestamp: w.timestamp, edit: { target: "words", indices: [index] }, words };
        });
    }

    // custom: весь поток слов → captions по правилам lines / characters
    const words: LWord[] = wordChunks.map((w, gi) => ({ text: w.text.trim(), timestamp: w.timestamp, gi }));
    if (!words.length) return [];

    return packByLinesAndChars(words, config.lines, config.characters).map((cap) => {
        const flat = cap.flat();
        const lines = cap.map((line) => line.map((w) => w.text).join(" "));
        const captionWords: CaptionWord[] = flat.map((w) => ({
            text: w.text,
            gi: w.gi,
            timestamp: w.timestamp,
        }));
        return {
            lines,
            text: lines.join("\n"),
            timestamp: [flat[0].timestamp[0], flat[flat.length - 1].timestamp[1]] as [number, number],
            edit: { target: "words" as const, indices: flat.map((w) => w.gi) },
            words: captionWords,
            lineWordCounts: cap.map((line) => line.length),
        };
    });
};

// снимок текущих captions как CaptionsChunk[] — для ленивой инициализации customSegments
export const captionsToChunks = (captions: Caption[]): CaptionsChunk[] =>
    captions.map((c) => ({ text: c.text.replace(/\n/g, " ").trim(), timestamp: c.timestamp }));

// usage:
// const result = await transcribe("/path/to/audio.mp3");
// console.log(result.words.chunks);  // word-level timestamps
// console.log(result.chunk.chunks);  // chunk-level timestamps
