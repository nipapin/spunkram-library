import { CaptionApiError, authErrorMessage } from "../styles/api";
import { ChapterApiError } from "./chapters";
import { cepHostAppId } from "../lib/utils/bolt";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NETWORK_ERROR = "Network error. Check your connection and try again.";
const TIMEOUT_ERROR = "Request timed out. Check your connection and try again.";
const SERVER_ERROR = "Server error. Please try again in a moment.";

const TIMEOUT_CODES = new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ERR_SOCKET_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "TIMEOUT",
]);

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
  "EPIPE",
  "ENOTCONN",
  "EHOSTDOWN",
  "EADDRNOTAVAIL",
  "ERR_NETWORK",
  "ERR_INTERNET_DISCONNECTED",
  "UND_ERR_SOCKET",
  "NO_CONNECTION",
  "ENETRESET",
]);

const SSL_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "EPROTO",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function collectErrorBits(err: unknown): { text: string; codes: string[] } {
  const texts: string[] = [];
  const codes: string[] = [];

  const visit = (value: unknown, depth: number) => {
    if (value == null || depth > 4) return;
    if (typeof value === "string") {
      texts.push(value);
      return;
    }
    if (typeof value !== "object") {
      texts.push(String(value));
      return;
    }
    const o = asRecord(value);
    if (!o) return;
    if (typeof o.code === "string" && o.code) codes.push(o.code);
    if (typeof o.errno === "string" && o.errno) codes.push(o.errno);
    if (typeof o.message === "string" && o.message) texts.push(o.message);
    if (typeof o.syscall === "string" && o.syscall) texts.push(o.syscall);
    if (Array.isArray(o.errors)) {
      for (const inner of o.errors) visit(inner, depth + 1);
    }
    if (o.cause) visit(o.cause, depth + 1);
  };

  visit(err, 0);
  return { text: texts.join("\n"), codes };
}

/** Node / TLS / IP / stack traces — never show these in the UI. */
function looksLikeInternalError(text: string): boolean {
  if (!text) return false;
  return (
    /\bE(?:TIMEDOUT|SOCKETTIMEDOUT|CONNREFUSED|CONNRESET|CONNABORTED|NOTFOUND|PIPE|PROTO|HOSTUNREACH|NETUNREACH|NETDOWN|AI_AGAIN|ACCES|PERM|NOENT|NOSPC|ADDRNOTAVAIL|NOTCONN|HOSTDOWN)\b/.test(
      text,
    ) ||
    /\b(?:ERR_|UND_ERR_|UV_)[A-Z0-9_]+\b/.test(text) ||
    /\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/.test(text) ||
    /\[[0-9a-fA-F:]+\]:\d{2,5}/.test(text) ||
    /\b(?:getaddrinfo|syscall|errno|socket hang up)\b/i.test(text) ||
    /\b(?:UNABLE_TO_|CERT_|DEPTH_ZERO_|self[- ]signed certificate)\b/i.test(text) ||
    /(?:^|\n)\s*(?:Error|TypeError|ReferenceError|AggregateError|SystemError):/i.test(text) ||
    /\bat\s+\S+\s+\([^)]+\.(?:js|ts|node):\d+/.test(text) ||
    /\.(?:js|ts|node):\d+:\d+/.test(text) ||
    /(?:^|\s)(?:connect|read|write|listen)\s+E[A-Z]+/i.test(text)
  );
}

function networkish(text: string, codes: string[]): "timeout" | "ssl" | "network" | null {
  if (codes.some((c) => TIMEOUT_CODES.has(c))) return "timeout";
  if (codes.some((c) => SSL_CODES.has(c))) return "ssl";
  if (codes.some((c) => NETWORK_CODES.has(c))) return "network";
  if (/\bETIMEDOUT\b|\bESOCKETTIMEDOUT\b|timed\s*out|timeout/i.test(text)) return "timeout";
  if (/self[- ]signed|certificate|UNABLE_TO_|CERT_|ERR_TLS_|ERR_SSL_/i.test(text)) return "ssl";
  if (
    /failed to fetch|networkerror|net::err|no_connection|enotfound|econnreset|econnrefused|eai_again|socket hang up|getaddrinfo|network is unreachable/i.test(
      text,
    )
  ) {
    return "network";
  }
  return null;
}

function mapTechnicalMessage(text: string, codes: string[]): string | null {
  const kind = networkish(text, codes);
  if (kind === "timeout") return TIMEOUT_ERROR;
  if (kind === "ssl") return "Secure connection failed. Check your network or VPN and try again.";
  if (kind === "network") return NETWORK_ERROR;

  if (codes.includes("ENOSPC") || /no space left|ENOSPC/i.test(text)) {
    return "Not enough disk space. Free some space and try again.";
  }
  if (codes.includes("EACCES") || codes.includes("EPERM") || /\bEACCES\b|\bEPERM\b/.test(text)) {
    return "Permission denied. Check the folder and try again.";
  }
  if (codes.includes("ENOENT") || /\bENOENT\b/.test(text)) {
    return "File not found. Try downloading again.";
  }
  if (/download failed\s*\(\d+\)|diff download failed\s*\(\d+\)|^HTTP\s*\d+/i.test(text)) {
    return SERVER_ERROR;
  }
  if (looksLikeInternalError(text)) return GENERIC_ERROR;
  return null;
}

/** Soft host failures the user can fix without support. */
export function isSoftHostError(err: unknown): boolean {
  if (err && typeof err === "object" && (err as { soft?: boolean }).soft) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const reason =
    err && typeof err === "object" && typeof (err as { reason?: unknown }).reason === "string"
      ? (err as { reason: string }).reason
      : "";
  if (
    reason === "NO_ACTIVE_SEQUENCE" ||
    reason === "NO_ACTIVE_COMP" ||
    reason === "NO_AUDIO" ||
    reason === "NO_INOUT" ||
    reason === "NO_WORK_AREA"
  ) {
    return true;
  }
  return (
    /open a sequence first/i.test(msg) ||
    /open a composition first/i.test(msg) ||
    /set in and out/i.test(msg) ||
    /set a work area/i.test(msg) ||
    /in\/out/i.test(msg) ||
    /work area/i.test(msg) ||
    /selected clip has no audio/i.test(msg) ||
    /no audio/i.test(msg) ||
    /could not read selection timing/i.test(msg)
  );
}

/**
 * Map raw API / ExtendScript / network errors to short copy for snackbars.
 * Never returns Node syscalls, IPs, TLS codes, or stack traces.
 */
export function friendlyErrorMessage(err: unknown): string {
  if (err == null || err === "") return GENERIC_ERROR;

  const auth = authErrorMessage(err);
  if (auth) return auth;

  const bits = collectErrorBits(err);
  const technical = mapTechnicalMessage(bits.text, bits.codes);
  // Prefer product copy for known API errors, but never leak internals from them.
  if (err instanceof ChapterApiError) {
    if (err.code === "GENERATION_LIMIT_REACHED") {
      return "No generations left. Upgrade your plan or buy extra credits.";
    }
    if (err.status === 401 || err.code === "UNAUTHORIZED") {
      return "Please sign in to continue.";
    }
    if (err.message && !/^HTTP\s+\d+/i.test(err.message) && !looksLikeInternalError(err.message)) {
      return err.message;
    }
    if (technical) return technical;
  }

  if (err instanceof CaptionApiError) {
    if (err.message && !/^HTTP\s+\d+/i.test(err.message) && !looksLikeInternalError(err.message)) {
      return err.message;
    }
    if (technical) return technical;
  }

  if (technical) return technical;

  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : typeof err === "object" &&
            err &&
            typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : String(err);

  const msg = raw.trim();
  if (!msg || msg === "null" || msg === "undefined") return GENERIC_ERROR;
  if (/^cancelled$/i.test(msg) || /^download cancelled$/i.test(msg)) return msg;

  if (/null is not an object/i.test(msg)) {
    return "Could not export audio from the In/Out range. Check In/Out or Work Area and try again.";
  }
  if (/selected clip has no audio/i.test(msg) || /selected layer has no audio/i.test(msg) || /reason:\s*NO_AUDIO/i.test(msg)) {
    return "No audio found in the In/Out range. Check the timeline mix and try again.";
  }
  if (/open a sequence first/i.test(msg)) {
    return "Open a sequence in Premiere Pro, then try again.";
  }
  if (/open a composition first/i.test(msg)) {
    return "Open a composition in After Effects, then try again.";
  }
  if (
    /could not read selection timing/i.test(msg) ||
    /set in and out/i.test(msg) ||
    /set in\/out or work area/i.test(msg) ||
    /NO_INOUT/i.test(msg) ||
    /no in\/out range/i.test(msg)
  ) {
    return cepHostAppId() === "AEFT"
      ? "Set a Work Area on the composition, then try again."
      : "Set In and Out points on the sequence, then try again.";
  }
  if (/set a work area/i.test(msg) || /NO_WORK_AREA/i.test(msg)) {
    return "Set a Work Area on the composition, then try again.";
  }
  if (/audio export preset|\.epr/i.test(msg)) {
    return "Audio export preset is missing. Reinstall the extension or set a preset in Settings.";
  }
  if (/audio export failed/i.test(msg)) {
    return "Audio export failed. Check the sequence has audio and try again.";
  }
  if (/could not export audio/i.test(msg) && !looksLikeInternalError(msg)) {
    return msg;
  }
  if (/no generations left|generation.?limit/i.test(msg)) {
    return "No generations left. Upgrade your plan or buy extra credits.";
  }
  if (/unauthorized|please sign in/i.test(msg)) {
    return "Please sign in to continue.";
  }
  if (/subscription required/i.test(msg)) {
    return "An active subscription is required.";
  }
  if (/ffmpeg/i.test(msg)) {
    return "Could not convert audio. Try again, or reinstall the extension.";
  }
  if (
    /unexpected end of json/i.test(msg) ||
    /host script returned (no result|invalid data)/i.test(msg) ||
    /host script failed/i.test(msg)
  ) {
    return msg;
  }

  if (looksLikeInternalError(msg)) return GENERIC_ERROR;
  return msg;
}
