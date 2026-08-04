import { csi } from "../lib/utils/bolt";
import type { MfHost } from "./types";

export function detectHost(): MfHost | null {
  const id = csi.hostEnvironment?.appId;
  if (id === "AEFT") return "AE";
  if (id === "PPRO") return "PPRO";
  return null;
}

export function requireHost(expected?: MfHost): MfHost {
  const host = detectHost();
  if (!host) throw new Error("Open this panel inside Premiere Pro or After Effects.");
  if (expected && host !== expected) {
    throw new Error(`This operation requires ${expected}, current host is ${host}.`);
  }
  return host;
}
