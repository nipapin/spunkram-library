/**
 * Voiceover (Minimax via Motionflow):
 *   GET  /api/cep/voiceover/voices → { voices, languages }
 *   POST /api/generations/voiceover  { text, voice_id, speed?, volume?, pitch?, emotion?, language_boost? }
 */
import { apiUrl, GENERATIONS_ENDPOINTS, VOICEOVER_ENDPOINTS } from "./config";
import { getUserIdentity } from "./user";
import { cepHttpRequest } from "@/lib/api/cep-http";
import { fs, os, path } from "@/lib/cep/node";
import { BRAND } from "@brands";
import { downloadToFile } from "@/utils/download-file";

export type VoiceoverVoice = {
  id: string;
  name: string;
  gender?: string;
  preview_url?: string;
};

export type VoiceoverLanguage = {
  id: string;
  name: string;
};

export type VoiceoverResult = {
  audio_url: string;
  duration?: number;
  file_name?: string;
};

export type VoiceoverCatalog = {
  voices: VoiceoverVoice[];
  languages: VoiceoverLanguage[];
};

let catalogCache: VoiceoverCatalog | null = null;
let catalogPending: Promise<VoiceoverCatalog> | null = null;

const previewByVoiceId = new Map<string, string>();
const previewListeners = new Set<() => void>();
let previewPreload: Promise<void> | null = null;

const FALLBACK_LANGUAGES: VoiceoverLanguage[] = [
  { id: "Automatic", name: "Auto detect" },
  { id: "English", name: "English" },
  { id: "Russian", name: "Russian" },
  { id: "Spanish", name: "Spanish" },
  { id: "French", name: "French" },
  { id: "German", name: "German" },
  { id: "Portuguese", name: "Portuguese" },
  { id: "Italian", name: "Italian" },
  { id: "Ukrainian", name: "Ukrainian" },
  { id: "Polish", name: "Polish" },
  { id: "Chinese", name: "Chinese" },
  { id: "Japanese", name: "Japanese" },
  { id: "Korean", name: "Korean" },
  { id: "Arabic", name: "Arabic" },
  { id: "Hindi", name: "Hindi" },
];

function authHeaders(): Record<string, string> {
  const user = getUserIdentity();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (user.token) headers.Authorization = `Bearer ${user.token}`;
  return headers;
}

async function fetchVoiceoverCatalogUncached(): Promise<VoiceoverCatalog> {
  const result = await cepHttpRequest(apiUrl(VOICEOVER_ENDPOINTS.voices), {
    method: "GET",
    headers: authHeaders(),
  });
  if (result.ok) {
    try {
      const parsed = JSON.parse(result.text) as {
        voices?: VoiceoverVoice[];
        languages?: VoiceoverLanguage[];
      } | VoiceoverVoice[];
      if (Array.isArray(parsed)) {
        return {
          voices: parsed,
          languages: FALLBACK_LANGUAGES,
        };
      }
      const voices = Array.isArray(parsed.voices) ? parsed.voices : [];
      const languages =
        Array.isArray(parsed.languages) && parsed.languages.length > 0
          ? parsed.languages
          : FALLBACK_LANGUAGES;
      if (voices.length > 0) return { voices, languages };
    } catch {
      // fall through
    }
  }
  return { voices: [], languages: FALLBACK_LANGUAGES };
}

export async function fetchVoiceoverCatalog(): Promise<VoiceoverCatalog> {
  if (catalogCache?.voices.length) return catalogCache;
  if (!catalogPending) {
    catalogPending = fetchVoiceoverCatalogUncached().then((catalog) => {
      catalogPending = null;
      if (catalog.voices.length > 0) catalogCache = catalog;
      return catalog;
    });
  }
  return catalogPending;
}

/** @deprecated Prefer fetchVoiceoverCatalog — kept for callers that only need voices. */
export async function fetchVoiceoverVoices(): Promise<VoiceoverVoice[]> {
  const catalog = await fetchVoiceoverCatalog();
  return catalog.voices;
}

export async function generateVoiceover(input: {
  text: string;
  voice_id: string;
  speed?: number;
  volume?: number;
  pitch?: number;
  emotion?: string;
  language_boost?: string;
}): Promise<{ data?: VoiceoverResult; error?: string }> {
  const user = getUserIdentity();
  const result = await cepHttpRequest(apiUrl(GENERATIONS_ENDPOINTS.voiceover), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      text: input.text,
      voice_id: input.voice_id,
      speed: input.speed ?? 1,
      volume: input.volume ?? 1,
      pitch: input.pitch ?? 0,
      emotion: input.emotion || "auto",
      language_boost: input.language_boost || "Automatic",
      email: user.email || undefined,
      userId: user.id || undefined,
    }),
    timeoutMs: 120000,
  });

  if (result.ok) {
    try {
      const data = JSON.parse(result.text) as VoiceoverResult;
      if (data.audio_url) return { data };
    } catch {
      return { error: "Invalid voiceover response" };
    }
  }

  return {
    error:
      result.status === 401
        ? "Sign in required"
        : result.status === 402 || result.status === 403
          ? "Subscription or generation credits required"
          : result.error || `Voiceover failed (${result.status})`,
  };
}

function voiceoverDir(subdir?: string): string | null {
  try {
    const roaming =
      typeof os?.platform === "function" && os.platform() === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support")
        : path.join(os.homedir(), "AppData", "Roaming");
    const base = path.join(roaming, BRAND.prefsCompany, BRAND.prefsProduct, "voiceover");
    return subdir ? path.join(base, subdir) : base;
  } catch {
    if (typeof os?.tmpdir !== "function") return null;
    const base = path.join(os.tmpdir(), `${BRAND.id}-voiceover`);
    return subdir ? path.join(base, subdir) : base;
  }
}

function isValidAudioFile(filePath: string): boolean {
  try {
    if (typeof fs?.existsSync !== "function" || !fs.existsSync(filePath)) return false;
    if (typeof fs?.statSync === "function" && fs.statSync(filePath).size < 64) return false;
    if (typeof fs?.openSync !== "function" || typeof fs?.readSync !== "function") return true;
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(12);
      fs.readSync(fd, buf, 0, 12, 0);
      const isRiff = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
      const isId3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
      const isMpeg = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
      const isFtyp = buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
      const isOgg = buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53;
      return isRiff || isId3 || isMpeg || isFtyp || isOgg;
    } finally {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  } catch {
    return false;
  }
}

const previewBlobByVoiceId = new Map<string, string>();

function mimeFromPreviewPath(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".m4a" || ext === ".aac") return "audio/mp4";
  if (ext === ".flac") return "audio/flac";
  return "audio/mpeg";
}

/** CEP Chromium blocks `file://` from the panel origin (`ERR_UNKNOWN_URL_SCHEME`). */
function localAudioToBlobUrl(filePath: string): string {
  if (typeof fs?.readFileSync !== "function") return "";
  try {
    const data = fs.readFileSync(filePath) as Buffer;
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    return URL.createObjectURL(new Blob([bytes], { type: mimeFromPreviewPath(filePath) }));
  } catch {
    return "";
  }
}

function emitPreviewUpdate() {
  previewListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

function previewExt(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(mp3|wav|m4a|ogg|aac|flac)$/i);
    if (match) return `.${match[1].toLowerCase()}`;
  } catch {
    /* ignore */
  }
  return ".mp3";
}

function rememberPreview(voiceId: string, filePath: string) {
  if (previewByVoiceId.get(voiceId) === filePath) return;
  previewByVoiceId.set(voiceId, filePath);
  emitPreviewUpdate();
}

async function ensureLocalPreview(voice: VoiceoverVoice): Promise<void> {
  const url = voice.preview_url?.trim();
  if (!url) return;
  const existing = previewByVoiceId.get(voice.id);
  if (existing && isValidAudioFile(existing)) return;

  const dir = voiceoverDir("previews");
  if (!dir || typeof fs?.mkdirSync !== "function") return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const safeId = voice.id.replace(/[^\w.\-]+/g, "_") || "voice";
  const ext = previewExt(url);
  const outPath = path.join(dir, `${safeId}${ext}`);
  if (isValidAudioFile(outPath)) {
    rememberPreview(voice.id, outPath);
    return;
  }

  try {
    await downloadToFile(url, outPath, { timeoutMs: 20_000 });
    if (isValidAudioFile(outPath)) rememberPreview(voice.id, outPath);
  } catch {
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {
      /* ignore */
    }
  }
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/** Local blob: URL for a voice sample, or empty if not cached yet. */
export function getLocalVoicePreviewUrl(voiceId: string): string {
  const cached = previewBlobByVoiceId.get(voiceId);
  if (cached) return cached;
  const filePath = previewByVoiceId.get(voiceId);
  if (!filePath || !isValidAudioFile(filePath)) return "";
  const blobUrl = localAudioToBlobUrl(filePath);
  if (blobUrl) previewBlobByVoiceId.set(voiceId, blobUrl);
  return blobUrl;
}

/** Playback URL: local cache first, then remote preview_url. */
export function resolveVoicePreviewUrl(voice: VoiceoverVoice | undefined): string {
  if (!voice) return "";
  return getLocalVoicePreviewUrl(voice.id) || voice.preview_url?.trim() || "";
}

export function subscribeVoicePreviews(cb: () => void): () => void {
  previewListeners.add(cb);
  return () => {
    previewListeners.delete(cb);
  };
}

/**
 * Fetch the voice catalog and download preview samples to AppData so playback
 * does not wait on the network. Safe to call repeatedly; shares in-flight work.
 */
export function preloadVoiceoverPreviews(): Promise<void> {
  if (previewPreload) return previewPreload;
  previewPreload = (async () => {
    const catalog = await fetchVoiceoverCatalog();
    const voices = catalog.voices.filter((v) => v.preview_url?.trim());
    if (voices.length === 0) {
      previewPreload = null;
      return;
    }
    await mapPool(voices, 3, ensureLocalPreview);
  })().catch(() => {
    previewPreload = null;
  });
  return previewPreload;
}

/** Download remote audio (or resolve local path) into AppData for host import. */
export async function downloadVoiceoverFile(
  audioUrl: string,
  fileName = `${BRAND.id}-voiceover.wav`,
): Promise<{ path?: string; error?: string }> {
  try {
    if (audioUrl.startsWith("file://") || /^[A-Za-z]:[\\/]/.test(audioUrl) || audioUrl.startsWith("/")) {
      const local = audioUrl.replace(/^file:\/\//, "");
      if (typeof fs?.existsSync === "function" && fs.existsSync(local)) {
        return { path: local };
      }
    }

    const dir = voiceoverDir();
    if (!dir || typeof fs?.mkdirSync !== "function") {
      return { error: "File system unavailable" };
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = fileName.replace(/[^\w.\-]+/g, "_") || "voiceover.wav";
    const outPath = path.join(dir, `${Date.now()}-${safeName}`);

    // Binary stream — never go through cepHttpRequest (UTF-8 text corrupts WAV/MP3).
    await downloadToFile(audioUrl, outPath, { timeoutMs: 60_000 });

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 64) {
      try {
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      } catch {
        /* ignore */
      }
      return { error: "Downloaded audio file is empty or invalid" };
    }
    return { path: outPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Download failed" };
  }
}
