import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, List, Loader2, Mic, Pause, Play, Timeline, Volume2, X, } from "lucide-react";
import { createPortal } from "react-dom";
import { storageKey, BRAND } from "@brands";
import { cn } from "@/lib/utils";
import { Motionflow } from "@/sdk";
import { runAeQueuedHostImport } from "@/utils/ae-queued-import";
import { fs } from "@/lib/cep/node";
import { downloadVoiceoverFile, fetchVoiceoverCatalog, generateVoiceover, preloadVoiceoverPreviews, resolveVoicePreviewUrl, subscribeVoicePreviews, } from "@/api/voiceover";
import { reportSupportError } from "@/api/support";
import { WaveformPlayer } from "@/components/waveform-player";
import * as panelStore from "@/lib/userdata-store";
import { usePanelUI } from "@/lib/panel-ui-context";
import { friendlyErrorMessage } from "@/utils/user-error";
import { textGenerationsCost, withGenerationCostLabel } from "../../../utils/generationCost";
import { rangeFillStyle } from "../../../utils/rangeFillStyle";
import { ScrubNumber } from "../../../components/ScrubNumber";
import { StyledSelect } from "../../../components/StyledSelect";
import "./VoiceoverApp.scss";
const HISTORY_STORAGE_KEY = storageKey("voiceoverHistory");
const HISTORY_MAX = 30;
const EMOTION_OPTIONS = [
    { id: "auto", name: "Auto" },
    { id: "neutral", name: "Neutral" },
    { id: "happy", name: "Happy" },
    { id: "calm", name: "Calm" },
    { id: "sad", name: "Sad" },
    { id: "angry", name: "Angry" },
    { id: "fearful", name: "Fearful" },
    { id: "disgusted", name: "Disgusted" },
    { id: "surprised", name: "Surprised" },
];
function loadHistory() {
    try {
        const raw = panelStore.getItem(HISTORY_STORAGE_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .filter((item) => {
            if (!item || typeof item !== "object")
                return false;
            const row = item;
            return (typeof row.id === "string" &&
                typeof row.createdAt === "number" &&
                typeof row.text === "string" &&
                typeof row.audioUrl === "string" &&
                row.audioUrl.length > 0);
        })
            .map((item) => ({
            ...item,
            speed: typeof item.speed === "number" ? item.speed : 1,
            volume: typeof item.volume === "number" ? item.volume : 1,
            pitch: typeof item.pitch === "number" ? item.pitch : 0,
            emotion: typeof item.emotion === "string" ? item.emotion : "auto",
        }))
            .slice(0, HISTORY_MAX);
    }
    catch {
        return [];
    }
}
function persistHistory(items) {
    try {
        panelStore.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
    }
    catch {
        // CEP / private mode may block storage
    }
}
function newHistoryId() {
    return `vo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function localFileExists(filePath) {
    if (!filePath)
        return false;
    try {
        if (typeof fs?.existsSync !== "function" || !fs.existsSync(filePath))
            return false;
        if (typeof fs?.statSync === "function" && fs.statSync(filePath).size < 64)
            return false;
        // Reject UTF-8-corrupted downloads from the old cepHttpRequest path.
        if (typeof fs?.openSync === "function" && typeof fs?.readSync === "function") {
            const fd = fs.openSync(filePath, "r");
            try {
                const buf = Buffer.alloc(12);
                fs.readSync(fd, buf, 0, 12, 0);
                const isRiff = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
                const isId3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
                const isMpeg = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
                if (!isRiff && !isId3 && !isMpeg)
                    return false;
            }
            finally {
                try {
                    fs.closeSync(fd);
                }
                catch {
                    /* ignore */
                }
            }
        }
        return true;
    }
    catch {
        return false;
    }
}
function playbackUrlFor(item) {
    if (item.audioUrl && /^https?:\/\//i.test(item.audioUrl))
        return item.audioUrl;
    if (localFileExists(item.localPath)) {
        return `file://${item.localPath.replace(/\\/g, "/")}`;
    }
    return item.audioUrl || null;
}
function emotionLabel(id) {
    return EMOTION_OPTIONS.find((e) => e.id === id)?.name ?? id;
}
function VoicePreview({ voice }) {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [, setPreviewTick] = useState(0);
    const previewUrl = resolveVoicePreviewUrl(voice);
    useEffect(() => subscribeVoicePreviews(() => setPreviewTick((n) => n + 1)), []);
    useEffect(() => {
        setPlaying(false);
        const el = audioRef.current;
        if (el) {
            el.pause();
            el.currentTime = 0;
        }
    }, [voice?.id, previewUrl]);
    useEffect(() => {
        return () => {
            audioRef.current?.pause();
        };
    }, []);
    async function toggle() {
        if (!previewUrl || !audioRef.current)
            return;
        const el = audioRef.current;
        if (playing) {
            el.pause();
            setPlaying(false);
            return;
        }
        try {
            await el.play();
            setPlaying(true);
        }
        catch {
            setPlaying(false);
        }
    }
    return (_jsxs("div", { className: "mt-1.5 flex items-center gap-2", children: [_jsx("button", { type: "button", disabled: !previewUrl, onClick: () => void toggle(), title: previewUrl ? "Play voice sample" : "Preview will be available via CDN", className: cn("flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors", previewUrl
                    ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
                    : "border-white/10 bg-secondary/40 text-muted-foreground opacity-60"), children: playing ? _jsx(Pause, { className: "size-3" }) : _jsx(Play, { className: "size-3" }) }), _jsx("div", { className: "min-w-0 flex-1", children: _jsxs("p", { className: "voiceover-app__preview-hint flex items-center gap-1 truncate", children: [_jsx(Volume2, { className: "size-3 shrink-0" }), previewUrl
                            ? `Preview · ${voice?.name || "voice"}`
                            : "Voice sample — CDN preview coming soon"] }) }), previewUrl ? (_jsx("audio", { ref: audioRef, src: previewUrl, preload: "auto", onEnded: () => setPlaying(false), onPause: () => setPlaying(false) })) : null] }));
}
function HistoryItemCard({ item, placing, onPlace, onLocalPath, }) {
    const playbackUrl = useMemo(() => playbackUrlFor(item), [item]);
    const busyHere = placing?.id === item.id;
    const snippet = item.text.length > 90 ? `${item.text.slice(0, 87).trimEnd()}…` : item.text;
    // Best-effort re-download if local file vanished but CDN URL remains.
    useEffect(() => {
        if (localFileExists(item.localPath) || !item.audioUrl)
            return;
        if (!/^https?:\/\//i.test(item.audioUrl))
            return;
        let cancelled = false;
        void downloadVoiceoverFile(item.audioUrl, item.fileName || `${BRAND.id}-voiceover.wav`).then((dl) => {
            if (!cancelled && dl.path)
                onLocalPath(item.id, dl.path);
        });
        return () => {
            cancelled = true;
        };
        // Intentionally omit onLocalPath — stable via useCallback in parent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id, item.audioUrl, item.fileName, item.localPath]);
    return (_jsxs("div", { className: "glass-card rounded-2xl p-3", children: [_jsx("p", { className: "mb-1 line-clamp-2 text-[11px] text-foreground/90", children: snippet }), _jsxs("p", { className: "mb-2 text-[10px] text-muted-foreground", children: [item.voiceName || "Voice", item.languageName ? ` · ${item.languageName}` : "", item.emotion && item.emotion !== "auto" ? ` · ${emotionLabel(item.emotion)}` : "", item.speed !== 1 ? ` · ${item.speed.toFixed(1)}x` : "", item.volume !== 1 ? ` · vol ${item.volume.toFixed(1)}` : "", item.pitch !== 0 ? ` · pitch ${item.pitch > 0 ? "+" : ""}${item.pitch}` : "", item.duration ? ` · ~${item.duration}s` : ""] }), _jsx("div", { className: "rounded-lg border border-white/10 bg-background/40 px-2 py-2", children: _jsx(WaveformPlayer, { audioUrl: playbackUrl, eagerLoad: true, loading: !playbackUrl, className: "gap-1.5", timeClassName: "w-8", trailingSlot: _jsxs("div", { className: "flex shrink-0 items-center gap-0.5", children: [_jsx("button", { type: "button", disabled: !!placing || !playbackUrl, title: "Add to timeline", "aria-label": "Add to timeline", onClick: () => onPlace(item, "timeline"), className: cn("flex size-7 items-center justify-center rounded-md transition-colors", busyHere && placing?.destination === "timeline"
                                    ? "bg-primary/20 text-primary"
                                    : "text-muted-foreground hover:bg-primary/15 hover:text-primary", "disabled:cursor-not-allowed disabled:opacity-40"), children: busyHere && placing?.destination === "timeline" ? (_jsx(Loader2, { className: "size-3.5 animate-spin" })) : (_jsx(Timeline, { className: "size-3.5" })) }), _jsx("button", { type: "button", disabled: !!placing || !playbackUrl, title: "Add to project", "aria-label": "Add to project", onClick: () => onPlace(item, "project"), className: cn("flex size-7 items-center justify-center rounded-md transition-colors", busyHere && placing?.destination === "project"
                                    ? "bg-primary/20 text-primary"
                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground", "disabled:cursor-not-allowed disabled:opacity-40"), children: busyHere && placing?.destination === "project" ? (_jsx(Loader2, { className: "size-3.5 animate-spin" })) : (_jsx(FolderPlus, { className: "size-3.5" })) })] }) }) })] }));
}
export const VoiceoverApp = ({ generationsLeft = 0, }) => {
    const [voices, setVoices] = useState([]);
    const [languages, setLanguages] = useState([]);
    const [voiceId, setVoiceId] = useState("");
    const [languageBoost, setLanguageBoost] = useState("Automatic");
    const [text, setText] = useState("");
    const [speed, setSpeed] = useState(1);
    const [volume, setVolume] = useState(1);
    const [pitch, setPitch] = useState(0);
    const [emotion, setEmotion] = useState("auto");
    const [busy, setBusy] = useState(false);
    const [placing, setPlacing] = useState(null);
    const [history, setHistory] = useState(loadHistory);
    const [historyOpen, setHistoryOpen] = useState(false);
    const { showStatus } = usePanelUI();
    const showError = (err) => {
        const msg = friendlyErrorMessage(err);
        if (!msg || msg === "Cancelled")
            return;
        showStatus(msg, "error", 7000);
    };
    useEffect(() => {
        persistHistory(history);
    }, [history]);
    useEffect(() => {
        if (!historyOpen)
            return;
        const onKey = (e) => {
            if (e.key === "Escape")
                setHistoryOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [historyOpen]);
    useEffect(() => {
        let cancelled = false;
        fetchVoiceoverCatalog().then((catalog) => {
            if (cancelled)
                return;
            setVoices(catalog.voices);
            setLanguages(catalog.languages);
            if (catalog.voices[0])
                setVoiceId(catalog.voices[0].id);
            if (catalog.languages.some((l) => l.id === "Automatic")) {
                setLanguageBoost("Automatic");
            }
            else if (catalog.languages[0]) {
                setLanguageBoost(catalog.languages[0].id);
            }
            void preloadVoiceoverPreviews();
        });
        return () => {
            cancelled = true;
        };
    }, []);
    const generationCost = textGenerationsCost(text.trim().length);
    const canGenerate = text.trim().length > 0 && !!voiceId && !busy && generationsLeft >= generationCost;
    const outOfCredits = generationsLeft < generationCost;
    const selectedVoice = useMemo(() => voices.find((v) => v.id === voiceId), [voices, voiceId]);
    const selectedLanguage = useMemo(() => languages.find((l) => l.id === languageBoost), [languages, languageBoost]);
    const updateLocalPath = useCallback((id, path) => {
        setHistory((prev) => prev.map((item) => (item.id === id ? { ...item, localPath: path } : item)));
    }, []);
    async function handleGenerate() {
        if (!canGenerate || generationsLeft < generationCost)
            return;
        setBusy(true);
        const script = text.trim();
        const res = await generateVoiceover({
            text: script,
            voice_id: voiceId,
            speed,
            volume,
            pitch,
            emotion,
            language_boost: languageBoost,
        });
        setBusy(false);
        if (!res.data) {
            const msg = res.error || "Generation failed";
            showError(msg);
            reportSupportError("voiceover.generate", msg);
            return;
        }
        const data = res.data;
        const item = {
            id: newHistoryId(),
            createdAt: Date.now(),
            text: script,
            voiceId,
            voiceName: selectedVoice?.name || voiceId,
            languageBoost,
            languageName: selectedLanguage?.name || languageBoost,
            speed,
            volume,
            pitch,
            emotion,
            audioUrl: data.audio_url,
            duration: data.duration,
            fileName: data.file_name,
            localPath: null,
        };
        setHistory((prev) => [item, ...prev].slice(0, HISTORY_MAX));
        const dl = await downloadVoiceoverFile(data.audio_url, data.file_name || `${BRAND.id}-voiceover.wav`);
        if (dl.path)
            updateLocalPath(item.id, dl.path);
        else if (dl.error) {
            showError(dl.error);
            reportSupportError("voiceover.download", dl.error);
        }
        window.dispatchEvent(new Event("aitools-credits-changed"));
    }
    async function place(item, destination) {
        setPlacing({ id: item.id, destination });
        try {
            let downloadFailed = false;
            const resolvePath = async (forceRedownload) => {
                if (!forceRedownload && localFileExists(item.localPath))
                    return item.localPath;
                if (!item.audioUrl)
                    return null;
                const dl = await downloadVoiceoverFile(item.audioUrl, item.fileName || `${BRAND.id}-voiceover.wav`);
                if (!dl.path) {
                    const msg = dl.error || "Could not download audio";
                    showError(msg);
                    reportSupportError("voiceover.download", msg);
                    downloadFailed = true;
                    return null;
                }
                updateLocalPath(item.id, dl.path);
                return dl.path;
            };
            let filePath = await resolvePath(false);
            if (!filePath) {
                if (!downloadFailed)
                    showError("Audio file unavailable");
                setPlacing(null);
                return;
            }
            const tryImport = async (importPath) => {
                const outcome = await runAeQueuedHostImport(importPath, destination, item.duration ?? 1, (p, dest, dur, resultPath) => Motionflow.importVoiceoverAudio(p, dest, dur, resultPath).then((r) => r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error }));
                if (outcome && typeof outcome === "object" && outcome.ok === true) {
                    return { ok: true, data: outcome };
                }
                if (outcome && typeof outcome === "object" && outcome.ok === false) {
                    return { ok: true, data: outcome };
                }
                return { ok: false, error: "Could not import audio" };
            };
            let wrapped = await tryImport(filePath);
            let outcome = wrapped.ok
                ? wrapped.data
                : null;
            const reason = !wrapped.ok
                ? wrapped.error
                : outcome && !outcome.ok
                    ? outcome.reason
                    : null;
            const needsRetry = !!reason &&
                (reason === "SOURCE_MISSING" || /could not open source file/i.test(reason));
            // Stale temp path / AE path quirk — re-download once to AppData and retry.
            if (needsRetry && item.audioUrl) {
                const fresh = await resolvePath(true);
                if (fresh && fresh !== filePath) {
                    filePath = fresh;
                    wrapped = await tryImport(filePath);
                    outcome = wrapped.ok
                        ? wrapped.data
                        : null;
                }
            }
            if (!wrapped.ok) {
                showError(wrapped.error || "Could not import audio");
                reportSupportError("voiceover.import", wrapped.error);
            }
            else if (!outcome?.ok) {
                const failReason = outcome?.reason;
                const msg = failReason === "NO_ACTIVE_SEQUENCE"
                    ? "Open a sequence in Premiere Pro, then try again."
                    : failReason === "NO_ACTIVE_COMP"
                        ? "Open a composition in After Effects, then try again."
                        : failReason === "SOURCE_MISSING"
                            ? "Audio file missing on disk — try generating again"
                            : failReason && /could not open source file/i.test(failReason)
                                ? "After Effects could not open the audio file. Try generating again."
                                : failReason || "Could not import audio";
                showError(msg);
                if (failReason !== "NO_ACTIVE_SEQUENCE" && failReason !== "NO_ACTIVE_COMP") {
                    reportSupportError("voiceover.import", msg, { reason: failReason || null });
                }
            }
        }
        catch (err) {
            showError(err instanceof Error ? err.message : "Import failed");
            reportSupportError("voiceover.import", err);
        }
        finally {
            setPlacing(null);
        }
    }
    return (_jsxs("div", { className: "voiceover-app", children: [_jsx("div", { className: "voiceover-app__body thin-scroll", children: _jsxs("div", { className: "card voiceover-app__card", children: [_jsxs("div", { className: "voiceover-app__card-head", children: [_jsxs("p", { className: "voiceover-app__card-title", children: [_jsx(Mic, { className: "size-3.5", style: { color: "var(--accent)" } }), "Voiceover"] }), history.length > 0 ? (_jsx("button", { type: "button", className: "icon-btn", onClick: () => setHistoryOpen(true), title: "View all generations", "aria-label": "View all generations", children: _jsx(List, { size: 14, strokeWidth: 2 }) })) : null] }), _jsx("label", { className: "voiceover-app__label", children: "Script" }), _jsx("textarea", { value: text, onChange: (e) => setText(e.target.value), rows: 5, placeholder: "Enter the narration text\u2026", className: "voiceover-app__script" }), _jsxs("div", { className: "voiceover-app__field", children: [_jsx("label", { className: "voiceover-app__label", children: "Language" }), _jsx(StyledSelect, { value: languageBoost, options: languages.map((l) => ({ value: l.id, label: l.name })), onChange: setLanguageBoost, placeholder: "Select language", ariaLabel: "Language" })] }), _jsxs("div", { className: "voiceover-app__voice-grid", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("label", { className: "voiceover-app__label", children: "Voice" }), _jsx(StyledSelect, { value: voiceId, options: voices.map((v) => ({ value: v.id, label: v.name })), onChange: setVoiceId, placeholder: "Select voice", ariaLabel: "Voice" }), _jsx(VoicePreview, { voice: selectedVoice })] }), _jsxs("div", { className: "min-w-0", children: [_jsx("label", { className: "voiceover-app__label", children: "Emotion" }), _jsx(StyledSelect, { value: emotion, options: EMOTION_OPTIONS.map((e) => ({ value: e.id, label: e.name })), onChange: setEmotion, placeholder: "Select emotion", ariaLabel: "Emotion" })] })] }), _jsxs("div", { className: "voiceover-app__sliders", children: [_jsxs("div", { className: "field-row voiceover-app__slider-row", children: [_jsx("span", { className: "field-row__label", children: "Speed" }), _jsx("input", { type: "range", className: "range", min: 0.5, max: 2, step: 0.1, value: speed, onChange: (e) => setSpeed(Number(e.target.value)), "aria-label": "Voiceover speed", style: rangeFillStyle(speed, 0.5, 2) }), _jsx(ScrubNumber, { value: speed, onChange: setSpeed, min: 0.5, max: 2, step: 0.1, suffix: "x" })] }), _jsxs("div", { className: "field-row voiceover-app__slider-row", children: [_jsx("span", { className: "field-row__label", children: "Volume" }), _jsx("input", { type: "range", className: "range", min: 0, max: 10, step: 0.1, value: volume, onChange: (e) => setVolume(Number(e.target.value)), "aria-label": "Voiceover volume", style: rangeFillStyle(volume, 0, 10) }), _jsx(ScrubNumber, { value: volume, onChange: setVolume, min: 0, max: 10, step: 0.1 })] }), _jsxs("div", { className: "field-row voiceover-app__slider-row", children: [_jsx("span", { className: "field-row__label", children: "Pitch" }), _jsx("input", { type: "range", className: "range", min: -12, max: 12, step: 1, value: pitch, onChange: (e) => setPitch(Number(e.target.value)), "aria-label": "Voiceover pitch", style: rangeFillStyle(pitch, -12, 12) }), _jsx(ScrubNumber, { value: pitch, onChange: setPitch, min: -12, max: 12, step: 1 })] })] })] }) }), _jsxs("div", { className: "voiceover-app__footer", children: [_jsxs("button", { type: "button", disabled: !canGenerate, onClick: () => void handleGenerate(), className: "btn btn--primary voiceover-app__generate", children: [busy ? _jsx("span", { className: "spinner" }) : null, outOfCredits ? "No generations left" : withGenerationCostLabel("Generate", generationCost)] }), outOfCredits ? (_jsx("p", { className: "voiceover-app__credits-hint", children: "Upgrade your plan or buy extra generations to continue." })) : null] }), historyOpen
                ? createPortal(_jsxs("div", { className: "ai-tools-scope voiceover-app__history-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Voiceover history", children: [_jsxs("div", { className: "voiceover-app__history-header", children: [_jsxs("div", { children: [_jsx("p", { className: "voiceover-app__history-title", children: "All generations" }), _jsxs("p", { className: "voiceover-app__history-count", children: [history.length, " saved"] })] }), _jsx("button", { type: "button", onClick: () => setHistoryOpen(false), "aria-label": "Close", className: "icon-btn voiceover-app__history-close", children: _jsx(X, { size: 14, strokeWidth: 2 }) })] }), _jsx("div", { className: "voiceover-app__history-body", children: history.map((item) => (_jsx(HistoryItemCard, { item: item, placing: placing, onPlace: (row, destination) => void place(row, destination), onLocalPath: updateLocalPath }, item.id))) })] }), document.body)
                : null] }));
};
