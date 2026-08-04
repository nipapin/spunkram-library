import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
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

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

const HISTORY_STORAGE_KEY = "spunkram.voiceoverHistory";
const HISTORY_MAX = 30;
/** Inline preview under the form; full list opens in a modal. */
const HISTORY_PREVIEW = 5;

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
    return typeof fs?.existsSync === "function" && fs.existsSync(filePath);
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

function rangeStyle(value: number, min: number, max: number): CSSProperties {
  const pct = ((value - min) / (max - min)) * 100;
  return {
    background: `linear-gradient(to right, rgb(var(--primary)) ${pct}%, rgba(var(--secondary), 1) ${pct}%)`,
  };
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
        <p className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
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
    <div className="rounded-xl border border-white/10 bg-card/60 p-3 ring-1 ring-inset ring-white/5">
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
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<VoiceoverHistoryItem[]>(loadHistory);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  const canGenerate =
    text.trim().length > 0 && !!voiceId && !busy && generationsLeft > 0;
  const outOfCredits = generationsLeft <= 0;
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
    if (!canGenerate || generationsLeft <= 0) return;
    setBusy(true);
    setError(null);
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
      setError(msg);
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
      setError(dl.error);
      reportSupportError("voiceover.download", dl.error);
    }
    window.dispatchEvent(new Event("aitools-credits-changed"));
  }

  async function place(
    item: VoiceoverHistoryItem,
    destination: "project" | "timeline",
  ) {
    setPlacing({ id: item.id, destination });
    setError(null);
    try {
      let filePath = localFileExists(item.localPath) ? item.localPath! : null;
      if (!filePath && item.audioUrl) {
        const dl = await downloadVoiceoverFile(
          item.audioUrl,
          item.fileName || "spunkram-voiceover.wav",
        );
        if (!dl.path) {
          const msg = dl.error || "Could not download audio";
          setError(msg);
          reportSupportError("voiceover.download", msg);
          setPlacing(null);
          return;
        }
        filePath = dl.path;
        updateLocalPath(item.id, dl.path);
      }
      if (!filePath) {
        setError("Audio file unavailable");
        setPlacing(null);
        return;
      }
      const wrapped = await MotionFlow.importVoiceoverAudio(
        filePath,
        destination,
        item.duration ?? 1,
      );
      if (!wrapped.ok) {
        setError(wrapped.error || "Could not import audio");
        reportSupportError("voiceover.import", wrapped.error);
      } else {
        const outcome = wrapped.data as { ok?: boolean; reason?: string } | null;
        if (!outcome?.ok) {
          const reason = outcome?.reason;
          const msg =
            reason === "NO_ACTIVE_SEQUENCE"
              ? "Open a sequence first"
              : reason === "NO_ACTIVE_COMP"
                ? "Open a composition first"
                : reason || "Could not import audio";
          setError(msg);
          if (reason !== "NO_ACTIVE_SEQUENCE" && reason !== "NO_ACTIVE_COMP") {
            reportSupportError("voiceover.import", msg, { reason: reason || null });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setError(msg);
      reportSupportError("voiceover.import", err);
    } finally {
      setPlacing(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      <div className="rounded-xl border border-white/10 bg-card/60 p-3 ring-1 ring-inset ring-white/5">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Mic className="size-3.5 text-primary" />
          Voiceover
        </div>

        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Script
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Enter the narration text…"
          className="mb-3 w-full resize-none rounded-lg border border-white/10 bg-background/50 px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50"
        />

        <div className="mb-3">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Language
          </label>
          <DropdownSelect
            items={languages}
            value={languageBoost}
            onChange={setLanguageBoost}
            labelFor={(l) => l.name}
            placeholder="Select language"
          />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Voice
            </label>
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
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Emotion
            </label>
            <DropdownSelect
              items={[...EMOTION_OPTIONS]}
              value={emotion}
              onChange={setEmotion}
              labelFor={(e) => e.name}
              placeholder="Select emotion"
            />
          </div>
        </div>

        <div className="mb-3 space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Speed {speed.toFixed(1)}x
            </label>
            <div className="flex h-[34px] items-center">
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                aria-label="Voiceover speed"
                className="thumb-size-range h-1 w-full cursor-pointer appearance-none rounded-full"
                style={rangeStyle(speed, 0.5, 2)}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
              <span>0.5x</span>
              <span>2.0x</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Volume {volume.toFixed(1)}
            </label>
            <div className="flex h-[34px] items-center">
              <input
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Voiceover volume"
                className="thumb-size-range h-1 w-full cursor-pointer appearance-none rounded-full"
                style={rangeStyle(volume, 0, 10)}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
              <span>0</span>
              <span>10</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Pitch {pitch > 0 ? "+" : ""}
              {pitch}
            </label>
            <div className="flex h-[34px] items-center">
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                aria-label="Voiceover pitch"
                className="thumb-size-range h-1 w-full cursor-pointer appearance-none rounded-full"
                style={rangeStyle(pitch, -12, 12)}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
              <span>−12</span>
              <span>+12</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!canGenerate}
          onClick={() => void handleGenerate()}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-xs font-semibold transition-opacity",
            ACCENT_PILL,
            !canGenerate && "cursor-not-allowed opacity-50",
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
          {outOfCredits ? "No generations left" : "Generate voiceover"}
        </button>
        {outOfCredits ? (
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            Upgrade your plan or buy extra generations to continue.
          </p>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {history.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              History
            </p>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              title="View all generations"
              aria-label="View all generations"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <List className="size-3.5" strokeWidth={2} />
            </button>
          </div>
          {history.slice(0, HISTORY_PREVIEW).map((item) => (
            <HistoryItemCard
              key={item.id}
              item={item}
              placing={placing}
              onPlace={(row, destination) => void place(row, destination)}
              onLocalPath={updateLocalPath}
            />
          ))}
        </div>
      )}

      {historyOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[1100] flex items-end justify-center bg-background/85 p-2 sm:items-center"
              onClick={() => setHistoryOpen(false)}
              role="presentation"
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Voiceover history"
                className="flex max-h-[min(90vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/10 bg-card shadow-xl ring-1 ring-inset ring-white/5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2.5">
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">
                      All generations
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {history.length} saved
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(false)}
                    aria-label="Close"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    <X className="size-3.5" strokeWidth={2} />
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
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
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
