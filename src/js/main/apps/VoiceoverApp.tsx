import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FolderPlus,
  List,
  Loader2,
  Mic,
  Pause,
  Play,
  Timeline,
  Volume2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { MotionFlow } from "@/sdk";
import { fs } from "@/lib/cep/node";
import {
  downloadVoiceoverFile,
  fetchVoiceoverCatalog,
  generateVoiceover,
  type VoiceoverLanguage,
  type VoiceoverResult,
  type VoiceoverVoice,
} from "@/api/voiceover";
import { reportSupportError } from "@/api/support";
import { WaveformPlayer } from "@/components/waveform-player";
import * as panelStore from "@/lib/userdata-store";
import { usePanelUI } from "@/lib/panel-ui-context";
import { friendlyErrorMessage } from "@/utils/user-error";
import { textGenerationsCost, withGenerationCostLabel } from "../../utils/generationCost";
import { rangeFillStyle } from "../../utils/rangeFillStyle";
import { ScrubNumber } from "../../components/ScrubNumber";
import "./VoiceoverApp.scss";

const HISTORY_STORAGE_KEY = "spunkram.voiceoverHistory";
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
] as const;

type VoiceoverHistoryItem = {
  id: string;
  createdAt: number;
  text: string;
  voiceId: string;
  voiceName: string;
  languageBoost: string;
  languageName: string;
  speed: number;
  volume: number;
  pitch: number;
  emotion: string;
  audioUrl: string;
  duration?: number;
  fileName?: string;
  localPath?: string | null;
};

function loadHistory(): VoiceoverHistoryItem[] {
  try {
    const raw = panelStore.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is VoiceoverHistoryItem => {
        if (!item || typeof item !== "object") return false;
        const row = item as Partial<VoiceoverHistoryItem>;
        return (
          typeof row.id === "string" &&
          typeof row.createdAt === "number" &&
          typeof row.text === "string" &&
          typeof row.audioUrl === "string" &&
          row.audioUrl.length > 0
        );
      })
      .map((item) => ({
        ...item,
        speed: typeof item.speed === "number" ? item.speed : 1,
        volume: typeof item.volume === "number" ? item.volume : 1,
        pitch: typeof item.pitch === "number" ? item.pitch : 0,
        emotion: typeof item.emotion === "string" ? item.emotion : "auto",
      }))
      .slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function persistHistory(items: VoiceoverHistoryItem[]) {
  try {
    panelStore.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, HISTORY_MAX)));
  } catch {
    // CEP / private mode may block storage
  }
}

function newHistoryId(): string {
  return `vo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function localFileExists(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  try {
    if (typeof fs?.existsSync !== "function" || !fs.existsSync(filePath)) return false;
    if (typeof fs?.statSync === "function" && fs.statSync(filePath).size < 64) return false;
    // Reject UTF-8-corrupted downloads from the old cepHttpRequest path.
    if (typeof fs?.openSync === "function" && typeof fs?.readSync === "function") {
      const fd = fs.openSync(filePath, "r");
      try {
        const buf = Buffer.alloc(12);
        fs.readSync(fd, buf, 0, 12, 0);
        const isRiff =
          buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
        const isId3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
        const isMpeg = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
        if (!isRiff && !isId3 && !isMpeg) return false;
      } finally {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function playbackUrlFor(item: VoiceoverHistoryItem): string | null {
  if (item.audioUrl && /^https?:\/\//i.test(item.audioUrl)) return item.audioUrl;
  if (localFileExists(item.localPath)) {
    return `file://${item.localPath!.replace(/\\/g, "/")}`;
  }
  return item.audioUrl || null;
}

function emotionLabel(id: string): string {
  return EMOTION_OPTIONS.find((e) => e.id === id)?.name ?? id;
}

function DropdownSelect<T extends { id: string }>({
  items,
  value,
  onChange,
  labelFor,
  placeholder,
}: {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  labelFor: (item: T) => string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = items.find((v) => v.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-white/10 bg-background/50 px-2.5 py-2 text-left text-xs text-foreground transition-colors",
          "hover:border-primary/40",
          open && "border-primary/50",
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? labelFor(selected) : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-44 overflow-y-auto rounded-xl",
            "border border-white/10 bg-card/95 py-1 shadow-xl backdrop-blur-md",
            "ring-1 ring-inset ring-white/5",
          )}
        >
          {items.map((item) => {
            const active = item.id === value;
            return (
              <li key={item.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors",
                    active
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{labelFor(item)}</span>
                  {active ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                </button>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="px-2.5 py-2 text-[11px] text-muted-foreground">No options</li>
          )}
        </ul>
      )}
    </div>
  );
}

function VoicePreview({ voice }: { voice: VoiceoverVoice | undefined }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const previewUrl = voice?.preview_url?.trim() || "";

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
    if (!previewUrl || !audioRef.current) return;
    const el = audioRef.current;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <button
        type="button"
        disabled={!previewUrl}
        onClick={() => void toggle()}
        title={previewUrl ? "Play voice sample" : "Preview will be available via CDN"}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
          previewUrl
            ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
            : "border-white/10 bg-secondary/40 text-muted-foreground opacity-60",
        )}
      >
        {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="voiceover-app__preview-hint flex items-center gap-1 truncate">
          <Volume2 className="size-3 shrink-0" />
          {previewUrl
            ? `Preview · ${voice?.name || "voice"}`
            : "Voice sample — CDN preview coming soon"}
        </p>
      </div>
      {previewUrl ? (
        <audio
          ref={audioRef}
          src={previewUrl}
          preload="none"
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
        />
      ) : null}
    </div>
  );
}

function HistoryItemCard({
  item,
  placing,
  onPlace,
  onLocalPath,
}: {
  item: VoiceoverHistoryItem;
  placing: { id: string; destination: "project" | "timeline" } | null;
  onPlace: (item: VoiceoverHistoryItem, destination: "project" | "timeline") => void;
  onLocalPath: (id: string, path: string) => void;
}) {
  const playbackUrl = useMemo(() => playbackUrlFor(item), [item]);
  const busyHere = placing?.id === item.id;
  const snippet =
    item.text.length > 90 ? `${item.text.slice(0, 87).trimEnd()}…` : item.text;

  // Best-effort re-download if local file vanished but CDN URL remains.
  useEffect(() => {
    if (localFileExists(item.localPath) || !item.audioUrl) return;
    if (!/^https?:\/\//i.test(item.audioUrl)) return;
    let cancelled = false;
    void downloadVoiceoverFile(
      item.audioUrl,
      item.fileName || "spunkram-voiceover.wav",
    ).then((dl) => {
      if (!cancelled && dl.path) onLocalPath(item.id, dl.path);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally omit onLocalPath — stable via useCallback in parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.audioUrl, item.fileName, item.localPath]);

  return (
    <div className="glass-card rounded-2xl p-3">
      <p className="mb-1 line-clamp-2 text-[11px] text-foreground/90">{snippet}</p>
      <p className="mb-2 text-[10px] text-muted-foreground">
        {item.voiceName || "Voice"}
        {item.languageName ? ` · ${item.languageName}` : ""}
        {item.emotion && item.emotion !== "auto" ? ` · ${emotionLabel(item.emotion)}` : ""}
        {item.speed !== 1 ? ` · ${item.speed.toFixed(1)}x` : ""}
        {item.volume !== 1 ? ` · vol ${item.volume.toFixed(1)}` : ""}
        {item.pitch !== 0 ? ` · pitch ${item.pitch > 0 ? "+" : ""}${item.pitch}` : ""}
        {item.duration ? ` · ~${item.duration}s` : ""}
      </p>
      <div className="rounded-lg border border-white/10 bg-background/40 px-2 py-2">
        <WaveformPlayer
          audioUrl={playbackUrl}
          eagerLoad
          loading={!playbackUrl}
          className="gap-1.5"
          timeClassName="w-8"
          trailingSlot={
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                disabled={!!placing || !playbackUrl}
                title="Add to timeline"
                aria-label="Add to timeline"
                onClick={() => onPlace(item, "timeline")}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors",
                  busyHere && placing?.destination === "timeline"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-primary/15 hover:text-primary",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                {busyHere && placing?.destination === "timeline" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Timeline className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                disabled={!!placing || !playbackUrl}
                title="Add to project"
                aria-label="Add to project"
                onClick={() => onPlace(item, "project")}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors",
                  busyHere && placing?.destination === "project"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                {busyHere && placing?.destination === "project" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FolderPlus className="size-3.5" />
                )}
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}

export const VoiceoverApp = ({
  generationsLeft = 0,
}: {
  generationsLeft?: number;
}) => {
  const [voices, setVoices] = useState<VoiceoverVoice[]>([]);
  const [languages, setLanguages] = useState<VoiceoverLanguage[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [languageBoost, setLanguageBoost] = useState("Automatic");
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [emotion, setEmotion] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState<{
    id: string;
    destination: "project" | "timeline";
  } | null>(null);
  const [history, setHistory] = useState<VoiceoverHistoryItem[]>(loadHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { showStatus } = usePanelUI();

  const showError = (err: unknown) => {
    const msg = friendlyErrorMessage(err);
    if (!msg || msg === "Cancelled") return;
    showStatus(msg, "error", 7000);
  };

  useEffect(() => {
    persistHistory(history);
  }, [history]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  useEffect(() => {
    let cancelled = false;
    fetchVoiceoverCatalog().then((catalog) => {
      if (cancelled) return;
      setVoices(catalog.voices);
      setLanguages(catalog.languages);
      if (catalog.voices[0]) setVoiceId(catalog.voices[0].id);
      if (catalog.languages.some((l) => l.id === "Automatic")) {
        setLanguageBoost("Automatic");
      } else if (catalog.languages[0]) {
        setLanguageBoost(catalog.languages[0].id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const generationCost = textGenerationsCost(text.trim().length);
  const canGenerate =
    text.trim().length > 0 && !!voiceId && !busy && generationsLeft >= generationCost;
  const outOfCredits = generationsLeft < generationCost;
  const selectedVoice = useMemo(
    () => voices.find((v) => v.id === voiceId),
    [voices, voiceId],
  );
  const selectedLanguage = useMemo(
    () => languages.find((l) => l.id === languageBoost),
    [languages, languageBoost],
  );

  const updateLocalPath = useCallback((id: string, path: string) => {
    setHistory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, localPath: path } : item)),
    );
  }, []);

  async function handleGenerate() {
    if (!canGenerate || generationsLeft < generationCost) return;
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
    const data: VoiceoverResult = res.data;
    const item: VoiceoverHistoryItem = {
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

    const dl = await downloadVoiceoverFile(
      data.audio_url,
      data.file_name || "spunkram-voiceover.wav",
    );
    if (dl.path) updateLocalPath(item.id, dl.path);
    else if (dl.error) {
      showError(dl.error);
      reportSupportError("voiceover.download", dl.error);
    }
    window.dispatchEvent(new Event("aitools-credits-changed"));
  }

  async function place(
    item: VoiceoverHistoryItem,
    destination: "project" | "timeline",
  ) {
    setPlacing({ id: item.id, destination });
    try {
      let downloadFailed = false;
      const resolvePath = async (forceRedownload: boolean): Promise<string | null> => {
        if (!forceRedownload && localFileExists(item.localPath)) return item.localPath!;
        if (!item.audioUrl) return null;
        const dl = await downloadVoiceoverFile(
          item.audioUrl,
          item.fileName || "spunkram-voiceover.wav",
        );
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
        if (!downloadFailed) showError("Audio file unavailable");
        setPlacing(null);
        return;
      }

      const tryImport = async (path: string) =>
        MotionFlow.importVoiceoverAudio(path, destination, item.duration ?? 1);

      let wrapped = await tryImport(filePath);
      let outcome = wrapped.ok
        ? (wrapped.data as { ok?: boolean; reason?: string } | null)
        : null;
      const reason = !wrapped.ok
        ? wrapped.error
        : outcome && !outcome.ok
          ? outcome.reason
          : null;
      const needsRetry =
        !!reason &&
        (reason === "SOURCE_MISSING" || /could not open source file/i.test(reason));

      // Stale temp path / AE path quirk — re-download once to AppData and retry.
      if (needsRetry && item.audioUrl) {
        const fresh = await resolvePath(true);
        if (fresh && fresh !== filePath) {
          filePath = fresh;
          wrapped = await tryImport(filePath);
          outcome = wrapped.ok
            ? (wrapped.data as { ok?: boolean; reason?: string } | null)
            : null;
        }
      }

      if (!wrapped.ok) {
        showError(wrapped.error || "Could not import audio");
        reportSupportError("voiceover.import", wrapped.error);
      } else if (!outcome?.ok) {
        const failReason = outcome?.reason;
        const msg =
          failReason === "NO_ACTIVE_SEQUENCE"
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
    } catch (err) {
      showError(err instanceof Error ? err.message : "Import failed");
      reportSupportError("voiceover.import", err);
    } finally {
      setPlacing(null);
    }
  }

  return (
    <div className="voiceover-app">
      <div className="voiceover-app__body thin-scroll">
        <div className="card voiceover-app__card">
          <div className="voiceover-app__card-head">
            <p className="voiceover-app__card-title">
              <Mic className="size-3.5" style={{ color: "var(--accent)" }} />
              Voiceover
            </p>
            {history.length > 0 ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setHistoryOpen(true)}
                title="View all generations"
                aria-label="View all generations"
              >
                <List size={14} strokeWidth={2} />
              </button>
            ) : null}
          </div>

          <label className="voiceover-app__label">Script</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Enter the narration text…"
            className="voiceover-app__script"
          />

          <div className="voiceover-app__field">
            <label className="voiceover-app__label">Language</label>
            <DropdownSelect
              items={languages}
              value={languageBoost}
              onChange={setLanguageBoost}
              labelFor={(l) => l.name}
              placeholder="Select language"
            />
          </div>

          <div className="voiceover-app__voice-grid">
            <div className="min-w-0">
              <label className="voiceover-app__label">Voice</label>
              <DropdownSelect
                items={voices}
                value={voiceId}
                onChange={setVoiceId}
                labelFor={(v) => v.name}
                placeholder="Select voice"
              />
              <VoicePreview voice={selectedVoice} />
            </div>
            <div className="min-w-0">
              <label className="voiceover-app__label">Emotion</label>
              <DropdownSelect
                items={[...EMOTION_OPTIONS]}
                value={emotion}
                onChange={setEmotion}
                labelFor={(e) => e.name}
                placeholder="Select emotion"
              />
            </div>
          </div>

          <div className="voiceover-app__sliders">
            <div className="field-row voiceover-app__slider-row">
              <span className="field-row__label">Speed</span>
              <input
                type="range"
                className="range"
                min={0.5}
                max={2}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                aria-label="Voiceover speed"
                style={rangeFillStyle(speed, 0.5, 2)}
              />
              <ScrubNumber
                value={speed}
                onChange={setSpeed}
                min={0.5}
                max={2}
                step={0.1}
                suffix="x"
              />
            </div>

            <div className="field-row voiceover-app__slider-row">
              <span className="field-row__label">Volume</span>
              <input
                type="range"
                className="range"
                min={0}
                max={10}
                step={0.1}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Voiceover volume"
                style={rangeFillStyle(volume, 0, 10)}
              />
              <ScrubNumber value={volume} onChange={setVolume} min={0} max={10} step={0.1} />
            </div>

            <div className="field-row voiceover-app__slider-row">
              <span className="field-row__label">Pitch</span>
              <input
                type="range"
                className="range"
                min={-12}
                max={12}
                step={1}
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                aria-label="Voiceover pitch"
                style={rangeFillStyle(pitch, -12, 12)}
              />
              <ScrubNumber value={pitch} onChange={setPitch} min={-12} max={12} step={1} />
            </div>
          </div>
        </div>
      </div>

      <div className="voiceover-app__footer">
        <button
          type="button"
          disabled={!canGenerate}
          onClick={() => void handleGenerate()}
          className="btn btn--primary voiceover-app__generate"
        >
          {busy ? <span className="spinner" /> : null}
          {outOfCredits ? "No generations left" : withGenerationCostLabel("Generate", generationCost)}
        </button>
        {outOfCredits ? (
          <p className="voiceover-app__credits-hint">
            Upgrade your plan or buy extra generations to continue.
          </p>
        ) : null}
      </div>

      {historyOpen
        ? createPortal(
            <div
              className="ai-tools-scope voiceover-app__history-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Voiceover history"
            >
              <div className="voiceover-app__history-header">
                <div>
                  <p className="voiceover-app__history-title">All generations</p>
                  <p className="voiceover-app__history-count">{history.length} saved</p>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close"
                  className="icon-btn voiceover-app__history-close"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
              <div className="voiceover-app__history-body">
                {history.map((item) => (
                  <HistoryItemCard
                    key={item.id}
                    item={item}
                    placing={placing}
                    onPlace={(row, destination) => void place(row, destination)}
                    onLocalPath={updateLocalPath}
                  />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
