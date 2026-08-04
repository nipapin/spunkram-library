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
    const error = e instanceof Error ? e.message : String(e);
    const code =
      e && typeof e === "object" && "name" in e
        ? String((e as { name?: string }).name)
        : undefined;
    return fail(error, code);
  }
}
