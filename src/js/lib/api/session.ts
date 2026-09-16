/**
 * Single session token source for all Motionflow CEP calls.
 * Opaque `mfcep_…` from device login — never invent secondary credentials.
 */
import {
  readMotionflowAuth,
  removeAccountSession,
  writeMotionflowAuth,
} from "@/lib/api/preferences";
import { clearUserIdentity } from "@/api/user";
import { shouldKeepSharedSession } from "@/lib/api/shared-auth-session";

export function getSessionToken(): string | null {
  const t = readMotionflowAuth().token?.trim();
  return t && t.startsWith("mfcep_") ? t : null;
}

let lastSentSessionToken: string | null = null;

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
  lastSentSessionToken = token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function hasSession(): boolean {
  return Boolean(getSessionToken());
}

type SessionExpiredListener = () => void;
const expiredListeners = new Set<SessionExpiredListener>();
const reloadListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

/** Other host wrote a newer token to the shared vault — reload instead of signing out. */
export function onSessionReload(listener: SessionExpiredListener): () => void {
  reloadListeners.add(listener);
  return () => reloadListeners.delete(listener);
}

function notify(listeners: Set<SessionExpiredListener>): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

/** Wipe local session and notify UI (login screen). Safe to call repeatedly. */
export function clearSession(reason = "UNAUTHORIZED"): void {
  let accountId: string | undefined;
  try {
    accountId = readMotionflowAuth().id;
  } catch {
    /* ignore */
  }
  try {
    writeMotionflowAuth({});
  } catch {
    /* ignore */
  }
  if (accountId) {
    try {
      removeAccountSession(accountId);
    } catch {
      /* ignore */
    }
  }
  try {
    clearUserIdentity();
  } catch {
    /* ignore */
  }
  notify(expiredListeners);
  if (typeof console !== "undefined") {
    console.warn("[session] cleared:", reason);
  }
}

/**
 * Call when any CEP API returns 401 or WS closes with 4401.
 * If `failedToken` is stale and the shared file already has a newer token
 * (the other Adobe host just signed in), keep the vault and reload.
 */
export function handleUnauthorized(
  reason = "UNAUTHORIZED",
  failedToken?: string | null,
): void {
  let diskToken: string | null = null;
  try {
    diskToken = readMotionflowAuth().token ?? null;
  } catch {
    diskToken = null;
  }
  if (
    shouldKeepSharedSession({
      failedToken: failedToken ?? lastSentSessionToken,
      diskToken,
    })
  ) {
    notify(reloadListeners);
    return;
  }
  clearSession(reason);
}
