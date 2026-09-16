/**
 * Single session token source for all Motionflow CEP calls.
 * Opaque `mfcep_…` from device login — never invent secondary credentials.
 */
import {
  readActiveMotionflowAuth,
  removeAccountSession,
  writeMotionflowAuth,
} from "@/lib/api/preferences";
import { clearUserIdentity } from "@/api/user";
import { shouldWipeSharedVault } from "@/lib/api/shared-auth-session";

/** Wait for the sibling host to persist a rotated token after `device.revoked`. */
export const UNAUTHORIZED_WIPE_CONFIRM_MS = 800;

export function getSessionToken(): string | null {
  const t = readActiveMotionflowAuth().token?.trim();
  return t && t.startsWith("mfcep_") ? t : null;
}

let lastSentSessionToken: string | null = null;
let pendingWipeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWipeFailed = "";

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
  if (token) {
    lastSentSessionToken = token;
    headers.Authorization = `Bearer ${token}`;
  }
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

function readDiskToken(): string | null {
  try {
    return readActiveMotionflowAuth().token ?? null;
  } catch {
    return null;
  }
}

function keepSharedVault(): void {
  notify(reloadListeners);
}

/**
 * Wipe local session and notify UI (login screen). Safe to call repeatedly.
 * Aborts if the shared file already holds a different live token.
 */
export function clearSession(
  reason = "UNAUTHORIZED",
  failedToken?: string | null,
): void {
  const failed = failedToken ?? lastSentSessionToken;
  const disk = readActiveMotionflowAuth();
  if (
    !shouldWipeSharedVault({
      failedToken: failed,
      diskToken: disk.token,
    })
  ) {
    keepSharedVault();
    return;
  }

  const accountId = disk.id;
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

function confirmUnauthorizedWipe(reason: string, failedToken: string | null): void {
  pendingWipeTimer = null;
  pendingWipeFailed = "";
  if (
    !shouldWipeSharedVault({
      failedToken,
      diskToken: readDiskToken(),
    })
  ) {
    keepSharedVault();
    return;
  }
  clearSession(reason, failedToken);
}

/**
 * Call when any CEP API returns 401 or WS closes with 4401.
 * If `failedToken` is stale and the shared file already has a newer token
 * (the other Adobe host just signed in), keep the vault and reload.
 *
 * Server publishes `device.revoked` before the signing-in host writes the new
 * token, so a matching disk token waits briefly before wipe.
 */
export function handleUnauthorized(
  reason = "UNAUTHORIZED",
  failedToken?: string | null,
): void {
  const failed = (failedToken ?? lastSentSessionToken) || null;
  if (
    !shouldWipeSharedVault({
      failedToken: failed,
      diskToken: readDiskToken(),
    })
  ) {
    keepSharedVault();
    return;
  }

  if (typeof setTimeout !== "function") {
    confirmUnauthorizedWipe(reason, failed);
    return;
  }

  const failedKey = failed || "";
  if (pendingWipeTimer && pendingWipeFailed === failedKey) return;
  if (pendingWipeTimer) clearTimeout(pendingWipeTimer);
  pendingWipeFailed = failedKey;
  pendingWipeTimer = setTimeout(() => {
    confirmUnauthorizedWipe(reason, failed);
  }, UNAUTHORIZED_WIPE_CONFIRM_MS);
}
