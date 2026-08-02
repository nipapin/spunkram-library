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
    try {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const lib = isHttps ? https : http;
      if (typeof lib?.request !== "function") {
        resolve({ ok: false, text: "", status: 0, error: "NO_CONNECTION" });
        return;
      }

      const timeoutMs = init.timeoutMs ?? 20000;
      const req = lib.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          method: init.method || "GET",
          headers: init.headers,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer | string) => {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          });
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const status = res.statusCode || 0;
            if (status >= 200 && status < 300) {
              resolve({ ok: true, text, status });
            } else {
              resolve({ ok: false, text, status, error: "NO_SUCCESS_LOAD" });
            }
          });
        },
      );

      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, text: "", status: 0, error: "TIMEOUT" });
      });
      req.on("error", () => {
        resolve({ ok: false, text: "", status: 0, error: "NO_CONNECTION" });
      });

      if (init.body) req.write(init.body);
      req.end();
    } catch {
      resolve({ ok: false, text: "", status: 0, error: "NO_CONNECTION" });
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
  if (typeof window !== "undefined" && window.cep) {
    const viaNode = await nodeRequest(url, init);
    if (viaNode.ok || viaNode.error === "TIMEOUT" || viaNode.error === "NO_SUCCESS_LOAD") {
      return viaNode;
    }
    return xhrRequest(url, init);
  }

  // Browser / Vite preview fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      init.timeoutMs ?? 20000,
    );
    const res = await fetch(url, {
      method: init.method || "GET",
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, text, status: res.status, error: "NO_SUCCESS_LOAD" };
    }
    return { ok: true, text, status: res.status };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") {
      return { ok: false, text: "", status: 0, error: "TIMEOUT" };
    }
    return xhrRequest(url, init);
  }
}
