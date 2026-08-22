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

export async function fetchVoiceoverCatalog(): Promise<VoiceoverCatalog> {
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

    // Prefer AppData over OS temp — AE often fails to open files under %TEMP%.
    let dir = "";
    try {
      const roaming =
        typeof os?.platform === "function" && os.platform() === "darwin"
          ? path.join(os.homedir(), "Library", "Application Support")
          : path.join(os.homedir(), "AppData", "Roaming");
      dir = path.join(roaming, BRAND.prefsCompany, BRAND.prefsProduct, "voiceover");
    } catch {
      dir = "";
    }
    if (!dir && typeof os?.tmpdir === "function") {
      dir = path.join(os.tmpdir(), `${BRAND.id}-voiceover`);
    }
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
