/**
 * Voiceover (Minimax via Motionflow):
 *   GET  /api/cep/voiceover/voices → { voices, languages }
 *   POST /api/generations/voiceover  { text, voice_id, speed?, language_boost? }
 */
import { apiUrl, GENERATIONS_ENDPOINTS, VOICEOVER_ENDPOINTS } from "./config";
import { getUserIdentity } from "./user";
import { cepHttpRequest } from "@/lib/api/cep-http";
import { fs, os, path } from "@/lib/cep/node";

// Injected by vite.config.ts — true only when CEP_API_MOCKS=true.
declare const __CEP_API_MOCKS__: boolean | undefined;
const MOCK_ENABLED =
  typeof __CEP_API_MOCKS__ === "boolean"
    ? __CEP_API_MOCKS__
    : Boolean(import.meta.env.DEV);

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

const MOCK_VOICES: VoiceoverVoice[] = [
  { id: "Friendly_Person", name: "Friendly Person", gender: "female" },
  { id: "Deep_Voice_Man", name: "Deep Voice Man", gender: "male" },
  { id: "Calm_Woman", name: "Calm Woman", gender: "female" },
  { id: "Imposing_Manner", name: "Imposing Manner", gender: "male" },
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
  if (MOCK_ENABLED) {
    return { voices: MOCK_VOICES, languages: FALLBACK_LANGUAGES };
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
      language_boost: input.language_boost || "Automatic",
      email: user.email || undefined,
      userId: user.id || undefined,
      devToken: user.devToken || undefined,
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

  // Never mock a successful generation — quota / auth must come from the server.
  return {
    error:
      result.status === 401
        ? "Sign in required"
        : result.status === 402 || result.status === 403
          ? "Subscription or generation credits required"
          : result.error || `Voiceover failed (${result.status})`,
  };
}

/** Download remote audio (or copy local mock) into a temp file for host import. */
export async function downloadVoiceoverFile(
  audioUrl: string,
  fileName = "spunkram-voiceover.wav",
): Promise<{ path?: string; error?: string }> {
  try {
    if (audioUrl.startsWith("file://") || /^[A-Za-z]:[\\/]/.test(audioUrl) || audioUrl.startsWith("/")) {
      const local = audioUrl.replace(/^file:\/\//, "");
      if (typeof fs?.existsSync === "function" && fs.existsSync(local)) {
        return { path: local };
      }
    }

    const result = await cepHttpRequest(audioUrl, { method: "GET", timeoutMs: 60000 });
    if (!result.ok) return { error: "Failed to download audio" };

    const dir =
      typeof os?.tmpdir === "function"
        ? path.join(os.tmpdir(), "spunkram-voiceover")
        : "";
    if (!dir || typeof fs?.mkdirSync !== "function") {
      return { error: "File system unavailable" };
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = fileName.replace(/[^\w.\-]+/g, "_") || "voiceover.wav";
    const outPath = path.join(dir, `${Date.now()}-${safeName}`);
    // cepHttpRequest returns text; for binary mock we write UTF-8 base64 decoded below.
    // Real backend should return a URL to a binary file fetched via node https.
    const buf = Buffer.from(result.text, "binary");
    fs.writeFileSync(outPath, buf);
    return { path: outPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Download failed" };
  }
}
