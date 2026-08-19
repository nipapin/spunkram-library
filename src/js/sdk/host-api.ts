/** Host-facing MotionFlow API for the current Adobe app. */
import { MotionFlow } from "./MotionFlow";
import type { MfResult } from "./types";

export function hostSdk() {
  return MotionFlow.host === "AE" ? MotionFlow.AE : MotionFlow.PPRO;
}

export async function sdkData<T>(result: Promise<MfResult<T>>): Promise<T | null> {
  const r = await result;
  if (!r.ok) {
    console.warn("[MotionFlow SDK]", r.error);
    return null;
  }
  return r.data;
}
