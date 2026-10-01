/** Handshake file in AppData/Roaming (not the CEP extension folder). */
export const APPLIED_VERSION_STAMP_FILE = "applied-extension-version.json";

export const CROSS_HOST_UPDATE_POLL_MS = 2000;

export type AppliedVersionStamp = {
  version: string;
  appliedAt?: string;
};

export function normalizeExtensionVersion(
  version: string | null | undefined,
): string {
  return String(version || "")
    .trim()
    .replace(/^v/i, "");
}

export function parseAppliedVersionStamp(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const version = (raw as AppliedVersionStamp).version;
  const clean = normalizeExtensionVersion(
    typeof version === "string" ? version : "",
  );
  return clean || null;
}

/** HTML file CEF has not cached yet. Stubs and hard reloads land here, not on `index.html`. */
export function bootPanelHtmlName(version: string): string {
  const clean = normalizeExtensionVersion(version).replace(/[^0-9A-Za-z.]+/g, "_");
  return clean ? `index-${clean}.html` : "index.html";
}

/** Same ordering as `compareVersions` in api/update.ts. Positive when a > b. */
function compareExtensionVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = normalizeExtensionVersion(v);
    const dash = clean.indexOf("-");
    const core = (dash >= 0 ? clean.slice(0, dash) : clean)
      .split(".")
      .map((part) => parseInt(part, 10) || 0);
    const pre = dash >= 0 ? clean.slice(dash + 1) : null;
    return { core, pre };
  };
  const preNumber = (pre: string) => {
    const match = pre.match(/beta\.(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  };
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.core.length, right.core.length);
  for (let i = 0; i < length; i++) {
    const delta = (left.core[i] || 0) - (right.core[i] || 0);
    if (delta !== 0) return delta;
  }
  if (left.pre === null && right.pre !== null) return 1;
  if (left.pre !== null && right.pre === null) return -1;
  if (left.pre === null || right.pre === null) return 0;
  return preNumber(left.pre) - preNumber(right.pre);
}

/**
 * Reload the CEP panel (not the host app) once, when another host finished
 * applying a version this document has not loaded yet.
 *
 * Only when the handshake is strictly newer than the embedded build. An older
 * stamp left by a previous in-panel update can never equal the new build, and
 * reloading does not change either side — that reload loops forever.
 *
 * If `targetVersion` is set (Update banner), the handshake must match it.
 */
export function shouldReloadExtensionForAppliedUpdate(opts: {
  runningVersion: string;
  appliedVersion: string | null | undefined;
  targetVersion?: string | null;
  applying?: boolean;
}): boolean {
  if (opts.applying) return false;
  const applied = normalizeExtensionVersion(opts.appliedVersion);
  const running = normalizeExtensionVersion(opts.runningVersion);
  if (!applied || !running) return false;
  if (compareExtensionVersions(applied, running) <= 0) return false;
  const target = normalizeExtensionVersion(opts.targetVersion);
  if (target && applied !== target) return false;
  return true;
}
