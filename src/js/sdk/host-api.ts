import { sdkData } from "motionflow-sdk";
import { MotionFlow } from "./motion-flow";

export { sdkData };
/** Prefer AE when host is unknown — never fall through to Premiere inside After Effects. */
export function hostSdk() {
  if (MotionFlow.host === "PPRO") return MotionFlow.PPRO;
  return MotionFlow.AE;
}
