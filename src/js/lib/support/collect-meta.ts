import {
  displayName as EXTENSION_NAME,
  version as EXTENSION_VERSION,
} from "../../../shared/shared";
import { getUserSystemData } from "@/lib/api/usp";
import { csi } from "@/lib/utils/bolt";
import { BRAND } from "@brands";

export type SupportHostMeta = {
  appId: string;
  appName?: string;
  appVersion: string;
};

export type SupportErrorMeta = {
  extension_name: string;
  extension_version: string;
  host: SupportHostMeta;
  os: string;
  locale?: string;
  occurred_at: string;
  client: string;
};

const HOST_NAMES: Record<string, string> = {
  PPRO: "Premiere Pro",
  AEFT: "After Effects",
};

function readHost(): SupportHostMeta {
  try {
    const env =
      typeof csi.getHostEnvironment === "function"
        ? csi.getHostEnvironment()
        : csi.hostEnvironment;
    const appId =
      typeof env?.appId === "string" && env.appId ? env.appId : "UNKNOWN";
    const appVersion =
      typeof env?.appVersion === "string" && env.appVersion
        ? env.appVersion
        : "unknown";
    return {
      appId,
      appVersion,
      appName: HOST_NAMES[appId] || undefined,
    };
  } catch {
    return { appId: "UNKNOWN", appVersion: "unknown" };
  }
}

function readOs(): string {
  try {
    return getUserSystemData().os || "Unknown OS";
  } catch {
    return "Unknown OS";
  }
}

/** Snapshot of extension / host / OS for support reports. */
export function collectSupportMeta(): SupportErrorMeta {
  return {
    extension_name: EXTENSION_NAME,
    extension_version: EXTENSION_VERSION,
    host: readHost(),
    os: readOs(),
    locale:
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : undefined,
    occurred_at: new Date().toISOString(),
    client: BRAND.apiClient,
  };
}
