/**
 * Reliable host detection for CEP panels in Adobe After Effects and Premiere Pro.
 *
 * ## Why this exists
 *
 * In Adobe AE 24–25, CSInterface.getApplicationID() / hostEnvironment.appId can
 * incorrectly report "PPRO" when the panel is actually running inside After Effects.
 * This appears to be a CEP/BridgeTalk configuration issue in those AE versions.
 *
 * ## Solution
 *
 * Instead of trusting CSInterface's appId, we probe the ExtendScript DOM:
 * - After Effects has `app.project.renderQueue`
 * - Premiere Pro has `app.project.sequences` (ProjectItemType.SEQUENCE or rootItem.children)
 *
 * The probe runs once at panel init and caches the result. All host-identity checks
 * in JS should use `getResolvedHostAppId()` instead of `csi.hostEnvironment.appId`.
 */

import { csi, evalES } from "./bolt";

export type HostAppId = "AEFT" | "PPRO";

/** Cached resolved host after probe. `null` means probe hasn't run yet. */
let resolvedHost: HostAppId | null = null;

/** Promise for the in-flight probe (to avoid duplicate probes). */
let probePromise: Promise<HostAppId> | null = null;

/**
 * Returns the CSInterface appId (possibly wrong in AE 24–25).
 * Use `getResolvedHostAppId()` for reliable detection after init.
 */
export function cepAppId(): HostAppId | null {
  const id = csi.hostEnvironment?.appId;
  if (id === "AEFT") return "AEFT";
  if (id === "PPRO") return "PPRO";
  return null;
}

/**
 * Synchronous access to the resolved host identity.
 * Returns `null` if the probe hasn't completed yet.
 * Prefer `getResolvedHostAppId()` which ensures the probe runs.
 */
export function getResolvedHostSync(): HostAppId | null {
  return resolvedHost;
}

/**
 * Returns true if the resolved host is After Effects.
 * Falls back to CSInterface if probe hasn't run.
 * For async code, prefer `isAfterEffectsAsync()` for guaranteed accuracy.
 */
export function isAfterEffects(): boolean {
  return (resolvedHost ?? cepAppId()) === "AEFT";
}

/**
 * Returns true if the resolved host is Premiere Pro.
 * Falls back to CSInterface if probe hasn't run.
 */
export function isPremierePro(): boolean {
  return (resolvedHost ?? cepAppId()) === "PPRO";
}

/**
 * Probes the ExtendScript DOM to detect the real host application.
 *
 * Detection logic:
 * - `app.project.renderQueue` exists → After Effects
 * - `app.project.rootItem?.children` or sequence-related APIs → Premiere Pro
 * - Falls back to CSInterface appId if probe fails
 */
async function probeHostDom(): Promise<HostAppId> {
  const fallback = cepAppId() ?? "AEFT";

  try {
    const raw = await evalES(
      `(function(){
        var result = { hasRQ: false, hasSeq: false, btApp: "" };
        try {
          if (typeof BridgeTalk !== "undefined" && BridgeTalk.appName) {
            result.btApp = String(BridgeTalk.appName).toLowerCase();
          }
        } catch(e1) {}
        try {
          result.hasRQ = !!(app && app.project && app.project.renderQueue);
        } catch(e2) {}
        try {
          // PPro: ProjectPanel's rootItem, sequences collection, or activeSequence
          var p = app && app.project;
          if (p && (p.sequences || p.activeSequence || (p.rootItem && p.rootItem.children))) {
            result.hasSeq = true;
          }
        } catch(e3) {}
        return JSON.stringify(result);
      })()`,
      true,
    );

    if (!raw || typeof raw !== "string") return fallback;

    const parsed = JSON.parse(raw.trim()) as {
      hasRQ?: boolean;
      hasSeq?: boolean;
      btApp?: string;
    };

    // renderQueue is AE-only
    if (parsed.hasRQ === true) return "AEFT";

    // sequences / rootItem.children is PPro-only
    if (parsed.hasSeq === true) return "PPRO";

    // BridgeTalk appName as secondary signal
    if (parsed.btApp) {
      const bt = parsed.btApp;
      if (bt.includes("aftereffects") || bt === "aftereffects" || bt === "aeft") {
        return "AEFT";
      }
      if (bt.includes("premiere") || bt === "premierepro" || bt === "ppro") {
        return "PPRO";
      }
    }

    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Async probe to get the reliable host identity.
 * Runs the probe once; subsequent calls return the cached result.
 */
export async function getResolvedHostAppId(): Promise<HostAppId> {
  if (resolvedHost) return resolvedHost;

  if (!probePromise) {
    probePromise = probeHostDom().then((host) => {
      resolvedHost = host;
      const cepId = cepAppId();
      if (cepId && cepId !== host) {
        console.warn(
          `[host-identity] CSInterface reports "${cepId}" but DOM probe detected "${host}". Using "${host}".`,
        );
      }
      return host;
    });
  }

  return probePromise;
}

/**
 * Async check: returns true if the real host is After Effects.
 */
export async function isAfterEffectsAsync(): Promise<boolean> {
  const host = await getResolvedHostAppId();
  return host === "AEFT";
}

/**
 * Async check: returns true if the real host is Premiere Pro.
 */
export async function isPremiereProAsync(): Promise<boolean> {
  const host = await getResolvedHostAppId();
  return host === "PPRO";
}

/**
 * Initialize host detection early. Call from panel init (e.g., initBolt).
 * Non-blocking: the probe runs in the background.
 */
export function initHostIdentity(): void {
  if (!window.cep) return;
  // Start the probe but don't block on it
  void getResolvedHostAppId();
}
