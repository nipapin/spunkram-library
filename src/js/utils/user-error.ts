import { CaptionApiError, authErrorMessage } from "../styles/api";
import { ChapterApiError } from "./chapters";

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
 * Keeps already-friendly messages; rewrites cryptic host wording.
 */
export function friendlyErrorMessage(err: unknown): string {
  if (err == null || err === "") return "Something went wrong. Please try again.";

  const auth = authErrorMessage(err);
  if (auth) return auth;

  if (err instanceof ChapterApiError) {
    if (err.code === "GENERATION_LIMIT_REACHED") {
      return "No generations left. Upgrade your plan or buy extra credits.";
    }
    if (err.status === 401 || err.code === "UNAUTHORIZED") {
      return "Please sign in to continue.";
    }
    if (err.message && !/^HTTP\s+\d+/i.test(err.message)) return err.message;
  }

  if (err instanceof CaptionApiError) {
    if (err.message && !/^HTTP\s+\d+/i.test(err.message)) return err.message;
  }

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
  if (!msg || msg === "null" || msg === "undefined") {
    return "Something went wrong. Please try again.";
  }
  if (msg === "Cancelled") return msg;

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
  if (/could not read selection timing/i.test(msg) || /set in and out/i.test(msg) || /NO_INOUT/i.test(msg)) {
    return "Set In and Out points on the sequence, then try again.";
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
  if (/could not export audio/i.test(msg)) {
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
  if (/timed out|timeout/i.test(msg)) {
    return "Request timed out. Check your connection and try again.";
  }
  if (/failed to fetch|networkerror|net::err|no_connection/i.test(msg)) {
    return "Network error. Check your connection and try again.";
  }
  if (/ffmpeg/i.test(msg)) {
    return "Could not convert audio. Try again, or reinstall the extension.";
  }
  if (/^HTTP\s*\d+/i.test(msg)) {
    return "Server error. Please try again in a moment.";
  }

  return msg;
}
