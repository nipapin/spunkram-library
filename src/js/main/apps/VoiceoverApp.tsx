import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  ChevronDown,
  FolderPlus,
  Loader2,
  Mic,
  Pause,
  Play,
  Timeline,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { evalTS } from "@/lib/utils/bolt";
import {
  downloadVoiceoverFile,
  fetchVoiceoverCatalog,
  generateVoiceover,
  type VoiceoverLanguage,
  type VoiceoverResult,
  type VoiceoverVoice,
} from "@/api/voiceover";
import { WaveformPlayer } from "@/components/waveform-player";

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

function speedRangeStyle(value: number, min: number, max: number): CSSProperties {
  const pct = ((value - min) / (max - min)) * 100;
  return {
    background: `linear-gradient(to right, rgb(var(--primary)) ${pct}%, rgba(var(--secondary), 1) ${pct}%)`,
  };
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

export const VoiceoverApp = () => {
  const [voices, setVoices] = useState<VoiceoverVoice[]>([]);
  const [languages, setLanguages] = useState<VoiceoverLanguage[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [languageBoost, setLanguageBoost] = useState("Automatic");
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState<"project" | "timeline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceoverResult | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);

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

  const canGenerate = text.trim().length > 0 && !!voiceId && !busy;
  const selectedVoice = useMemo(
    () => voices.find((v) => v.id === voiceId),
    [voices, voiceId],
  );
  const selectedLanguage = useMemo(
    () => languages.find((l) => l.id === languageBoost),
    [languages, languageBoost],
  );

  const playbackUrl = useMemo(() => {
    // Prefer HTTPS so peaks/playback don't remount when the local download finishes.
    if (result?.audio_url && /^https?:\/\//i.test(result.audio_url)) {
      return result.audio_url;
    }
    if (localPath) return `file://${localPath.replace(/\\/g, "/")}`;
    return result?.audio_url || null;
  }, [result?.audio_url, localPath]);

  async function handleGenerate() {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setLocalPath(null);
    const res = await generateVoiceover({
      text: text.trim(),
      voice_id: voiceId,
      speed,
      language_boost: languageBoost,
    });
    setBusy(false);
    if (!res.data) {
      setError(res.error || "Generation failed");
      return;
    }
    setResult(res.data);
    const dl = await downloadVoiceoverFile(
      res.data.audio_url,
      res.data.file_name || "spunkram-voiceover.wav",
    );
    if (dl.path) setLocalPath(dl.path);
    else if (dl.error) setError(dl.error);
    window.dispatchEvent(new Event("aitools-credits-changed"));
  }

  async function place(destination: "project" | "timeline") {
    if (!localPath && !result?.audio_url) return;
    setPlacing(destination);
    setError(null);
    try {
      let filePath = localPath;
      if (!filePath && result?.audio_url) {
        const dl = await downloadVoiceoverFile(
          result.audio_url,
          result.file_name || "spunkram-voiceover.wav",
        );
        if (!dl.path) {
          setError(dl.error || "Could not download audio");
          setPlacing(null);
          return;
        }
        filePath = dl.path;
        setLocalPath(dl.path);
      }
      const outcome = (await evalTS(
        "importVoiceoverAudio",
        filePath!,
        destination,
        result?.duration ?? 1,
      )) as { ok?: boolean; reason?: string } | null;
      if (!outcome?.ok) {
        const reason = outcome?.reason;
        setError(
          reason === "NO_ACTIVE_SEQUENCE"
            ? "Open a sequence first"
            : reason === "NO_ACTIVE_COMP"
              ? "Open a composition first"
              : reason || "Could not import audio",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
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
                style={speedRangeStyle(speed, 0.5, 2)}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-[9px] text-muted-foreground">
              <span>0.5x</span>
              <span>2.0x</span>
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
          Generate voiceover
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-white/10 bg-card/60 p-3 ring-1 ring-inset ring-white/5">
          <p className="mb-2 text-[11px] text-muted-foreground">
            Ready{selectedVoice ? ` · ${selectedVoice.name}` : ""}
            {selectedLanguage ? ` · ${selectedLanguage.name}` : ""}
            {result.duration ? ` · ~${result.duration}s` : ""}
          </p>
          <div className="mb-3 rounded-lg border border-white/10 bg-background/40 px-2 py-2">
            <WaveformPlayer
              audioUrl={playbackUrl}
              eagerLoad
              loading={!playbackUrl}
              className="gap-2"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!!placing}
              onClick={() => void place("timeline")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold",
                ACCENT_PILL,
                placing && "opacity-60",
              )}
            >
              {placing === "timeline" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Timeline className="size-3.5" />
              )}
              Add to timeline
            </button>
            <button
              type="button"
              disabled={!!placing}
              onClick={() => void place("project")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-secondary/60 px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {placing === "project" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FolderPlus className="size-3.5" />
              )}
              Add to project
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
