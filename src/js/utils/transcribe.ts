import { API_BASE } from "../api";
import { fs } from "../lib/cep/node";
import { CaptionApiError } from "../styles/api";

// заменяет path.basename(): node "path" тянет за собой process/Buffer, которых нет
// в браузерном dev-preview (панель обычно работает только внутри CEP с --enable-nodejs)
const basename = (filePath: string) => filePath.split(/[\\/]/).pop() || filePath;

export type CaptionsChunk = {
    text: string;
    timestamp: [number, number];
    /**
     * Сегмент правился вручную — читаем его as is: ни границы, ни переносы строк
     * не пересчитываются правилами lines / characters.
     */
    manual?: boolean;
};

export type WhisperTranscription = {
    text?: string;
    chunks?: CaptionsChunk[];
    speakers?: unknown[];
};

/** Токен ElevenLabs Scribe v2 — как в POST /api/generations/captions. */
export type ScribeWord = {
    text: string;
    start?: number | null;
    end?: number | null;
    type?: string;
    speaker_id?: string | null;
};

export type ScribeResponse = {
    text?: string;
    words?: ScribeWord[];
    translated?: boolean;
    language_code?: string;
    language_probability?: number;
    duration_seconds?: number | null;
    durationSeconds?: number;
    chaptersReceipt?: string;
    cost?: number;
};

export type TranscribeResult = {
    words: WhisperTranscription;  // пословно
    chunk: WhisperTranscription;  // по предложениям
    /** true — текст уже переведён; chunk.chunks не пересобираем из words */
    translated?: boolean;
    /** Signed server receipt — pass to chapters "all" for free follow-up */
    chaptersReceipt?: string;
    cost?: number;
    durationSeconds?: number;
    /** Detected or requested ISO language from Scribe / captions API */
    languageCode?: string;
    /** Ответ Scribe as-is — CEP пакует в System captions_batch_01..15 */
    raw?: ScribeResponse;
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
    manual?: boolean;                // текст правился вручную — отображается as is (см. CaptionsChunk.manual)
};

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

// "auto" / "off" — значения по умолчанию, бэкенду не передаются (см. README → Backend)
export type TranscribeOptions = {
    language?: string;    // исходный язык аудио, ISO-код ("en"/"ru"/"es") или "auto"
    translateTo?: string; // целевой язык перевода текста, ISO-код или "off"
    signal?: AbortSignal; // отмена из панели (кнопка Cancel)
    /** In/Out / Work Area duration — billing: ceil(minutes/10) */
    durationSeconds?: number;
    /** id / email — проверка доступа на сервере при Transcribe */
    userId?: string;
    email?: string;
    /** Bearer-токен Motionflow CEP (device login) — основной способ auth */
    token?: string;
};

/** Copy Node Buffer / Uint8Array into a standalone Blob — CEP CEF can send an empty body if given a shared Buffer view. */
const audioFileBlob = (audioPath: string): Blob => {
    const buffer = fs.readFileSync(audioPath);
    const copy = Uint8Array.from(buffer);
    return new Blob([copy], { type: "audio/mpeg" });
};

type MultipartResult = { status: number; text: string };

/**
 * CEP CEF often drops multipart Content-Type when `fetch` is given a headers object.
 * XHR + FormData sets the boundary itself and is the reliable path in the panel.
 */
const postMultipart = (
    url: string,
    form: FormData,
    token: string | undefined,
    signal: AbortSignal,
): Promise<MultipartResult> =>
    new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.timeout = REQUEST_TIMEOUT_MS;
        xhr.responseType = "text";

        const onAbort = () => xhr.abort();
        if (signal.aborted) {
            reject(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
            return;
        }
        signal.addEventListener("abort", onAbort, { once: true });

        xhr.onload = () => {
            signal.removeEventListener("abort", onAbort);
            resolve({ status: xhr.status, text: xhr.responseText || "" });
        };
        xhr.onerror = () => {
            signal.removeEventListener("abort", onAbort);
            reject(new TypeError("Failed to fetch"));
        };
        xhr.ontimeout = () => {
            signal.removeEventListener("abort", onAbort);
            reject(Object.assign(new Error("timeout"), { name: "AbortError" }));
        };
        xhr.onabort = () => {
            signal.removeEventListener("abort", onAbort);
            reject(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
        };
        xhr.send(form);
    });

export const transcribe = async (audioPath: string, options: TranscribeOptions = {}): Promise<TranscribeResult> => {
    const form = new FormData();
    form.append("file", audioFileBlob(audioPath), basename(audioPath));
    if (options.language && options.language !== "auto") form.append("language", options.language);
    if (options.translateTo && options.translateTo !== "off") form.append("translateTo", options.translateTo);
    if (typeof options.durationSeconds === "number" && options.durationSeconds > 0) {
        form.append("durationSeconds", String(options.durationSeconds));
    }
    if (options.userId) form.append("userId", options.userId);
    if (options.email) form.append("email", options.email);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    let result: MultipartResult;
    try {
        result = await postMultipart(
            `${API_BASE}/api/generations/captions`,
            form,
            options.token,
            controller.signal,
        );
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

    if (result.status === 401) {
        throw new CaptionApiError("Unauthorized", 401, "UNAUTHORIZED");
    }

    let data: { error?: string; code?: string };
    try {
        data = JSON.parse(result.text) as { error?: string; code?: string };
    } catch {
        throw new Error(`HTTP ${result.status}`);
    }

    if (result.status < 200 || result.status >= 300) {
        if (data.code === "SUBSCRIPTION_REQUIRED") {
            throw new CaptionApiError(data.error || "Subscription required", result.status, data.code);
        }
        if (data.code === "GENERATION_LIMIT_REACHED") {
            throw new CaptionApiError(
                data.error || "No generations left",
                result.status,
                data.code,
            );
        }
        throw new Error(data.error ?? `HTTP ${result.status}`);
    }

    return parseCaptionsApiResponse(data);
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

/** BE отдаёт Scribe `words[]`, не Whisper `{ words.chunks, chunk.chunks }`. */
export const isScribePayload = (data: unknown): data is ScribeResponse =>
    !!data && typeof data === "object" && Array.isArray((data as ScribeResponse).words);

export const scribeToTranscription = (raw: ScribeResponse): TranscribeResult => {
    const wordChunks: CaptionsChunk[] = [];
    for (const w of raw.words ?? []) {
        if (w.type && w.type !== "word") continue;
        const text = typeof w.text === "string" ? w.text.trim() : "";
        if (!text) continue;
        const start = Number(w.start);
        const end = Number(w.end);
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
        wordChunks.push({ text, timestamp: [start, end] });
    }
    const sentences = sentencesFromWords(wordChunks);
    const fullText = raw.text ?? wordChunks.map((w) => w.text).join(" ");
    return {
        words: { chunks: wordChunks, text: fullText },
        chunk: { chunks: sentences.length ? sentences : wordChunks, text: fullText },
        translated: !!raw.translated,
        chaptersReceipt: raw.chaptersReceipt,
        cost: raw.cost,
        durationSeconds: raw.durationSeconds ?? raw.duration_seconds ?? undefined,
        languageCode: raw.language_code,
        raw,
    };
};

export const parseCaptionsApiResponse = (data: unknown): TranscribeResult => {
    if (isScribePayload(data)) return scribeToTranscription(data);
    const t = data as TranscribeResult;
    if (t?.words?.chunks || t?.chunk?.chunks) {
        const languageCode =
            t.languageCode ??
            (typeof (data as ScribeResponse).language_code === "string"
                ? (data as ScribeResponse).language_code
                : undefined);
        return languageCode ? { ...t, languageCode } : t;
    }
    return { words: { chunks: [] }, chunk: { chunks: [] } };
};

export const transcriptionLanguageCode = (
    t: TranscribeResult | null | undefined,
): string | undefined => t?.languageCode || t?.raw?.language_code || undefined;

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
    if (isScribePayload(t)) t = scribeToTranscription(t);
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
    const bumpRawWords = (raw?: ScribeResponse): ScribeResponse | undefined => {
        if (!raw?.words?.length) return raw;
        let bumped = false;
        const words = raw.words.map((w) => {
            if (bumped || w.type === "spacing") return w;
            if (typeof w.start !== "number") return w;
            bumped = true;
            const start = Math.max(w.start, speechStart);
            const end = typeof w.end === "number" ? Math.max(w.end, start + 0.05) : w.end;
            if (start === w.start && end === w.end) return w;
            return { ...w, start, end };
        });
        return { ...raw, words };
    };
    return {
        ...t,
        words: { ...t.words, chunks: bump(t.words?.chunks) },
        chunk: { ...t.chunk, chunks: bump(t.chunk?.chunks) },
        raw: bumpRawWords(t.raw),
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

// текст сегмента как строки слов: раскладку по строкам правки сохраняют as is,
// пересчитывать её по characters мы больше не будем (см. grouping)
const toWordLines = (text: string): string[][] =>
    text
        .split("\n")
        .map((line) => line.trim().split(/\s+/).filter(Boolean))
        .filter((line) => line.length);

const fromWordLines = (lines: string[][]): string =>
    lines.map((line) => line.join(" ")).join("\n");

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

    const wordLines = toWordLines(chunks[index].text);
    const tokens = wordLines.flat();
    if (!tokens.length) return null;

    const movedWord = words?.length
        ? dir === "prev"
            ? words[0]
            : words[words.length - 1]
        : null;
    const wordText = movedWord?.text ?? (dir === "prev" ? tokens[0] : tokens[tokens.length - 1]);
    // слово уходит из своей строки; опустевшая строка исчезает, остальные остаются как были
    const restLines = wordLines.map((line) => [...line]);
    if (dir === "prev") restLines[0].shift();
    else restLines[restLines.length - 1].pop();
    const restWordLines = restLines.filter((line) => line.length);
    const restTokens = restWordLines.flat();

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
    // слово дописываем в крайнюю строку соседа — новую строку не создаём, иначе
    // перенос слова менял бы число строк сегмента
    const neighborLines = toWordLines(out[neighbor].text);
    if (dir === "prev") {
        if (neighborLines.length) neighborLines[neighborLines.length - 1].push(wordText);
        else neighborLines.push([wordText]);
        out[neighbor] = {
            ...out[neighbor],
            text: fromWordLines(neighborLines),
            timestamp: [out[neighbor].timestamp[0], wordTs[1]],
        };
    } else {
        if (neighborLines.length) neighborLines[0].unshift(wordText);
        else neighborLines.push([wordText]);
        out[neighbor] = {
            ...out[neighbor],
            text: fromWordLines(neighborLines),
            timestamp: [wordTs[0], out[neighbor].timestamp[1]],
        };
    }

    if (restTokens.length && restTs) {
        out[index] = { ...out[index], text: fromWordLines(restWordLines), timestamp: restTs };
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

// ───────────────── правка текста сегмента: пересборка слов ─────────────────

// для сопоставления слов нас интересуют только буквы/цифры: "example," и
// "Example" — то же слово, у которого нужно сохранить исходный тайминг
const wordKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// LCS: какие токены нового текста — те же слова, что были (tokenIndex -> origIndex).
// Всё остальное считаем дописанным/удалённым.
const matchTokensToWords = (orig: string[], tokens: string[]): Map<number, number> => {
    const a = orig.map(wordKey);
    const b = tokens.map(wordKey);
    const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    const pairs = new Map<number, number>();
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            pairs.set(j, i);
            i++;
            j++;
        } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
            i++;
        } else {
            j++;
        }
    }
    return pairs;
};

// текст переписан целиком (ни одного прежнего слова) — делим весь диапазон
// пропорционально длине слов, других ориентиров нет
const spreadByCharLength = (
    orig: CaptionsChunk[],
    tokens: string[],
): CaptionsChunk[] => {
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

/**
 * Пересобрать слова сегмента из отредактированного текста.
 *
 * Слова, которые пользователь не тронул, сохраняют свои таймкоды 1:1. Дописанные
 * слова забирают время у того слова, к которому их дописали: его диапазон делится
 * поровну между ним и новыми словами (`example` 1.511–2.075 + `hello world` →
 * example 1.511–1.699, hello 1.699–1.887, world 1.887–2.075). Время удалённых слов
 * достаётся предыдущему слову, так что границы сегмента не двигаются.
 */
export const rebuildWords = (orig: CaptionsChunk[], text: string): CaptionsChunk[] => {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length || !orig.length) return [];
    if (tokens.length === orig.length) {
        return orig.map((w, i) => ({ text: tokens[i], timestamp: w.timestamp }));
    }

    const pairs = matchTokensToWords(orig.map((w) => w.text), tokens);
    if (!pairs.size) return spreadByCharLength(orig, tokens);

    // каждый токен приписываем «владельцу» — исходному слову, чей тайминг он делит:
    // совпавший токен владеет собой, дописанный прилипает к последнему совпавшему
    // (а токены до первого совпадения — к нему же, они стоят перед ним в строке)
    const owned: number[][] = orig.map(() => []);
    const firstOwner = pairs.get([...pairs.keys()][0])!;
    let owner = firstOwner;
    for (let j = 0; j < tokens.length; j++) {
        const matched = pairs.get(j);
        if (matched != null) owner = matched;
        owned[owner].push(j);
    }

    const out: CaptionsChunk[] = [];
    // время удалённых слов: достаётся предыдущему слову (тянем его конец вперёд),
    // а если удалили начало сегмента — первому оставшемуся, чтобы не сдвинуть границу
    let freed: [number, number] | null = null;
    const stretchLast = (end: number) => {
        const tail = out[out.length - 1];
        out[out.length - 1] = { ...tail, timestamp: [tail.timestamp[0], end] };
    };
    for (let i = 0; i < orig.length; i++) {
        const [wordStart, wordEnd] = orig[i].timestamp;
        if (!owned[i].length) {
            freed = [freed ? freed[0] : wordStart, wordEnd];
            continue;
        }
        let start = wordStart;
        if (freed) {
            if (out.length) stretchLast(freed[1]);
            else start = freed[0];
            freed = null;
        }
        const step = Math.max(0, wordEnd - start) / owned[i].length;
        owned[i].forEach((tokenIndex, k) => {
            const from = start + step * k;
            out.push({
                text: tokens[tokenIndex],
                timestamp: [from, k === owned[i].length - 1 ? wordEnd : from + step],
            });
        });
    }
    if (freed && out.length) stretchLast(orig[orig.length - 1].timestamp[1]);
    return out;
};

// собрать Caption[] из готовых сегментов (override / ручная правка границ).
// слова привязываются последовательно по таймкоду конца сегмента — как в старой
// sentence-ветке grouping.
// Раскладка сегментов (границы и переносы строк) приходит готовой и здесь не
// пересчитывается: правила lines / characters работают только при первичной
// раскладке (packByLinesAndChars) и по кнопке Update.
const captionsFromChunks = (
    segments: CaptionsChunk[],
    wordChunks: CaptionsChunk[],
    editTarget: "sentence" | "words",
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

        // сегмент правился вручную — берём его текст as is: ни авто-перенос по
        // characters, ни правило lines к нему не применяются
        if (c.manual) {
            const manualLines = c.text.split("\n").map((l) => l.trim()).filter(Boolean);
            const lines = manualLines.length ? manualLines : [c.text.trim()];
            const counts = lines.map((line) => line.split(/\s+/).filter(Boolean).length);
            const totalCount = counts.reduce((sum, n) => sum + n, 0);
            return {
                lines,
                text: lines.join("\n"),
                timestamp: c.timestamp,
                edit,
                words,
                lineWordCounts: lines.length > 1 && totalCount === words.length ? counts : undefined,
                manual: true,
            };
        }

        // многострочный сегмент: переносы уже расставлены — первичной раскладкой
        // или пользователем в textarea. Проверяем, что число слов по строкам
        // совпадает с реально привязанными словами сегмента — иначе (текст правился
        // отдельно от слов) не доверяем и рисуем одной строкой.
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

// как captions.jsx Pause Gap (Bridge/Global). Пауза между словами режет caption,
// даже если строка ещё не заполнена — иначе UI и mogrt группируют по-разному.
const DEFAULT_PAUSE_GAP = 0.35;

// пакует слова в captions: до `lines` строк, до `characters` символов в строке
const packByLinesAndChars = (
    words: LWord[],
    lines: number,
    characters: number,
    pauseGap: number = DEFAULT_PAUSE_GAP,
): LWord[][][] => {
    const L = Math.max(1, lines);
    const C = Math.max(1, characters);
    const gap = pauseGap > 0 ? pauseGap : 0;
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

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const nextLen = curLine.length === 0 ? word.text.length : lineCharLen(curLine) + 1 + word.text.length;
        if (curLine.length === 0 || nextLen <= C) {
            curLine.push(word);
        } else if (capLines.length + 1 < L) {
            // текущая строка полна — перенос слова
            flushLine();
            curLine.push(word);
        } else {
            // последняя строка caption полна — новый caption
            flushCaption();
            curLine.push(word);
        }
        // captions.jsx collectCustom: if (w.pauseAfter) flush()
        if (gap > 0 && i + 1 < words.length) {
            const untilNext = words[i + 1].timestamp[0] - word.timestamp[1];
            if (untilNext >= gap) flushCaption();
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
    const sentenceChunks = transcription.chunk?.chunks ?? [];
    const wordChunks = transcription.words?.chunks ?? [];

    // sentence: один caption = один chunk предложения (как от API).
    // привязываем слова к предложению (две точки по времени) для ПКМ split/merge.
    if (config.mode === "sentence") {
        return captionsFromChunks(sentenceChunks, wordChunks, "sentence");
    }

    // captions уже созданы: рисуем ровно то, что сохранено. Правила lines / characters
    // применяются только при первичной раскладке и по кнопке Update (она сбрасывает
    // customSegments) — правка сегментов их больше не пересобирает, меняются только
    // тайминги слов внутри сегментов.
    if (options.customSegments?.length) {
        return captionsFromChunks(options.customSegments, wordChunks, "words");
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

// снимок текущих captions как CaptionsChunk[] — для ленивой инициализации customSegments.
// Переносы строк сохраняем: снимок и есть готовая раскладка, пересчитывать её по
// characters мы больше не будем (см. grouping)
export const captionsToChunks = (captions: Caption[]): CaptionsChunk[] =>
    captions.map((c) => ({
        text: c.lines.length > 1 ? c.lines.join("\n") : c.text.trim(),
        timestamp: c.timestamp,
        ...(c.manual ? { manual: true as const } : {}),
    }));

// usage:
// const result = await transcribe("/path/to/audio.mp3");
// console.log(result.words.chunks);  // word-level timestamps
// console.log(result.chunk.chunks);  // chunk-level timestamps
