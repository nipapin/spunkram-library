import { useCallback } from "react";
import { fs, os, path } from "../../lib/cep/node";
import { evalTS } from "../../lib/utils/bolt";
import { useFiltersContext } from "../context/FiltersContext";
import { useProgressContext } from "../context/ProgressContext";
import { incrementUsage } from "../utils/trial-usage";

function requestDownloadPath(): Promise<string> {
  return Promise.resolve(os.tmpdir());
}

export function useImportMedia() {
  const { setProgress, setPending } = useProgressContext();
  const { destination } = useFiltersContext();

  const importMedia = useCallback(
    async (url: string, fileName: string, duration: number, downloadLocation: string) => {
      try {
        console.log("importMedia", url, fileName, duration, downloadLocation);
        if (!url) return;

        const downloadDir = await requestDownloadPath();
        console.log("downloadDir", downloadDir);
        if (!downloadDir) return;
        const filePath = path.join(downloadDir, fileName);

        setPending(true);
        setProgress(0);

        if (fs.existsSync(filePath)) {
          await evalTS("importMedia", filePath, destination, duration);
          incrementUsage("gallery");
          setProgress(100);
          return;
        }

        const response = await fetch(url, { cache: "no-store" });
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
            setProgress(Math.round((received / contentLength) * 100));
          }
        }

        const merged = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }

        const buffer = Buffer.from(merged);
        fs.writeFileSync(filePath, buffer);
        await evalTS("importMedia", filePath, destination, duration);
        incrementUsage("gallery");
        setProgress(100);
        if (downloadLocation) {
          await trackDownload(downloadLocation);
        }
      } catch (error) {
        console.error("import error", error);
      } finally {
        setPending(false);
        setProgress(0);
      }
    },
    [setPending, setProgress, destination],
  );
  const trackDownload = useCallback(async (url: string) => {
    const response = await fetch('https://api.get-atomx.com/atomx/v1/track_download', {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({
        url,
      }),
    });
    if (!response.ok) {
      console.error("Failed to track download", response.statusText);
    }
    const data = await response.json();
    return data;
  }, []);

  return { importMedia, trackDownload };
}
