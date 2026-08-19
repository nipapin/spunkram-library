import { SUPPORT_ENDPOINT } from "@/api/config";
import { getUserIdentity } from "@/api/user";
import { cepHttpRequest, type HttpResult } from "@/lib/api/cep-http";
import { collectSupportMeta } from "./collect-meta";

const DEDUPE_WINDOW_MS = 60_000;

/**
 * Absolute production URL — CEP Node `http` cannot POST relative paths.
 */
const SUPPORT_REPORT_URL = `https://motionflow.pro${SUPPORT_ENDPOINT}`;

/**
 * Severity:
 * - error   — irreversible failure of the intended action → Telegram
 * - warning — recoverable / degraded; user can continue → local only
 * - info    — diagnostic noise → local only
 */
export type SupportSeverity = "error" | "warning" | "info";

/** Expected business / entitlement outcomes — not product breakages. */
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
  /^cancelled$/i,
];

/** User guidance (missing prerequisite) — not a broken product path. */
const USER_GUIDANCE_PATTERNS = [
  /open a sequence/i,
  /open a composition/i,
  /no pack loaded/i,
  /open this panel inside/i,
  /sign in with an active subscription/i,
];

export type SupportExtra = Record<string, string | number | boolean | null>;

/** Options: optional `severity` + any flat extra fields. */
export type SupportReportOptions = SupportExtra & {
  severity?: SupportSeverity;
};

type ReportPayload = {
  action: string;
  error: string;
  error_code?: string;
  severity: SupportSeverity;
  stack?: string;
  extension_name: string;
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

function shouldSkipBusiness(message: string, code?: string): boolean {
  if (code && SKIP_CODES.has(code)) return true;
  if (SKIP_MESSAGE_PATTERNS.some((re) => re.test(message))) return true;
  return false;
}

function isUserGuidance(message: string): boolean {
  return USER_GUIDANCE_PATTERNS.some((re) => re.test(message));
}

function normalizeOptions(opts?: SupportReportOptions): {
  severity: SupportSeverity;
  extra?: SupportExtra;
} {
  if (!opts) return { severity: "error" };
  const { severity = "error", ...rest } = opts;
  const extra: SupportExtra = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      extra[k] = v;
    } else if (v !== undefined) {
      extra[k] = String(v);
    }
  }
  return {
    severity,
    extra: Object.keys(extra).length ? extra : undefined,
  };
}

function dedupeKey(severity: SupportSeverity, action: string, message: string): string {
  return `${severity}::${action}::${message}`;
}

/** True if we already successfully sent this report recently. */
function wasRecentlySent(
  severity: SupportSeverity,
  action: string,
  message: string,
): boolean {
  const key = dedupeKey(severity, action, message);
  const prev = recentKeys.get(key);
  return Boolean(prev && Date.now() - prev < DEDUPE_WINDOW_MS);
}

function markSent(
  severity: SupportSeverity,
  action: string,
  message: string,
): void {
  const key = dedupeKey(severity, action, message);
  recentKeys.set(key, Date.now());
  if (recentKeys.size > 200) {
    const now = Date.now();
    for (const [k, ts] of recentKeys) {
      if (now - ts >= DEDUPE_WINDOW_MS) recentKeys.delete(k);
    }
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  try {
    const token = getUserIdentity()?.token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // optional auth
  }
  return headers;
}

async function postReport(payload: ReportPayload): Promise<HttpResult> {
  const body = JSON.stringify(payload);
  const headers = authHeaders();

  // 1) Absolute → CEP Node https (no CORS)
  const result = await cepHttpRequest(SUPPORT_REPORT_URL, {
    method: "POST",
    headers,
    body,
    timeoutMs: 12000,
  });

  return result;
}

function logResult(result: HttpResult): void {
  if (!result.ok) {
    console.warn(
      "[support] report failed →",
      SUPPORT_REPORT_URL,
      result.status,
      result.error,
      (result.text || "").slice(0, 200),
    );
  }
}

/**
 * Report a support event.
 * Only `severity: "error"` (default) is sent to the backend / Telegram.
 * Returns a promise so callers can await delivery (never throws).
 */
export function reportError(
  action: string,
  error: unknown,
  opts?: SupportReportOptions,
): Promise<void> {
  try {
    const actionName = (action || "unknown").trim().slice(0, 200);
    const parts = extractErrorParts(error);
    if (!parts.message) return Promise.resolve();
    if (shouldSkipBusiness(parts.message, parts.code)) return Promise.resolve();

    let { severity, extra } = normalizeOptions(opts);
    if (severity === "error" && isUserGuidance(parts.message)) {
      severity = "warning";
    }

    if (wasRecentlySent(severity, actionName, parts.message)) {
      return Promise.resolve();
    }

    if (severity !== "error") {
      return Promise.resolve();
    }

    const meta = collectSupportMeta();
    const payload: ReportPayload = {
      action: actionName,
      error: parts.message.slice(0, 4000),
      error_code: parts.code?.slice(0, 128),
      severity: "error",
      stack: parts.stack?.slice(0, 4000),
      ...meta,
      extra,
    };

    return postReport(payload)
      .then((result) => {
        logResult(result);
        // Only dedupe after a successful accept (202/2xx). Failed posts can retry.
        if (result.ok) {
          markSent(severity, actionName, parts.message);
        }
      })
      .catch((err) => {
        console.warn("[support] report threw", err);
      });
  } catch (err) {
    console.warn("[support] report setup failed", err);
    return Promise.resolve();
  }
}

/** Explicit warning helper (never Telegram). */
export function reportWarning(
  action: string,
  error: unknown,
  opts?: Omit<SupportReportOptions, "severity">,
): void {
  void reportError(action, error, { ...opts, severity: "warning" });
}

/** Explicit info helper (never Telegram). */
export function reportInfo(
  action: string,
  error: unknown,
  opts?: Omit<SupportReportOptions, "severity">,
): void {
  void reportError(action, error, { ...opts, severity: "info" });
}

/** Global uncaught error / rejection handlers (idempotent) — always severity error. */
export function installGlobalHandlers(): void {
  if (handlersInstalled || typeof window === "undefined") return;
  handlersInstalled = true;

  window.addEventListener("error", (event) => {
    const err = event.error ?? event.message;
    void reportError("uncaught", err, {
      severity: "error",
      filename: event.filename || null,
      lineno: event.lineno ?? null,
      colno: event.colno ?? null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    void reportError("unhandledrejection", event.reason, { severity: "error" });
  });
}
