import { useEffect, useMemo, useState } from "react";
import { FolderPlus, Loader2, Mic, Play, Timeline } from "lucide-react";
import { cn } from "@/lib/utils";
import { evalTS } from "@/lib/utils/bolt";
import {
  downloadVoiceoverFile,
  fetchVoiceoverVoices,
  generateVoiceover,
  type VoiceoverResult,
  type VoiceoverVoice,
} from "@/api/voiceover";

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

export const VoiceoverApp = () => {
  const [voices, setVoices] = useState<VoiceoverVoice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState<"project" | "timeline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceoverResult | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVoiceoverVoices().then((list) => {
      if (cancelled) return;
      setVoices(list);
      if (list[0]) setVoiceId(list[0].id);
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
      <div className="rounded-xl border border-white/10 bg-card/60 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Mic className="size-3.5 text-primary" />
          Voiceover
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">
            Minimax via Motionflow
          </span>
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

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Voice
            </label>
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-background/50 px-2 py-1.5 text-xs text-foreground"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.language ? ` (${v.language})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Speed {speed.toFixed(1)}x
            </label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="mt-2 w-full accent-[rgb(var(--primary))]"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!canGenerate}
          onClick={() => void handleGenerate()}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-opacity",
            ACCENT_PILL,
            !canGenerate && "opacity-50",
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Generate voiceover
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-white/10 bg-card/60 p-3">
          <p className="mb-2 text-[11px] text-muted-foreground">
            Ready{selectedVoice ? ` · ${selectedVoice.name}` : ""}
            {result.duration ? ` · ~${result.duration}s` : ""}
          </p>
          {localPath && (
            <audio controls className="mb-3 w-full" src={`file://${localPath.replace(/\\/g, "/")}`}>
              <track kind="captions" />
            </audio>
          )}
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
