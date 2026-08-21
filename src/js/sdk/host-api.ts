import { hostSdk as baseHostSdk, sdkData } from "motionflow-sdk";
import { MotionFlow } from "./motion-flow";

export { sdkData };
export function hostSdk() {
  return baseHostSdk(MotionFlow);
}
