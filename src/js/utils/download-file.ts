import { fs, http, https, os, path } from "../lib/cep/node";

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
  /** HTTP method (default GET). Use POST for pack diff. */
  method?: "GET" | "POST";
  /** Request body (JSON string or Buffer) — only for methods that send a body. */
  body?: string | Buffer;
};

type NodeWriteStream = ReturnType<typeof fs.createWriteStream>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBusyFsError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

function abortedError(): Error {
  return Object.assign(new Error("Download cancelled"), { code: "ABORTED" });
}

function isAbortLike(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err === "object") {
    const o = err as { code?: unknown; name?: unknown; message?: unknown };
    if (o.code === "ABORTED" || o.code === "ABORT_ERR" || o.name === "AbortError") return true;
    if (typeof o.message === "string" && /cancell?ed/i.test(o.message)) return true;
  }
  return typeof err === "string" && /cancell?ed/i.test(err);
}

function unlinkBestEffort(filePath: string): void {
  try {
    if (filePath && typeof fs.existsSync === "function" && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    /* Windows: still locked by AV / previous stream */
  }
}

function uniquePartPath(destPath: string, dir?: string): string {
  const rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const base = path.basename(destPath);
  return path.join(dir || path.dirname(destPath), `${base}.${rand}.part`);
}

function destroyStream(stream: NodeWriteStream | null | undefined): void {
  if (!stream) return;
  try {
    if (typeof stream.destroy === "function") stream.destroy();
    else if (typeof stream.close === "function") stream.close();
    else if (typeof stream.end === "function") stream.end();
  } catch {
    /* ignore */
  }
}

/** Wait until the fd is released so Windows will allow unlink/rename. */
function waitForClose(
  stream: NodeWriteStream | null | undefined,
  mode: "close" | "destroy" = "destroy",
  timeoutMs = 2000,
): Promise<void> {
  return new Promise((resolve) => {
    if (!stream) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const alreadyGone =
      Boolean((stream as { destroyed?: boolean }).destroyed) ||
      Boolean((stream as { closed?: boolean }).closed);
    if (alreadyGone) {
      finish();
      return;
    }
    const timer = setTimeout(finish, timeoutMs);
    stream.once("close", () => {
      clearTimeout(timer);
      finish();
    });
    stream.once("error", () => {
      clearTimeout(timer);
      finish();
    });
    if (mode === "destroy") destroyStream(stream);
  });
}

function openWriteStream(filePath: string): Promise<NodeWriteStream> {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    const onOpen = () => {
      stream.removeListener("error", onError);
      resolve(stream);
    };
    const onError = (err: Error) => {
      stream.removeListener("open", onOpen);
      destroyStream(stream);
      reject(err);
    };
    stream.once("open", onOpen);
    stream.once("error", onError);
  });
}

/**
 * Open a unique `.part` next to dest (retry on Windows EPERM/EBUSY from
 * leftover locks / Defender). Last attempts fall back to os.tmpdir().
 */
async function openPartWriteStream(
  destPath: string,
  signal?: AbortSignal,
): Promise<{ stream: NodeWriteStream; tmpPath: string }> {
  unlinkBestEffort(`${destPath}.part`);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (signal?.aborted) {
      throw abortedError();
    }
    const useTmpDir = attempt >= 3 && typeof os?.tmpdir === "function";
    const dir = useTmpDir ? os.tmpdir() : path.dirname(destPath);
    const tmpPath = uniquePartPath(destPath, dir);
    try {
      if (typeof fs.existsSync === "function" && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const stream = await openWriteStream(tmpPath);
      return { stream, tmpPath };
    } catch (err) {
      lastErr = err;
      unlinkBestEffort(tmpPath);
      if (!isBusyFsError(err)) throw err;
      await sleep(80 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function replaceFile(from: string, to: string): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      if (typeof fs.existsSync === "function" && fs.existsSync(to)) {
        fs.unlinkSync(to);
      }
      fs.renameSync(from, to);
      return;
    } catch (err) {
      lastErr = err;
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code === "EXDEV") break;
      if (!isBusyFsError(err)) throw err;
      await sleep(80 * 2 ** attempt);
    }
  }
  if (typeof fs.copyFileSync === "function") {
    fs.copyFileSync(from, to);
    unlinkBestEffort(from);
    return;
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

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
  const method = (opts.method || "GET").toUpperCase() as "GET" | "POST";
  const initialHeaders = { ...(opts.headers || {}) };
  const stripAuth =
    opts.stripAuthOnRedirect ??
    Boolean(initialHeaders.Authorization || initialHeaders.authorization);

  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      reject(err);
      return;
    }

    if (opts.signal?.aborted) {
      reject(abortedError());
      return;
    }

    let tmpPath = "";
    let settled = false;
    let activeReq: { destroy: (err?: Error) => void } | null = null;
    let activeRes: { destroy?: () => void; resume?: () => void } | null = null;
    let out: NodeWriteStream | null = null;

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener("abort", onAbort);
      // Cancel destroys the write stream; Windows often emits EPERM on that
      // open/.part handle. Never let that race replace ABORTED.
      const outErr =
        opts.signal?.aborted || isAbortLike(err) ? abortedError() : err;
      try {
        activeRes?.destroy?.();
        activeRes?.resume?.();
      } catch {
        /* ignore */
      }
      try {
        activeReq?.destroy();
      } catch {
        /* ignore */
      }
      const stream = out;
      out = null;
      const part = tmpPath;
      void waitForClose(stream, "destroy").then(() => {
        unlinkBestEffort(part);
        reject(outErr instanceof Error ? outErr : new Error(String(outErr)));
      });
    };
    const ok = () => {
      if (settled) return;
      const stream = out;
      out = null;
      const part = tmpPath;
      void waitForClose(stream, "close", 500).then(async () => {
        if (settled) return;
        if (opts.signal?.aborted) {
          unlinkBestEffort(part);
          fail(abortedError());
          return;
        }
        try {
          await replaceFile(part, destPath);
        } catch (err) {
          unlinkBestEffort(part);
          fail(opts.signal?.aborted ? abortedError() : err);
          return;
        }
        if (settled) return;
        settled = true;
        opts.signal?.removeEventListener("abort", onAbort);
        resolve();
      });
    };

    const onAbort = () => {
      fail(abortedError());
    };
    opts.signal?.addEventListener("abort", onAbort);
    if (opts.signal?.aborted) {
      fail(abortedError());
      return;
    }

    const request = (
      url: string,
      redirectsLeft: number,
      headers: Record<string, string>,
      originalHost: string | null,
      allowBody: boolean,
    ) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch (err) {
        fail(err);
        return;
      }
      const lib = parsed.protocol === "https:" ? https : http;
      if (typeof lib?.request !== "function" && typeof lib?.get !== "function") {
        fail(new Error("Node http(s) unavailable"));
        return;
      }

      const bodyBuf =
        allowBody && opts.body != null
          ? typeof opts.body === "string"
            ? Buffer.from(opts.body, "utf8")
            : opts.body
          : null;

      const reqHeaders = { ...headers };
      if (bodyBuf) {
        reqHeaders["Content-Length"] = String(bodyBuf.length);
        if (!reqHeaders["Content-Type"] && !reqHeaders["content-type"]) {
          reqHeaders["Content-Type"] = "application/json";
        }
      }

      const reqOpts = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: allowBody ? method : "GET",
        timeout: timeoutMs,
        headers: reqHeaders,
      };

      // CEP Node typings are loose; keep handler untyped like the original GET path.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleRes = (res: any) => {
        activeRes = res;
        const status = res.statusCode || 0;
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const loc = Array.isArray(res.headers.location)
            ? res.headers.location[0]
            : res.headers.location;
          const next = new URL(String(loc), url).toString();
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
          request(next, redirectsLeft - 1, nextHeaders, originalHost, false);
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

        try {
          res.pause?.();
        } catch {
          /* ignore */
        }

        void openPartWriteStream(destPath, opts.signal)
          .then(({ stream, tmpPath: partPath }) => {
            if (settled || opts.signal?.aborted) {
              destroyStream(stream);
              unlinkBestEffort(partPath);
              if (!settled) fail(abortedError());
              return;
            }
            tmpPath = partPath;
            out = stream;
            out.on("error", fail);
            res.on("error", fail);
            res.on("data", (chunk: Buffer) => {
              if (opts.signal?.aborted) return;
              bytesReceived += chunk.length;
              opts.onProgress?.({ bytesReceived, totalBytes });
            });
            res.pipe(out);
            out.on("finish", () => {
              if (opts.signal?.aborted) {
                fail(abortedError());
                return;
              }
              ok();
            });
          })
          .catch((err) => {
            try {
              res.destroy?.();
            } catch {
              /* ignore */
            }
            fail(opts.signal?.aborted ? abortedError() : err);
          });
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const req: any =
        typeof lib.request === "function"
          ? lib.request(reqOpts, handleRes)
          : lib.get(reqOpts, handleRes);

      activeReq = req;
      req.on("timeout", () => {
        req.destroy();
        fail(new Error("Download timed out"));
      });
      req.on("error", fail);
      if (bodyBuf) {
        req.write(bodyBuf);
      }
      req.end();
    };

    let startHost: string | null = null;
    try {
      startHost = new URL(fileUrl).hostname;
    } catch {
      /* ignore */
    }
    request(fileUrl, maxRedirects, initialHeaders, startHost, true);
  });
}
