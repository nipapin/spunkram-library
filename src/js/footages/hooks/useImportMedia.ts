import { useCallback } from "react";
import { fs, os, path } from "../../lib/cep/node";
import { MotionFlow } from "@/sdk";
import { downloadStockAsset } from "@/lib/api/stock-api";
import { useFiltersContext } from "../context/FiltersContext";
import { useProgressContext } from "../context/ProgressContext";
import { incrementUsage } from "../utils/trial-usage";
import type { MediaItem } from "../types";

function requestDownloadPath(): Promise<string> {
  return Promise.resolve(os.tmpdir());
}

export function useImportMedia() {
  const { setProgress, setPending } = useProgressContext();
  const { destination } = useFiltersContext();

  const importMedia = useCallback(
    async (item: MediaItem) => {
      try {
        const provider =
          item.provider || (item.type === "video" ? "pexels" : "unsplash");
        const downloadDir = await requestDownloadPath();
        if (!downloadDir) return;
        const filePath = path.join(downloadDir, item.name);

        setPending(true);
        setProgress(0);

        if (fs.existsSync(filePath)) {
          const res = await MotionFlow.importMedia(
            filePath,
            destination,
            item.duration ?? 5,
          );
          if (!res.ok) throw new Error(res.error);
          incrementUsage("gallery");
          setProgress(100);
          return;
        }

        const downloaded = await downloadStockAsset({
          provider,
          kind: item.type === "video" ? "video" : "image",
          id: item.id,
          fileName: item.name,
          destDir: downloadDir,
          onProgress: ({ bytesReceived, totalBytes }) => {
            if (totalBytes && totalBytes > 0) {
              setProgress(Math.round((bytesReceived / totalBytes) * 100));
            }
          },
        });

        if (!downloaded.ok) throw new Error(downloaded.message);

        const res = await MotionFlow.importMedia(
          downloaded.filePath,
          destination,
          item.duration ?? 5,
        );
        if (!res.ok) throw new Error(res.error);
        incrementUsage("gallery");
        setProgress(100);
      } catch (error) {
        console.error("import error", error);
      } finally {
        setPending(false);
        setProgress(0);
      }
    },
    [setPending, setProgress, destination],
  );

  return { importMedia };
}
