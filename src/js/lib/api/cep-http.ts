import { http, https } from "@/lib/cep/node";

export type HttpResult = {
  ok: boolean;
  text: string;
  status: number;
  error?: "NO_CONNECTION" | "TIMEOUT" | "NO_SUCCESS_LOAD";
};

function nodeRequest(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<HttpResult> {
  return new Promise((resolve) => {
    let settled = false;
    let req: ReturnType<typeof http.request> | undefined;
    let response: import("http").IncomingMessage | undefined;
    const finish = (result: HttpResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(result);
      if (!result.ok && result.status === 0) {
        response?.destroy();
        req?.destroy();
      }
    };
    // Socket timeouts do not bound DNS/connect time or a trickling response.
    const deadline = setTimeout(
      () => finish({ ok: false, text: "", status: 0, error: "TIMEOUT" }),
      init.timeoutMs ?? 20000,
    );
    try {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      if (typeof lib?.request !== "function") {
        finish({ ok: false, text: "", status: 0, error: "NO_CONNECTION" });
        return;
      }

      const timeoutMs = init.timeoutMs ?? 20000;
      const headers: Record<string, string> = { ...(init.headers || {}) };
      if (init.body != null && headers["Content-Length"] == null && headers["content-length"] == null) {
        headers["Content-Length"] = String(Buffer.byteLength(init.body));
      }
      req = lib.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          method: init.method || "GET",
          headers,
          timeout: timeoutMs,
        },
        (res) => {
          response = res;
          if (settled) { res.destroy(); return; }
          const chunks: Buffer[] = [];
          const interrupted = () =>
            finish({ ok: false, text: "", status: 0, error: "NO_CONNECTION" });
          res.on("error", interrupted);
          res.on("aborted", interrupted);
          res.on("close", () => { if (!res.complete) interrupted(); });
          res.on("data", (chunk: Buffer | string) => {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          });
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const status = res.statusCode || 0;
            if (status >= 200 && status < 300) {
              finish({ ok: true, text, status });
            } else {
              finish({ ok: false, text, status, error: "NO_SUCCESS_LOAD" });
            }
          });
        },
      );

      req.on("timeout", () => {
        finish({ ok: false, text: "", status: 0, error: "TIMEOUT" });
      });
      req.on("error", () => {
        finish({ ok: false, text: "", status: 0, error: "NO_CONNECTION" });
      });

      if (init.body) req.write(init.body);
      req.end();
    } catch {
      finish({ ok: false, text: "", status: 0, error: "NO_CONNECTION" });
    }
  });
}

function xhrRequest(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<HttpResult> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(init.method || "GET", url, true);
      xhr.timeout = init.timeoutMs ?? 20000;
      if (init.headers) {
        for (const [key, value] of Object.entries(init.headers)) {
          xhr.setRequestHeader(key, value);
        }
      }
      xhr.ontimeout = () =>
        resolve({ ok: false, text: "", status: 0, error: "TIMEOUT" });
      xhr.onerror = () =>
        resolve({ ok: false, text: "", status: 0, error: "NO_CONNECTION" });
      xhr.onabort = xhr.onerror;
      xhr.onload = () => {
        const status = xhr.status;
        const text = xhr.responseText || "";
        if (status >= 200 && status < 300) {
          resolve({ ok: true, text, status });
        } else {
          resolve({ ok: false, text, status, error: "NO_SUCCESS_LOAD" });
        }
      };
      xhr.send(init.body ?? null);
    } catch {
      resolve({ ok: false, text: "", status: 0, error: "NO_CONNECTION" });
    }
  });
}

/**
 * CEP-friendly HTTP: prefer Node.js (no CORS), then XHR like Spunkram Beta.
 */
export async function cepHttpRequest(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<HttpResult> {
  const expiresAt = Date.now() + (init.timeoutMs ?? 20000);
  const fallback = () => {
    const remaining = expiresAt - Date.now();
    return remaining > 0
      ? xhrRequest(url, { ...init, timeoutMs: remaining })
      : Promise.resolve<HttpResult>({ ok: false, text: "", status: 0, error: "TIMEOUT" });
  };
  if (typeof window !== "undefined" && window.cep) {
    const viaNode = await nodeRequest(url, init);
    if (viaNode.ok || viaNode.error === "TIMEOUT" || viaNode.error === "NO_SUCCESS_LOAD") {
      return viaNode;
    }
    return fallback();
  }

  // Browser / Vite preview fallback
  return new Promise<HttpResult>((resolve) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (result: HttpResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, text: "", status: 0, error: "TIMEOUT" });
      controller.abort();
    }, Math.max(0, expiresAt - Date.now()));
    void (async () => {
      try {
        const res = await fetch(url, {
          method: init.method || "GET",
          headers: init.headers,
          body: init.body,
          signal: controller.signal,
        });
        const text = await res.text();
        if (!res.ok) {
          finish({ ok: false, text, status: res.status, error: "NO_SUCCESS_LOAD" });
        } else {
          finish({ ok: true, text, status: res.status });
        }
      } catch (err) {
        if (settled) return;
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError") {
          finish({ ok: false, text: "", status: 0, error: "TIMEOUT" });
        } else {
          finish(await fallback());
        }
      }
    })();
  });
}
