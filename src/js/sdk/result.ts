import type { MfResult } from "./types";

export function ok<T>(data: T): MfResult<T> {
  return { ok: true, data };
}

export function okVoid(): MfResult<void> {
  return { ok: true, data: undefined as void };
}

export function fail(error: string, code?: string): MfResult<never> {
  return { ok: false, error, code };
}

export async function wrap<T>(fn: () => Promise<T>): Promise<MfResult<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    let error = "Unknown error";
    let code: string | undefined;
    if (e instanceof Error) {
      error = e.message || e.name || "Error";
    } else if (typeof e === "string" && e.trim()) {
      error = e;
    } else if (e && typeof e === "object") {
      const o = e as { message?: unknown; name?: unknown; error?: unknown };
      if (typeof o.message === "string" && o.message) error = o.message;
      else if (typeof o.error === "string" && o.error) error = o.error;
      else {
        try {
          error = JSON.stringify(e).slice(0, 500);
        } catch {
          error = "Unknown error";
        }
      }
      if (typeof o.name === "string") code = o.name;
    } else if (e != null) {
      error = String(e);
    }
    // Avoid reporting the literal "null" / "undefined" from bad rejections
    if (error === "null" || error === "undefined") {
      error = "Host script returned no result";
    }
    return fail(error, code);
  }
}
