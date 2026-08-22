import { useCallback } from "react";
import { fs, path } from "../../lib/cep/node";
import { Motionflow } from "@/sdk";
import { downloadStockAsset } from "@/lib/api/stock-api";
import { resolveFootageDownloadDir } from "@/lib/utils/stock-paths";
import { useFiltersContext } from "../context/FiltersContext";
import { useProgressContext } from "../context/ProgressContext";
import { incrementUsage } from "../utils/trial-usage";
import type { MediaItem } from "../types";

type HostImportOutcome = { ok?: boolean; reason?: string } | null | undefined;

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
  if (/host script returned no result/i.test(reason)) {
    return "Open a composition in After Effects, then try again.";
  }
  return reason;
}

function hostImportError(
  res: { ok: true; data?: unknown } | { ok: false; error?: string },
): string | null {
  if (!res.ok) return mapImportError(res.error);
  const data = res.data as HostImportOutcome;
  if (data && typeof data === "object" && data.ok === false) {
    return mapImportError(data.reason);
  }
  return null;
}

export function useImportMedia() {
  const { setProgress, setPending, setError } = useProgressContext();
  const { destination } = useFiltersContext();

  const importMedia = useCallback(
    async (item: MediaItem) => {
      try {
        const provider =
          item.provider || (item.type === "video" ? "pexels" : "unsplash");
        const downloadDir = await resolveFootageDownloadDir();
        if (!downloadDir.ok) {
          setError(downloadDir.message || "Failed to resolve download directory");
          return;
        }
        const filePath = path.join(downloadDir.dir, item.name);

        setPending(true);
        setProgress(0);

        if (fs.existsSync(filePath)) {
          const res = await Motionflow.importMedia(
            filePath,
            destination,
            item.duration ?? 5,
          );
          const err = hostImportError(res);
          if (err) {
            setError(err);
            return;
          }
          incrementUsage("gallery");
          setProgress(100);
          return;
        }

        const downloaded = await downloadStockAsset({
          provider,
          kind: item.type === "video" ? "video" : "image",
          id: item.id,
          fileName: item.name,
          destDir: downloadDir.dir,
          quality: item.quality,
          resolution: item.resolution,
          onProgress: ({ bytesReceived, totalBytes }) => {
            if (totalBytes && totalBytes > 0) {
              setProgress(Math.round((bytesReceived / totalBytes) * 100));
            }
          },
        });

        if (!downloaded.ok) {
          setError(downloaded.message || "Download failed");
          return;
        }

        const res = await Motionflow.importMedia(
          downloaded.filePath,
          destination,
          item.duration ?? 5,
        );
        const err = hostImportError(res);
        if (err) {
          setError(err);
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
