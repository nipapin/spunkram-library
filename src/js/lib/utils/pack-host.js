import { cepHostAppId } from "./bolt";
import { storageKey } from "@brands";
const ACTIVE_PACK_KEY_PREFIX = storageKey("activePackPath");
/** Pre-host-split key — read only for one-time migration. */
export const LEGACY_ACTIVE_PACK_STORAGE_KEY = ACTIVE_PACK_KEY_PREFIX;
/** Normalize pack/catalog host tags to AE | PR. */
export function normalizePackHost(id) {
    const u = (id || "").trim().toUpperCase();
    if (!u)
        return "";
    if (u === "AE" || u === "AEFT" || u.includes("AFTER"))
        return "AE";
    if (u === "PR" || u === "PPRO" || u.includes("PREMIERE"))
        return "PR";
    return "";
}
/** Current CEP host as pack software_id (AE | PR). */
export function currentPackHost() {
    const appId = cepHostAppId();
    if (appId === "AEFT")
        return "AE";
    if (appId === "PPRO")
        return "PR";
    return null;
}
/** Infer host from install folder naming (`… - AE` / `… - PR`). */
export function inferPackHostFromPath(packPath) {
    const normalized = packPath.replace(/\\/g, "/");
    if (/ - AE(?:\/|$)/i.test(normalized) || /\/AE\//i.test(normalized))
        return "AE";
    if (/ - PR(?:\/|$)/i.test(normalized) || /\/PR\//i.test(normalized))
        return "PR";
    return "";
}
/** Resolve installed meta host from appID / load / path. */
export function resolveInstalledPackHost(meta) {
    return (normalizePackHost(meta.appID) ||
        normalizePackHost(meta.load) ||
        inferPackHostFromPath(meta.path || ""));
}
export function packMetaMatchesHost(meta, host) {
    const packHost = resolveInstalledPackHost(meta);
    // Unknown host → exclude (do not open foreign / ambiguous packs).
    return packHost === host;
}
export function activePackStorageKey(host) {
    return `${ACTIVE_PACK_KEY_PREFIX}.${host}`;
}
/** Clear host-scoped + legacy active-pack keys (Settings wipe). */
export function clearAllActivePackStorageKeys(removeItem) {
    removeItem(LEGACY_ACTIVE_PACK_STORAGE_KEY);
    removeItem(activePackStorageKey("AE"));
    removeItem(activePackStorageKey("PR"));
}
