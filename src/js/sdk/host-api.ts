/** Host-facing MotionFlow API for the current Adobe app. */
import { MotionFlow } from "@/sdk";
import { AE } from "@/sdk/ae";
import { PPRO } from "@/sdk/ppro";

export type HostSdk = typeof AE | typeof PPRO;

export function hostSdk(): HostSdk {
  return MotionFlow.host === "AE" ? MotionFlow.AE : MotionFlow.PPRO;
}

/** Unwrap MfResult or throw. */
export async function sdkData<T>(promise: Promise<import("@/sdk").MfResult<T>>): Promise<T> {
  const res = await promise;
  if (!res.ok) {
    const msg =
      res.error && res.error !== "null" && res.error !== "undefined"
        ? res.error
        : "Host script failed";
    throw new Error(msg);
  }
  return res.data;
}
