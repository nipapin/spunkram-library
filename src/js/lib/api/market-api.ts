/**
 * Shared market / auth helpers (no AtomX runtime).
 */
import { openLinkInBrowser } from "@/lib/utils/bolt";

export type ApiErrorCode =
  | "NO_CONNECTION"
  | "TIMEOUT"
  | "NO_SUCCESS_LOAD"
  | "WRONG_WITH_PARAMS"
  | string;

/** @deprecated Prefer MotionflowDevice from auth-context. Kept for fingerprint helpers. */
export type AuthDevice = {
  usid: string;
  ip: string;
  user_fingerprint: string;
};

export function authErrorMessage(code: ApiErrorCode | undefined): string {
  switch (code) {
    case "WRONG_WITH_PARAMS":
      return "Something wrong with parameters";
    case "NO_SUCCESS_LOAD":
      return "Unable to load server response";
    case "NO_CREDENTIALS":
      return "No credentials found";
    case "SERVER_ERROR":
      return "Something is wrong on the server";
    case "NO_CONNECTION":
      return "Fix connection and try again";
    case "TIMEOUT":
      return "Too long no response, try later";
    case "INVALID_AUTH":
      return "Invalid email or token";
    case "INVALID_USID":
      return "No token — please relog";
    case "MISSING_PARAMS":
      return "Missing parameters";
    case "LIMIT_USED_PC":
      return "Device limit exceeded for this subscription";
    case "WRONG_MAC_ADDR":
      return "MAC address doesn't match — please relog";
    case "DEPRECATED_CODE":
      return "Validity of the code has expired";
    case "UNAUTHORIZED":
      return "Please sign in again";
    default:
      return code ? String(code) : "Unknown error";
  }
}

export function openYoutube(videoId: string): void {
  if (!videoId) return;
  openLinkInBrowser(`https://www.youtube.com/watch?v=${videoId}`);
}

export function normalizeDevices(
  devices: AuthDevice[] | Record<string, AuthDevice> | undefined,
): AuthDevice[] {
  if (!devices) return [];
  if (Array.isArray(devices)) return devices;
  return Object.values(devices);
}

export function parseDeviceFingerprint(raw: string): {
  mac?: string;
  user?: string;
  os?: string;
} {
  try {
    return JSON.parse(raw) as { mac?: string; user?: string; os?: string };
  } catch {
    return {};
  }
}
