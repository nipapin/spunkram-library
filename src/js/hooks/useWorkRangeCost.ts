import { useCallback, useEffect, useRef, useState } from "react";
import { Motionflow } from "../sdk";
import { durationGenerationsCost } from "../utils/generationCost";
import { csi } from "../lib/utils/bolt";

export type WorkRangeProbe = {
  durationSeconds: number;
  cost: number;
  error?: string;
};

export type WorkRangeCostState = WorkRangeProbe & {
  refresh: () => Promise<WorkRangeProbe>;
};

type WorkRangeOk = {
  ok: true;
  start: number;
  end: number;
  durationSeconds: number;
};

type WorkRangeFail = {
  ok: false;
  reason?: string;
  message?: string;
};

const CEP_WINDOW_VISIBILITY = "com.adobe.csxs.events.WindowVisibilityEvent";

const unsetProbe = (error: string): WorkRangeProbe => ({
  durationSeconds: 0,
  cost: 1,
  error,
});

const durationFromPayload = (raw: unknown): number => {
  let data: unknown = raw;
  for (let i = 0; i < 3; i++) {
    if (!data || typeof data !== "object") break;
    const o = data as { durationSeconds?: unknown; data?: unknown; start?: unknown; end?: unknown };
    const direct = Number(o.durationSeconds);
    if (direct > 0 && Number.isFinite(direct)) return direct;
    const start = Number(o.start);
    const end = Number(o.end);
    if (end > start && Number.isFinite(start) && Number.isFinite(end)) return end - start;
    if ("data" in o) data = o.data;
    else break;
  }
  return 0;
};

/**
 * Reads sequence In/Out / Work Area for generation cost labels.
 * CEP Chromium often never fires window focus or visibilitychange when the
 * user clicks back into the panel — also refresh on pointerenter and poll.
 */
export const useWorkRangeCost = (enabled = true): WorkRangeCostState => {
  const [probe, setProbe] = useState<WorkRangeProbe>({ durationSeconds: 0, cost: 1 });

  const refresh = useCallback(async (): Promise<WorkRangeProbe> => {
    if (!enabled) {
      const next = { durationSeconds: 0, cost: 1 };
      setProbe(next);
      return next;
    }
    try {
      const result = await Motionflow.getWorkRange();
      if (!result.ok) {
        const next = unsetProbe(result.error || "No In/Out range");
        setProbe(next);
        return next;
      }
      const data = result.data as WorkRangeOk | WorkRangeFail | undefined;
      if (data && typeof data === "object" && "ok" in data && data.ok === false) {
        const next = unsetProbe(data.message || data.reason || "No In/Out range");
        setProbe(next);
        return next;
      }
      let durationSeconds = durationFromPayload(data ?? result);
      if (durationSeconds > 1e9) durationSeconds = durationSeconds / 254016000000;
      if (durationSeconds > 24 * 60 * 60) durationSeconds = 0;
      if (!(durationSeconds > 0)) {
        const next = unsetProbe("Set In/Out or Work Area");
        setProbe(next);
        return next;
      }
      const next = {
        durationSeconds,
        cost: durationGenerationsCost(durationSeconds),
      };
      setProbe(next);
      return next;
    } catch (e) {
      const next = unsetProbe(
        e instanceof Error ? e.message : "Could not read timeline range",
      );
      setProbe(next);
      return next;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();

    const onActivate = () => void refresh();
    window.addEventListener("focus", onActivate);
    window.addEventListener("pageshow", onActivate);
    document.addEventListener("visibilitychange", onActivate);
    document.documentElement.addEventListener("pointerenter", onActivate);
    document.documentElement.addEventListener("mouseenter", onActivate);
    try {
      csi.addEventListener(CEP_WINDOW_VISIBILITY, onActivate);
    } catch {
      // not in CEP
    }

    const poll = setInterval(onActivate, 2000);

    return () => {
      window.removeEventListener("focus", onActivate);
      window.removeEventListener("pageshow", onActivate);
      document.removeEventListener("visibilitychange", onActivate);
      document.documentElement.removeEventListener("pointerenter", onActivate);
      document.documentElement.removeEventListener("mouseenter", onActivate);
      try {
        csi.removeEventListener(CEP_WINDOW_VISIBILITY, onActivate);
      } catch {
        // ignore
      }
      clearInterval(poll);
    };
  }, [enabled, refresh]);

  return { ...probe, refresh };
};
