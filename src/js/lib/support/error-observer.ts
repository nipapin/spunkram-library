import { apiUrl, SUPPORT_ENDPOINT } from "@/api/config";
import { getUserIdentity } from "@/api/user";
import { cepHttpRequest } from "@/lib/api/cep-http";
import { collectSupportMeta } from "./collect-meta";

const DEDUPE_WINDOW_MS = 60_000;

/** Expected business errors — do not spam Telegram. */
const SKIP_CODES = new Set([
  "UNAUTHORIZED",
  "GENERATION_LIMIT_REACHED",
  "SUBSCRIPTION_REQUIRED",
  "NOT_OWNED",
  "DEVICE_LIMIT",
  "INVALID_CODE",
  "RATE_LIMITED",
]);

const SKIP_MESSAGE_PATTERNS = [
  /please sign in/i,
  /no generations left/i,
  /active subscription is required/i,
  /login (cancelled|timed out)/i,
  /session expired/i,
];

export type SupportExtra = Record<string, string | number | boolean | null>;

type ReportPayload = {
  action: string;
  error: string;
  error_code?: string;
  stack?: string;
  extension_version: string;
  host: {
    appId: string;
    appName?: string;
    appVersion: string;
  };
  os: string;
  locale?: string;
  client: "spunkram-cep";
  occurred_at: string;
  extra?: SupportExtra;
};

const recentKeys = new Map<string, number>();
let handlersInstalled = false;

function extractErrorParts(err: unknown): {
  message: string;
  code?: string;
  stack?: string;
} {
  if (err == null) return { message: "Unknown error" };
  if (typeof err === "string") return { message: err };

  if (err instanceof Error) {
    const code =
      "code" in err && typeof (err as { code?: unknown }).code === "string"
        ? (err as { code: string }).code
        : undefined;
    return {
      message: err.message || err.name || "Error",
      code,
      stack: err.stack,
    };
  }

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const message =
      (typeof o.message === "string" && o.message) ||
      (typeof o.error === "string" && o.error) ||
      JSON.stringify(err).slice(0, 500);
    const code =
      (typeof o.code === "string" && o.code) ||
      (typeof o.error === "string" && o.error) ||
      undefined;
    const stack = typeof o.stack === "string" ? o.stack : undefined;
    return { message, code, stack };
  }

  return { message: String(err) };
}

function shouldSkip(message: string, code?: string): boolean {
  if (code && SKIP_CODES.has(code)) return true;
  if (SKIP_MESSAGE_PATTERNS.some((re) => re.test(message))) return true;
  return false;
}

function dedupeKey(action: string, message: string): string {
  return `${action}::${message}`;
}

function isDuplicate(action: string, message: string): boolean {
  const key = dedupeKey(action, message);
  const now = Date.now();
  const prev = recentKeys.get(key);
  if (prev && now - prev < DEDUPE_WINDOW_MS) return true;
  recentKeys.set(key, now);

  // Opportunistic prune
  if (recentKeys.size > 200) {
    for (const [k, ts] of recentKeys) {
      if (now - ts >= DEDUPE_WINDOW_MS) recentKeys.delete(k);
    }
  }
  return false;
}

async function postReport(payload: ReportPayload): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  try {
    const token = getUserIdentity()?.token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // ignore — optional auth
  }

  await cepHttpRequest(apiUrl(SUPPORT_ENDPOINT), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    timeoutMs: 8000,
  });
}

/**
 * Fire-and-forget support report. Never throws to callers.
 */
export function reportError(
  action: string,
  error: unknown,
  extra?: SupportExtra,
): void {
  try {
    const actionName = (action || "unknown").trim().slice(0, 200);
    const parts = extractErrorParts(error);
    if (!parts.message || shouldSkip(parts.message, parts.code)) return;
    if (isDuplicate(actionName, parts.message)) return;

    const meta = collectSupportMeta();
    const payload: ReportPayload = {
      action: actionName,
      error: parts.message.slice(0, 4000),
      error_code: parts.code?.slice(0, 128),
      stack: parts.stack?.slice(0, 4000),
      ...meta,
      extra,
    };

    void postReport(payload).catch(() => {
      // Silent — reporting must never disrupt the panel.
    });
  } catch {
    // Silent
  }
}

/** Global uncaught error / rejection handlers (idempotent). */
export function installGlobalHandlers(): void {
  if (handlersInstalled || typeof window === "undefined") return;
  handlersInstalled = true;

  window.addEventListener("error", (event) => {
    const err = event.error ?? event.message;
    reportError("uncaught", err, {
      filename: event.filename || null,
      lineno: event.lineno ?? null,
      colno: event.colno ?? null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError("unhandledrejection", event.reason);
  });
}
