import { useCallback, useEffect, useState } from "react";
import { Motionflow, sdkData } from "../sdk";
import { durationGenerationsCost } from "../utils/generationCost";

export type WorkRangeProbe = {
  durationSeconds: number;
  cost: number;
  error?: string;
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

/**
 * Reads sequence In/Out (PPro) or Work Area (AE) for generation cost labels.
 * Refreshes on mount, window focus, and visibility — when the user activates the panel.
 */
export const useWorkRangeCost = (enabled = true): WorkRangeProbe => {
  const [probe, setProbe] = useState<WorkRangeProbe>({ durationSeconds: 0, cost: 1 });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const raw = await sdkData(Motionflow.getWorkRange());
      const data = raw as WorkRangeOk | WorkRangeFail;
      if (data && typeof data === "object" && "ok" in data && data.ok === false) {
        setProbe({
          durationSeconds: 0,
          cost: 1,
          error: data.message || data.reason || "No In/Out range",
        });
        return;
      }
      const durationSeconds =
        data && typeof data === "object" && "durationSeconds" in data
          ? Number((data as WorkRangeOk).durationSeconds)
          : 0;
      if (!(durationSeconds > 0)) {
        setProbe({ durationSeconds: 0, cost: 1, error: "Set In/Out or Work Area" });
        return;
      }
      setProbe({
        durationSeconds,
        cost: durationGenerationsCost(durationSeconds),
      });
    } catch (e) {
      setProbe({
        durationSeconds: 0,
        cost: 1,
        error: e instanceof Error ? e.message : "Could not read timeline range",
      });
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
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, refresh]);

  return probe;
};
