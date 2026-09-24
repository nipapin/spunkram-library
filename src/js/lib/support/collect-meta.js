import { displayName as EXTENSION_NAME, version as EXTENSION_VERSION, } from "../../../shared/shared";
import { getUserSystemData } from "@/lib/api/usp";
import { csi } from "@/lib/utils/bolt";
import { BRAND } from "@brands";
const HOST_NAMES = {
    PPRO: "Premiere Pro",
    AEFT: "After Effects",
};
function readHost() {
    try {
        const env = typeof csi.getHostEnvironment === "function"
            ? csi.getHostEnvironment()
            : csi.hostEnvironment;
        const appId = typeof env?.appId === "string" && env.appId ? env.appId : "UNKNOWN";
        const appVersion = typeof env?.appVersion === "string" && env.appVersion
            ? env.appVersion
            : "unknown";
        return {
            appId,
            appVersion,
            appName: HOST_NAMES[appId] || undefined,
        };
    }
    catch {
        return { appId: "UNKNOWN", appVersion: "unknown" };
    }
}
function readOs() {
    try {
        return getUserSystemData().os || "Unknown OS";
    }
    catch {
        return "Unknown OS";
    }
}
/** Snapshot of extension / host / OS for support reports. */
export function collectSupportMeta() {
    return {
        extension_name: EXTENSION_NAME,
        extension_version: EXTENSION_VERSION,
        host: readHost(),
        os: readOs(),
        locale: typeof navigator !== "undefined" && navigator.language
            ? navigator.language
            : undefined,
        occurred_at: new Date().toISOString(),
        client: BRAND.apiClient,
    };
}
