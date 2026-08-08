import { fs, http, https, path } from "../lib/cep/node";

export type DownloadProgress = {
  bytesReceived: number;
  totalBytes: number | null;
};

export type DownloadToFileOpts = {
  timeoutMs?: number;
  onProgress?: (p: DownloadProgress) => void;
  maxRedirects?: number;
  /** Abort in-flight request (Cancel download). */
  signal?: AbortSignal;
  /** Sent on the first request only when `stripAuthOnRedirect` is true. */
  headers?: Record<string, string>;
  /**
   * When true (default if Authorization is present), do not forward
   * Authorization to a different host after a redirect (CDN / R2 signed URLs).
   */
  stripAuthOnRedirect?: boolean;
  /**
   * Called when a non-redirect error response has a body (e.g. JSON gate errors).
   * Throw to reject with a richer error.
   */
  onErrorBody?: (status: number, body: string) => void;
};

/**
 * Stream a remote URL to disk via CEP Node http(s). Follows redirects.
 * Prefer this over cepHttpRequest for large binaries (ffmpeg / ZXP / packs).
 */
export function downloadToFile(
  fileUrl: string,
  destPath: string,
  opts: DownloadToFileOpts = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const initialHeaders = { ...(opts.headers || {}) };
  const stripAuth =
    opts.stripAuthOnRedirect ?? Boolean(initialHeaders.Authorization || initialHeaders.authorization);

  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      reject(err);
      return;
    }

    if (opts.signal?.aborted) {
      reject(Object.assign(new Error("Download cancelled"), { code: "ABORTED" }));
      return;
    }

    const tmpPath = `${destPath}.part`;
    let settled = false;
    let activeReq: { destroy: (err?: Error) => void } | null = null;
    let activeRes: { destroy?: () => void; resume?: () => void } | null = null;

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener("abort", onAbort);
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
      opts.signal?.removeEventListener("abort", onAbort);
      try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        fs.renameSync(tmpPath, destPath);
        resolve();
      } catch (err) {
        fail(err);
      }
    };

    const onAbort = () => {
      try {
        activeRes?.destroy?.();
        activeRes?.resume?.();
      } catch {
        /* ignore */
      }
      try {
        activeReq?.destroy(Object.assign(new Error("Download cancelled"), { code: "ABORTED" }));
      } catch {
        /* ignore */
      }
      fail(Object.assign(new Error("Download cancelled"), { code: "ABORTED" }));
    };
    opts.signal?.addEventListener("abort", onAbort);

    const get = (
      url: string,
      redirectsLeft: number,
      headers: Record<string, string>,
      originalHost: string | null,
    ) => {
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
          headers,
        },
        (res) => {
          activeRes = res;
          const status = res.statusCode || 0;
          if (
            status >= 300 &&
            status < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            res.resume();
            const next = new URL(res.headers.location, url).toString();
            const nextHost = new URL(next).hostname;
            const nextHeaders = { ...headers };
            if (
              stripAuth &&
              originalHost &&
              nextHost.toLowerCase() !== originalHost.toLowerCase()
            ) {
              delete nextHeaders.Authorization;
              delete nextHeaders.authorization;
            }
            get(next, redirectsLeft - 1, nextHeaders, originalHost);
            return;
          }
          if (status < 200 || status >= 300) {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer | string) => {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            });
            res.on("end", () => {
              const body = Buffer.concat(chunks).toString("utf8");
              try {
                opts.onErrorBody?.(status, body);
              } catch (err) {
                fail(err);
                return;
              }
              fail(new Error(`Download failed (${status})`));
            });
            res.on("error", fail);
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
            if (opts.signal?.aborted) return;
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
            if (opts.signal?.aborted) {
              fail(Object.assign(new Error("Download cancelled"), { code: "ABORTED" }));
              return;
            }
            ok();
          });
        },
      );

      activeReq = req;
      req.on("timeout", () => {
        req.destroy();
        fail(new Error("Download timed out"));
      });
      req.on("error", fail);
    };

    let startHost: string | null = null;
    try {
      startHost = new URL(fileUrl).hostname;
    } catch {
      /* ignore */
    }
    get(fileUrl, maxRedirects, initialHeaders, startHost);
  });
}
