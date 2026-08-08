/**
 * Single session token source for all Motionflow CEP calls.
 * Opaque `mfcep_…` from device login — never invent secondary credentials.
 */
import { readMotionflowAuth, writeMotionflowAuth } from "@/lib/api/preferences";
import { clearUserIdentity } from "@/api/user";

export function getSessionToken(): string | null {
  const t = readMotionflowAuth().token?.trim();
  return t && t.startsWith("mfcep_") ? t : null;
}

export function requireSessionToken(): string {
  const t = getSessionToken();
  if (!t) throw new Error("UNAUTHORIZED");
  return t;
}

/** Headers for authenticated CEP HTTP calls. */
export function sessionAuthHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extra || {}),
  };
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function hasSession(): boolean {
  return Boolean(getSessionToken());
}

type SessionExpiredListener = () => void;
const listeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Wipe local session and notify UI (login screen). Safe to call repeatedly. */
export function clearSession(reason = "UNAUTHORIZED"): void {
  try {
    writeMotionflowAuth({});
  } catch {
    /* ignore */
  }
  try {
    clearUserIdentity();
  } catch {
    /* ignore */
  }
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
  if (typeof console !== "undefined") {
    console.warn("[session] cleared:", reason);
  }
}

/** Call when any CEP API returns 401 or WS closes with 4401. */
export function handleUnauthorized(reason = "UNAUTHORIZED"): void {
  clearSession(reason);
}
