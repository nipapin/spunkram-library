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
 * - error   — product/infra failure that may affect many users → backend
 * - warning — recoverable; not sent
 * - info    — diagnostic; not sent
 *
 * Sent: pack download timeouts, host EvalScript, failed generate/apply, crashes.
 * Not sent: offline, wrong password, credits/auth, “open a sequence”.
 */
export type SupportSeverity = "error" | "warning" | "info";

/** User-local / expected — never a support alert. */
const NON_CRITICAL_CODES = new Set([
  "UNAUTHORIZED",
  "GENERATION_LIMIT_REACHED",
  "SUBSCRIPTION_REQUIRED",
  "NOT_OWNED",
  "DEVICE_LIMIT",
  "INVALID_CODE",
  "INVALID_AUTH",
  "NO_CREDENTIALS",
  "RATE_LIMITED",
  "ABORTED",
  "CANCELLED",
  "NO_CONNECTION",
  "TIMEOUT",
  "NO_SUCCESS_LOAD",
  "NO_ACTIVE_SEQUENCE",
  "NO_ACTIVE_COMP",
  "NO_AUDIO",
  "NO_INOUT",
  "NO_WORK_AREA",
  "NO_CACHE",
  "MOGRT_NOT_SUPPORTED_IN_AE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ERR_NETWORK",
  "ERR_INTERNET_DISCONNECTED",
  "ERR_NAME_NOT_RESOLVED",
  "HTTP_401",
  "HTTP_402",
  "HTTP_403",
  "HTTP_429",
]);

/** Client-only 4xx: auth, billing, not found. Timeouts (408) and our 400s can still alert. */
const SKIP_HTTP_STATUSES = new Set([401, 402, 403, 404, 429]);

const NON_CRITICAL_PATTERNS = [
  /please sign in/i,
  /sign in required/i,
  /no generations left/i,
  /active subscription is required/i,
  /subscription or generation credits/i,
  /login (cancelled|timed out)/i,
  /session expired/i,
  /invalid email or token/i,
  /wrong password/i,
  /invalid (email|token|code|auth)/i,
  /^cancelled$/i,
  /^download cancelled$/i,
  /open a sequence/i,
  /open a composition/i,
  /set in and out/i,
  /set a work area/i,
  /no pack loaded/i,
  /open this panel inside/i,
  /sign in with an active subscription/i,
  /fix connection/i,
  /enotfound/i,
  /eai_again/i,
  /enetunreach/i,
  /failed to fetch/i,
  /networkerror/i,
  /net::err_(?:internet_disconnected|name_not_resolved|address_unreachable|network_changed)/i,
  /no_connection/i,
  /getaddrinfo/i,
  /err_internet_disconnected/i,
  /null is not an object/i,
];

/** CEP / Chromium junk from global handlers — never product alerts. */
const GLOBAL_NOISE_PATTERNS = [
  /resizeobserver loop/i,
  /^script error\.?$/i,
  /loading chunk \d+/i,
  /chunkloaderror/i,
  /possible side-effect in debug-evaluate/i,
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

function extraCode(extra?: SupportExtra): string | undefined {
  if (!extra) return undefined;
  for (const key of ["error_code", "api_code", "reason", "code"] as const) {
    const v = extra[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function httpStatusFrom(message: string, extra?: SupportExtra): number | null {
  const raw = extra?.http_status;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  const m =
    message.match(/\bHTTP[_ ](\d{3})\b/i) ||
    message.match(/\b(?:download|diff download) failed\s*\((\d{3})\)/i) ||
    message.match(/\((\d{3})\)\s*$/);
  return m ? Number(m[1]) : null;
}

function errnoFrom(message: string): string | undefined {
  const m = message.match(
    /\b(E(?:TIMEDOUT|SOCKETTIMEDOUT|CONNREFUSED|CONNRESET|CONNABORTED|NOTFOUND|PIPE|PROTO|HOSTUNREACH|NETUNREACH|NETDOWN|AI_AGAIN|ACCES|PERM|NOENT|NOSPC))\b/,
  );
  return m?.[1];
}

/**
 * True for environmental / user-fixable / expected API outcomes.
 * Those must not become Telegram alerts.
 */
function isNonCritical(message: string, code?: string, extra?: SupportExtra): boolean {
  const trimmed = message.trim();
  if (NON_CRITICAL_CODES.has(trimmed.toUpperCase())) return true;

  const codes = [code, extraCode(extra), errnoFrom(message)].filter(
    (c): c is string => Boolean(c),
  );
  if (codes.some((c) => NON_CRITICAL_CODES.has(c.toUpperCase()))) return true;

  const status = httpStatusFrom(message, extra);
  if (status != null && SKIP_HTTP_STATUSES.has(status)) return true;

  const blob = [message, ...codes].join("\n");
  return NON_CRITICAL_PATTERNS.some((re) => re.test(blob));
}

function isGlobalNoise(message: string): boolean {
  return GLOBAL_NOISE_PATTERNS.some((re) => re.test(message));
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
 * Posts product/infra failures (pack timeout, EvalScript, generate/apply).
 * Skips offline, auth/credits, and user-guidance. Never throws.
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

    const { severity, extra } = normalizeOptions(opts);
    if (severity !== "error") return Promise.resolve();
    if (isNonCritical(parts.message, parts.code, extra)) return Promise.resolve();
    if (wasRecentlySent(severity, actionName, parts.message)) return Promise.resolve();

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

/** Global uncaught error / rejection handlers (idempotent). Noise is dropped. */
export function installGlobalHandlers(): void {
  if (handlersInstalled || typeof window === "undefined") return;
  handlersInstalled = true;

  window.addEventListener("error", (event) => {
    const err = event.error ?? event.message;
    const parts = extractErrorParts(err);
    if (isGlobalNoise(parts.message) || isNonCritical(parts.message, parts.code)) {
      return;
    }
    void reportError("uncaught", err, {
      severity: "error",
      filename: event.filename || null,
      lineno: event.lineno ?? null,
      colno: event.colno ?? null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const parts = extractErrorParts(event.reason);
    if (isGlobalNoise(parts.message) || isNonCritical(parts.message, parts.code)) {
      return;
    }
    void reportError("unhandledrejection", event.reason, { severity: "error" });
  });
}
