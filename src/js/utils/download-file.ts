import { fs, http, https, path } from "../lib/cep/node";

export type DownloadProgress = {
  bytesReceived: number;
  totalBytes: number | null;
};

/**
 * Stream a remote URL to disk via CEP Node http(s). Follows redirects.
 * Prefer this over cepHttpRequest for large binaries (ffmpeg / ZXP).
 */
export function downloadToFile(
  fileUrl: string,
  destPath: string,
  opts: {
    timeoutMs?: number;
    onProgress?: (p: DownloadProgress) => void;
    maxRedirects?: number;
  } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const maxRedirects = opts.maxRedirects ?? 5;

  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      reject(err);
      return;
    }

    const tmpPath = `${destPath}.part`;
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        fs.renameSync(tmpPath, destPath);
        resolve();
      } catch (err) {
        fail(err);
      }
    };

    const get = (url: string, redirectsLeft: number) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch (err) {
        fail(err);
        return;
      }
      const lib = parsed.protocol === "https:" ? https : http;
      if (typeof lib?.get !== "function") {
        fail(new Error("Node http(s) unavailable"));
        return;
      }

      const req = lib.get(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          timeout: timeoutMs,
        },
        (res) => {
          const status = res.statusCode || 0;
          if (
            status >= 300 &&
            status < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            res.resume();
            const next = new URL(res.headers.location, url).toString();
            get(next, redirectsLeft - 1);
            return;
          }
          if (status < 200 || status >= 300) {
            res.resume();
            fail(new Error(`Download failed (${status})`));
            return;
          }

          const totalHeader = res.headers["content-length"];
          const totalBytes =
            typeof totalHeader === "string" && /^\d+$/.test(totalHeader)
              ? Number(totalHeader)
              : null;
          let bytesReceived = 0;
          const out = fs.createWriteStream(tmpPath);
          out.on("error", fail);
          res.on("error", fail);
          res.on("data", (chunk: Buffer) => {
            bytesReceived += chunk.length;
            opts.onProgress?.({ bytesReceived, totalBytes });
          });
          res.pipe(out);
          out.on("finish", () => {
            try {
              out.close();
            } catch {
              /* ignore */
            }
            ok();
          });
        },
      );

      req.on("timeout", () => {
        req.destroy();
        fail(new Error("Download timed out"));
      });
      req.on("error", fail);
    };

    get(fileUrl, maxRedirects);
  });
}
