import { useCallback } from "react";
import { fs, path } from "../../lib/cep/node";
import { Motionflow } from "@/sdk";
import { downloadStockAsset } from "@/lib/api/stock-api";
import { resolveFootageDownloadDir } from "@/lib/utils/stock-paths";
import { useFiltersContext } from "../context/FiltersContext";
import { useProgressContext } from "../context/ProgressContext";
import { incrementUsage } from "../utils/trial-usage";
import type { MediaItem } from "../types";

export function useImportMedia() {
  const { setProgress, setPending } = useProgressContext();
  const { destination } = useFiltersContext();

  const importMedia = useCallback(
    async (item: MediaItem) => {
      try {
        const provider =
          item.provider || (item.type === "video" ? "pexels" : "unsplash");
        const downloadDir = await resolveFootageDownloadDir();
        if (!downloadDir.ok) {
          console.error("import error", downloadDir.message);
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
          destDir: downloadDir.dir,
          onProgress: ({ bytesReceived, totalBytes }) => {
            if (totalBytes && totalBytes > 0) {
              setProgress(Math.round((bytesReceived / totalBytes) * 100));
            }
          },
        });

        if (!downloaded.ok) throw new Error(downloaded.message);

        const res = await Motionflow.importMedia(
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
