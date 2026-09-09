import { timers } from "@/lib/cep/node";
import { csi } from "@/lib/utils/bolt";

const CEP_WAKE_EVENTS = [
  "com.adobe.csxs.events.WindowVisibilityEvent",
  "com.adobe.csxs.events.ApplicationActivated",
  "applicationActivate",
];

function scheduleTimeout(ms: number, fn: () => void): () => void {
  const clears: Array<() => void> = [];
  if (typeof timers?.setTimeout === "function") {
    const id = timers.setTimeout(fn, ms);
    clears.push(() => {
      try {
        timers.clearTimeout?.(id);
      } catch {
        /* ignore */
      }
    });
  }
  const wid = window.setTimeout(fn, ms);
  clears.push(() => window.clearTimeout(wid));
  return () => {
    for (const clear of clears) clear();
  };
}

/**
 * CEP Chromium often freezes or drops `window.setTimeout` while the user is in
 * the browser confirm tab, and it often never fires `focus` / `visibilitychange`
 * when they return to Premiere. Node timers + panel pointer / CSXS activate
 * events are how other panel code already wakes (see useWorkRangeCost).
 */
export function waitForNextAuthPoll(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const started = Date.now();
    const minEarlyMs = Math.min(1000, Math.max(0, ms));

    const finish = () => {
      if (settled) return;
      settled = true;
      cancelTimer();
      window.removeEventListener("focus", onEarly);
      window.removeEventListener("pageshow", onEarly);
      document.removeEventListener("visibilitychange", onVis);
      document.documentElement.removeEventListener("pointerenter", onEarly);
      document.documentElement.removeEventListener("mouseenter", onEarly);
      document.documentElement.removeEventListener("pointerdown", onEarly);
      for (const type of CEP_WAKE_EVENTS) {
        try {
          csi.removeEventListener(type, onEarly);
        } catch {
          /* not in CEP */
        }
      }
      resolve();
    };

    const onEarly = () => {
      if (settled) return;
      if (Date.now() - started < minEarlyMs) return;
      finish();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") onEarly();
    };

    const cancelTimer = scheduleTimeout(Math.max(0, ms), finish);
    window.addEventListener("focus", onEarly);
    window.addEventListener("pageshow", onEarly);
    document.addEventListener("visibilitychange", onVis);
    document.documentElement.addEventListener("pointerenter", onEarly);
    document.documentElement.addEventListener("mouseenter", onEarly);
    document.documentElement.addEventListener("pointerdown", onEarly);
    for (const type of CEP_WAKE_EVENTS) {
      try {
        csi.addEventListener(type, onEarly);
      } catch {
        /* not in CEP */
      }
    }
  });
}
