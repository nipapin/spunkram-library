import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { fs } from "@/lib/cep/node";

const BAR_COUNT = 120;
const FLAT_PEAKS: number[] = new Array(BAR_COUNT).fill(0);
const CONCURRENCY = 2;

// --------------- fetch queue ---------------
type QueueItem = { run: () => Promise<void>; cancelled: boolean };
const queue: QueueItem[] = [];
let running = 0;

function drain() {
  while (running < CONCURRENCY && queue.length > 0) {
    const item = queue.shift()!;
    if (item.cancelled) {
      drain();
      return;
    }
    running++;
    item.run().finally(() => {
      running--;
      drain();
    });
  }
}

function enqueue(run: () => Promise<void>): QueueItem {
  const item: QueueItem = { run, cancelled: false };
  queue.push(item);
  drain();
  return item;
}

// --------------- peak cache ---------------
const peakCache = new Map<string, number[]>();

function extractPeaks(buffer: AudioBuffer, barCount: number): number[] {
  const raw = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(raw.length / barCount));
  const peaks: number[] = new Array(barCount);
  let globalMax = 0;
  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    const start = i * step;
    const end = Math.min(start + step, raw.length);
    const count = Math.max(1, end - start);
    for (let j = start; j < end; j++) sum += raw[j] * raw[j];
    peaks[i] = Math.sqrt(sum / count);
    if (peaks[i] > globalMax) globalMax = peaks[i];
  }
  if (globalMax > 0) {
    for (let i = 0; i < barCount; i++) {
      peaks[i] = Math.round((peaks[i] / globalMax) * 1000) / 1000;
    }
  }
  return peaks;
}

/** Resolve file:// or Windows path to a local filesystem path. */
function toLocalPath(audioUrl: string): string | null {
  if (/^[A-Za-z]:[\\/]/.test(audioUrl) || audioUrl.startsWith("/")) {
    return audioUrl;
  }
  if (!audioUrl.startsWith("file://")) return null;
  let pathPart = audioUrl.slice("file://".length);
  // file:///C:/... → /C:/... → C:/...
  if (/^\/[A-Za-z]:/.test(pathPart)) pathPart = pathPart.slice(1);
  try {
    return decodeURIComponent(pathPart);
  } catch {
    return pathPart;
  }
}

async function loadAudioArrayBuffer(audioUrl: string): Promise<ArrayBuffer> {
  const local = toLocalPath(audioUrl);
  if (local && typeof fs?.readFileSync === "function" && fs.existsSync(local)) {
    const buf = fs.readFileSync(local) as Buffer;
    const copy = new Uint8Array(buf.byteLength);
    copy.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
    return copy.buffer;
  }
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error(`audio fetch ${res.status}`);
  return res.arrayBuffer();
}

async function fetchPeaks(audioUrl: string): Promise<number[]> {
  const buf = await loadAudioArrayBuffer(audioUrl);
  const actx = new AudioContext();
  try {
    const decoded = await actx.decodeAudioData(buf.slice(0));
    return extractPeaks(decoded, BAR_COUNT);
  } finally {
    void actx.close();
  }
}

// --------------- single-track playback ---------------
let activeTrack: { pause: () => void } | null = null;

function claimPlayback(track: { pause: () => void }) {
  if (activeTrack && activeTrack !== track) activeTrack.pause();
  activeTrack = track;
}

function releasePlayback(track: { pause: () => void }) {
  if (activeTrack === track) activeTrack = null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getForegroundRgb(el: HTMLElement): string {
  const raw = getComputedStyle(el).color;
  const m = raw.match(/(\d+),\s*(\d+),\s*(\d+)/);
  return m ? `${m[1]}, ${m[2]}, ${m[3]}` : "255, 255, 255";
}

function drawWaveform(canvas: HTMLCanvasElement, peaks: number[], progress: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const rgb = getForegroundRgb(canvas);
  const baseColor = `rgba(${rgb}, 0.18)`;
  const playedColor = `rgba(${rgb}, 0.75)`;

  const barCount = peaks.length;
  if (barCount === 0) return;

  const mid = h / 2;
  const maxAmp = h * 0.45;
  const minAmp = 2;
  const stepX = barCount > 1 ? w / (barCount - 1) : w;
  const splitX = progress * w;

  function buildPath(startIdx: number, endIdx: number) {
    ctx!.beginPath();
    for (let i = startIdx; i <= endIdx; i++) {
      const x = i * stepX;
      const amp = Math.max(peaks[i] * maxAmp, minAmp);
      const y = mid - amp;
      if (i === startIdx) ctx!.moveTo(x, y);
      else ctx!.lineTo(x, y);
    }
    for (let i = endIdx; i >= startIdx; i--) {
      const x = i * stepX;
      const amp = Math.max(peaks[i] * maxAmp, minAmp);
      const y = mid + amp;
      ctx!.lineTo(x, y);
    }
    ctx!.closePath();
  }

  ctx.fillStyle = baseColor;
  buildPath(0, barCount - 1);
  ctx.fill();

  if (progress > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, h);
    ctx.clip();
    ctx.fillStyle = playedColor;
    buildPath(0, barCount - 1);
    ctx.fill();
    ctx.restore();
  }
}

export interface WaveformPlayerProps {
  audioUrl: string | null | undefined;
  loading?: boolean;
  eagerLoad?: boolean;
  className?: string;
  buttonClassName?: string;
  waveformClassName?: string;
  leadingSlot?: ReactNode;
  trailingSlot?: ReactNode;
  timeClassName?: string;
}

/**
 * CEP port of next-app WaveformPlayer — canvas peaks + play/seek.
 * Decodes peaks locally (CDN fetch or Node fs for file://); no server proxy.
 */
export function WaveformPlayer({
  audioUrl,
  loading = false,
  eagerLoad = true,
  className,
  buttonClassName,
  waveformClassName,
  leadingSlot,
  trailingSlot,
  timeClassName,
}: WaveformPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const url = audioUrl || "";

  useEffect(() => {
    if (!url) {
      setPeaks(null);
      return;
    }
    if (peakCache.has(url)) {
      setPeaks(peakCache.get(url)!);
      return;
    }

    let cancelled = false;
    let queueItem: QueueItem | null = null;

    const start = () => {
      queueItem = enqueue(async () => {
        if (cancelled) return;
        try {
          const data = await fetchPeaks(url);
          peakCache.set(url, data);
          if (!cancelled) setPeaks(data);
        } catch {
          /* keep flat waveform */
        }
      });
    };

    if (eagerLoad) {
      start();
      return () => {
        cancelled = true;
        if (queueItem) queueItem.cancelled = true;
      };
    }

    const el = rowRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || queueItem || cancelled) return;
        obs.disconnect();
        start();
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => {
      cancelled = true;
      if (queueItem) queueItem.cancelled = true;
      obs.disconnect();
    };
  }, [url, eagerLoad]);

  useEffect(() => {
    if (!url || duration > 0) return;
    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = url;
    const onMeta = () => {
      if (Number.isFinite(probe.duration)) setDuration(probe.duration);
      probe.src = "";
    };
    probe.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => {
      probe.removeEventListener("loadedmetadata", onMeta);
      probe.src = "";
    };
  }, [url, duration]);

  const prevUrlRef = useRef(url);
  useEffect(() => {
    if (prevUrlRef.current === url) return;
    prevUrlRef.current = url;
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
    setIsBuffering(false);
    setCurrentTime(0);
    setDuration(0);
    setPeaks(url && peakCache.has(url) ? peakCache.get(url)! : null);
  }, [url]);

  const getOrCreateAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    if (!url) return null;
    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;
    audio.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    });
    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("playing", () => {
      setIsBuffering(false);
      setIsPlaying(true);
    });
    audio.addEventListener("play", () => setIsPlaying(true));
    audio.addEventListener("pause", () => {
      setIsPlaying(false);
      setIsBuffering(false);
    });
    audio.addEventListener("waiting", () => setIsBuffering(true));
    audio.addEventListener("error", () => setIsBuffering(false));
    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setCurrentTime(0);
    });
    return audio;
  }, [url]);

  const activePeaks = peaks ?? FLAT_PEAKS;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawWaveform(canvas, activePeaks, duration > 0 ? currentTime / duration : 0);
  }, [activePeaks, currentTime, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      drawWaveform(canvas, activePeaks, duration > 0 ? currentTime / duration : 0);
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [activePeaks, currentTime, duration]);

  const pauseThis = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  const handleRef = useRef<{ pause: () => void }>({ pause: pauseThis });
  useEffect(() => {
    handleRef.current.pause = pauseThis;
  }, [pauseThis]);

  useEffect(() => {
    return () => {
      releasePlayback(handleRef.current);
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (!url) return;
      if (isPlaying || isBuffering) {
        pauseThis();
      } else {
        const audio = getOrCreateAudio();
        if (!audio) return;
        claimPlayback(handleRef.current);
        if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          setIsBuffering(true);
        }
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setIsBuffering(false);
            releasePlayback(handleRef.current);
          });
      }
    },
    [url, isPlaying, isBuffering, getOrCreateAudio, pauseThis],
  );

  const handleWaveformClick = useCallback(
    (e: MouseEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      const audio = getOrCreateAudio();
      const canvas = canvasRef.current;
      if (!audio || !canvas || !duration) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(audio.currentTime);
    },
    [duration, getOrCreateAudio],
  );

  const showSpinner = loading || isBuffering;
  const disabled = !url || loading;

  return (
    <div ref={rowRef} className={cn("flex min-w-0 items-center gap-2", className)}>
      <button
        type="button"
        onClick={togglePlay}
        disabled={disabled}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary transition-colors",
          "hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50",
          buttonClassName,
        )}
        aria-label={showSpinner ? "Loading" : isPlaying ? "Pause" : "Play"}
      >
        {showSpinner ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5 fill-current" />
        )}
      </button>

      {leadingSlot}

      <div className={cn("relative h-9 min-w-0 flex-1", waveformClassName)}>
        <canvas
          ref={canvasRef}
          onClick={handleWaveformClick}
          className="h-full w-full cursor-pointer text-foreground"
        />
      </div>

      <span
        className={cn(
          "w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground",
          timeClassName,
        )}
      >
        {duration > 0
          ? isPlaying
            ? formatTime(currentTime)
            : formatTime(duration)
          : "--:--"}
      </span>

      {trailingSlot}
    </div>
  );
}
