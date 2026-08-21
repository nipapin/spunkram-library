import { createMotionFlow } from "motionflow-sdk";
import { version as pkgVersion } from "../../shared/shared";
import { createCepBridge } from "./cep-bridge";

export const MotionFlow = createMotionFlow(createCepBridge(), { version: pkgVersion });

/** @deprecated Use `MotionFlow` */
export const Motionflow = MotionFlow;
