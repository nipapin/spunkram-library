import { useCallback, useEffect, useState } from "react";
import { Motionflow } from "../sdk";
import { durationGenerationsCost } from "../utils/generationCost";

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

const unsetProbe = (error: string): WorkRangeProbe => ({
  durationSeconds: 0,
  cost: 1,
  error,
});

/**
 * Reads sequence In/Out (PPro) or Work Area (AE) for generation cost labels.
 * Refreshes on mount, window focus, and visibility — when the user activates the panel.
 * Unset In/Out must stay at cost 1 — never bill the whole timeline.
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
      const data = result.data as WorkRangeOk | WorkRangeFail;
      if (data && typeof data === "object" && "ok" in data && data.ok === false) {
        const next = unsetProbe(data.message || data.reason || "No In/Out range");
        setProbe(next);
        return next;
      }
      const durationSeconds =
        data && typeof data === "object" && "durationSeconds" in data
          ? Number((data as WorkRangeOk).durationSeconds)
          : 0;
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

    const onFocus = () => void refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    // Poll periodically to catch In/Out or Work Area changes while panel is focused.
    // This keeps the cost/N label in sync when the user modifies markers in the host.
    const POLL_INTERVAL_MS = 3000;
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(poll);
    };
  }, [enabled, refresh]);

  return { ...probe, refresh };
};
