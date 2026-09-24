/** Handshake file in AppData/Roaming (not the CEP extension folder). */
export const APPLIED_VERSION_STAMP_FILE = "applied-extension-version.json";
export const CROSS_HOST_UPDATE_POLL_MS = 2000;
export function normalizeExtensionVersion(version) {
    return String(version || "")
        .trim()
        .replace(/^v/i, "");
}
export function parseAppliedVersionStamp(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const version = raw.version;
    const clean = normalizeExtensionVersion(typeof version === "string" ? version : "");
    return clean || null;
}
/**
 * Reload the CEP panel (not the host app) when another host finished applying
 * a version this document has not loaded yet.
 *
 * If `targetVersion` is set (Update banner), only reload when the handshake
 * matches that version. Otherwise reload whenever applied ≠ running.
 */
export function shouldReloadExtensionForAppliedUpdate(opts) {
    if (opts.applying)
        return false;
    const applied = normalizeExtensionVersion(opts.appliedVersion);
    const running = normalizeExtensionVersion(opts.runningVersion);
    if (!applied || applied === running)
        return false;
    const target = normalizeExtensionVersion(opts.targetVersion);
    if (target)
        return applied === target;
    return true;
}
