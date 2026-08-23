import { useCallback } from "react";
import { fs, os, path } from "../../lib/cep/node";
import { Motionflow } from "@/sdk";
import { resolveFootageDownloadDirSilent } from "@/lib/utils/stock-paths";
import { useFiltersContext } from "../context/FiltersContext";
import { useProgressContext } from "../context/ProgressContext";
import { incrementUsage } from "../utils/trial-usage";
import type { ImageUrls, MediaItem } from "../types";

function mapImportError(reason?: string | null): string {
  if (!reason) return "Could not import footage. Try again.";
  if (reason === "NO_ACTIVE_COMP") {
    return "Open a composition in After Effects, then try again.";
  }
  if (reason === "NO_ACTIVE_SEQUENCE") {
    return "Open a sequence in Premiere Pro, then try again.";
  }
  if (reason === "SOURCE_MISSING" || reason === "NO_FILE") {
    return "File not found. Try downloading again.";
  }
  if (reason === "IMPORT_FAILED") {
    return "Could not import footage. Try again.";
  }
  if (reason === "PLACE_FAILED") {
    return "Footage is in the project, but could not be added to the composition.";
  }
  if (/host script returned no result/i.test(reason)) {
    return "After Effects is busy. Check the project panel — the footage may already be there.";
  }
  return reason;
}

function resolveSourceUrl(item: MediaItem): { url: string; duration: number } | null {
  if (item.type === "video") {
    const files = item.videoFiles ?? [];
    if (item.resolution && files.length) {
      const match = files.find((f) => `${f.width}x${f.height}` === item.resolution);
      if (match?.link) return { url: match.link, duration: item.duration ?? 0 };
    }
    if (files.length) {
      const best = [...files].sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (best?.link) return { url: best.link, duration: item.duration ?? 0 };
    }
    if (item.downloadUrl) return { url: item.downloadUrl, duration: item.duration ?? 0 };
    return null;
  }

  const quality = (item.quality || "full") as keyof ImageUrls;
  const url =
    item.imageUrls?.[quality] || item.imageUrls?.full || item.downloadUrl || "";
  if (!url) return null;
  return { url, duration: item.duration ?? 5 };
}

async function fetchToFile(
  url: string,
  filePath: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ReadableStream not supported");

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      onProgress(Math.round((received / contentLength) * 100));
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const dir = path.dirname(filePath);
  if (typeof fs?.mkdirSync === "function" && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, Buffer.from(merged));
}

export function useImportMedia() {
  const { setProgress, setPending, setError } = useProgressContext();
  const { destination } = useFiltersContext();

  const importMedia = useCallback(
    async (item: MediaItem) => {
      try {
        const source = resolveSourceUrl(item);
        if (!source?.url) {
          setError("This item has no download URL.");
          return;
        }

        setPending(true);
        setProgress(0);

        const downloadDir =
          (await resolveFootageDownloadDirSilent()) || os.tmpdir();
        if (!downloadDir) {
          setError("Could not resolve a download folder.");
          return;
        }
        const filePath = path.join(downloadDir, item.name);

        if (!fs.existsSync(filePath)) {
          await fetchToFile(source.url, filePath, setProgress);
        }

        if (!fs.existsSync(filePath)) {
          setError("Download completed but file is missing.");
          return;
        }

        setProgress(95);

        const dest: "project" | "timeline" =
          destination === "timeline" ? "timeline" : "project";

        const outcome = await Motionflow.importMedia(filePath, dest, source.duration);
        console.log("[mf] importMedia", Motionflow.host, dest, outcome);
        if (!outcome.ok) {
          setError(mapImportError(outcome.error));
          return;
        }
        incrementUsage("gallery");
        setProgress(100);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setError(mapImportError(message));
      } finally {
        setPending(false);
        setProgress(0);
      }
    },
    [setPending, setProgress, setError, destination],
  );

  return { importMedia };
}
