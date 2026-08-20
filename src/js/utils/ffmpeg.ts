import { cepProcessEnv, child_process, fs, os, path } from "../lib/cep/node";
import { downloadToFile } from "./download-file";

/** Public CDN URLs — no auth. Mirrors next-app R2 keys under public/downloads/ffmpeg/. */
export const FFMPEG_CDN = {
  win: "https://cdn.motionflow.pro/public/downloads/ffmpeg/win/ffmpeg.exe",
  mac: "https://cdn.motionflow.pro/public/downloads/ffmpeg/mac/ffmpeg-mac.zip",
} as const;

export type FfmpegProgress = {
  phase: "download" | "extract";
  bytesReceived: number;
  totalBytes: number | null;
};

function platformKey(): "mac" | "win" {
  return os.platform() === "darwin" ? "mac" : "win";
}

/** Persistent userdata bin dir (survives ZXP overwrite of the extension folder). */
export function getFfmpegBinDir(): string {
  const platform = platformKey();
  if (platform === "mac") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Spunkram",
      "bin",
      "mac",
    );
  }
  const appData =
    cepProcessEnv().APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Spunkram", "bin", "win");
}

export function getFfmpegPath(): string {
  const platform = platformKey();
  const binary = platform === "win" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(getFfmpegBinDir(), binary);
}

function extractMacFfmpeg(binDir: string, binaryPath: string, zipPath: string): void {
  const result = child_process.spawnSync("unzip", ["-o", zipPath, "-d", binDir]);
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim();
    throw new Error(`Failed to extract ffmpeg${stderr ? `: ${stderr}` : ""}`);
  }
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`ffmpeg missing from archive after extraction: ${binaryPath}`);
  }
  fs.chmodSync(binaryPath, 0o755);
  try {
    fs.unlinkSync(zipPath);
  } catch {
    /* keep zip if unlink fails */
  }
}

let ensurePromise: Promise<string> | null = null;

/**
 * Ensure ffmpeg exists under userdata; download from public CDN on first use.
 * Concurrent callers share one in-flight download.
 */
export async function ensureFfmpeg(
  onProgress?: (p: FfmpegProgress) => void,
): Promise<string> {
  const binaryPath = getFfmpegPath();
  if (fs.existsSync(binaryPath)) return binaryPath;

  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const platform = platformKey();
    const binDir = getFfmpegBinDir();
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

    if (platform === "win") {
      await downloadToFile(FFMPEG_CDN.win, binaryPath, {
        timeoutMs: 15 * 60 * 1000,
        onProgress: (p) =>
          onProgress?.({
            phase: "download",
            bytesReceived: p.bytesReceived,
            totalBytes: p.totalBytes,
          }),
      });
      return binaryPath;
    }

    const zipPath = path.join(binDir, "ffmpeg-mac.zip");
    await downloadToFile(FFMPEG_CDN.mac, zipPath, {
      timeoutMs: 15 * 60 * 1000,
      onProgress: (p) =>
        onProgress?.({
          phase: "download",
          bytesReceived: p.bytesReceived,
          totalBytes: p.totalBytes,
        }),
    });
    onProgress?.({ phase: "extract", bytesReceived: 0, totalBytes: null });
    extractMacFfmpeg(binDir, binaryPath, zipPath);
    return binaryPath;
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}

/**
 * AVI/WAV → MP3. Входной файл НЕ удаляем: Premiere может держать хендл на
 * только что отрендеренный файл — удаление посреди флоу оставляет его в
 * "delete pending" и ломает следующий экспорт. Чистим в конце flow (main.tsx).
 */
export async function convertToMp3(
  inputPath: string,
  outputPath?: string,
): Promise<string> {
  const ffmpeg = await ensureFfmpeg();

  if (!fs.existsSync(ffmpeg)) {
    throw new Error(`ffmpeg not found: ${ffmpeg}`);
  }

  const outPath = outputPath ?? inputPath.replace(/\.[^.]+$/, ".mp3");

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = child_process.spawn(
        ffmpeg,
        ["-y", "-i", inputPath, "-vn", "-q:a", "2", outPath],
        { windowsHide: true },
      );

      let stderr = "";
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg failed (${code}): ${stderr.trim()}`));
      });
    });
  } catch (e) {
    // недописанный mp3 после падения ffmpeg — убираем, чтобы не уехал в API
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {
      // занят — оставляем, temp почистит система
    }
    throw e;
  }
  return outPath;
}

export type SilenceRange = { start: number; end: number };

/**
 * Detect every silent stretch in an audio file (used by Silence Cut).
 * @param noiseDb Threshold below which audio counts as silence (dBFS).
 * @param minDurationSec Minimum silence length to report.
 */
export async function detectSilences(
  audioPath: string,
  noiseDb = -30,
  minDurationSec = 0.4,
): Promise<SilenceRange[]> {
  try {
    const ffmpeg = await ensureFfmpeg();
    if (!fs.existsSync(ffmpeg) || !fs.existsSync(audioPath)) return [];

    const stderr = await new Promise<string>((resolve, reject) => {
      const proc = child_process.spawn(
        ffmpeg,
        [
          "-i",
          audioPath,
          "-af",
          `silencedetect=noise=${noiseDb}dB:d=${minDurationSec}`,
          "-f",
          "null",
          "-",
        ],
        { windowsHide: true },
      );

      let out = "";
      proc.stderr?.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      proc.on("error", reject);
      proc.on("close", () => resolve(out));
    });

    const ranges: SilenceRange[] = [];
    const startMatches = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)];
    const endMatches = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)];
    for (let i = 0; i < Math.min(startMatches.length, endMatches.length); i++) {
      const start = Number(startMatches[i][1]);
      const end = Number(endMatches[i][1]);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        ranges.push({ start, end });
      }
    }
    return ranges;
  } catch {
    return [];
  }
}

/**
 * Detect when speech (non-silence) begins in an audio file.
 * Uses ffmpeg silencedetect; returns the first silence_end (seconds), or 0
 * when the file has no leading silence / detection fails.
 */
export async function detectSpeechStart(audioPath: string): Promise<number> {
  try {
    const ffmpeg = await ensureFfmpeg();
    if (!fs.existsSync(ffmpeg) || !fs.existsSync(audioPath)) return 0;

    const stderr = await new Promise<string>((resolve, reject) => {
      const proc = child_process.spawn(
        ffmpeg,
        [
          "-i",
          audioPath,
          "-af",
          "silencedetect=noise=-30dB:d=0.3",
          "-f",
          "null",
          "-",
        ],
        { windowsHide: true },
      );

      let out = "";
      proc.stderr?.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });
      proc.on("error", reject);
      proc.on("close", () => resolve(out));
    });

    // Leading silence: first silence_start near 0, then silence_end = speech start.
    // If audio starts with speech, there is no early silence_end — return 0.
    const startMatch = stderr.match(/silence_start:\s*([\d.]+)/);
    if (startMatch && Number(startMatch[1]) > 0.15) return 0;

    const endMatch = stderr.match(/silence_end:\s*([\d.]+)/);
    if (!endMatch) return 0;
    const t = Number(endMatch[1]);
    return Number.isFinite(t) && t > 0 ? t : 0;
  } catch {
    return 0;
  }
}
