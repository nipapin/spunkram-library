import { Motionflow } from "@/sdk";

export type DescribeExportResult = {
  source: string;
  dest: string;
  offset: number;
  durationSeconds: number;
  type: "composition" | "selected";
};

type DescribeHostFail = {
  ok: false;
  reason?: string;
  message?: string;
};

type DescribeHostOk = DescribeExportResult & {
  ok?: true;
};

/**
 * Calls host describe for audio export. Surfaces evalTS / export errors instead of
 * the generic "Set In/Out" fallback when sdkData would return null.
 */
export async function describeForExport(
  audioPresetPath?: string,
): Promise<DescribeExportResult> {
  const result = await Motionflow.describe(audioPresetPath);
  if (!result.ok) {
    const err = new Error(result.error || "Could not export audio from the timeline");
    (err as Error & { soft?: boolean }).soft = /in\/out|work area|open a (sequence|composition)/i.test(
      result.error,
    );
    throw err;
  }

  const data = result.data as DescribeHostOk | DescribeHostFail | null | undefined;
  if (!data || typeof data !== "object") {
    throw new Error("Host returned no audio export result. Reload the panel and try again.");
  }

  if ("ok" in data && data.ok === false) {
    const soft =
      data.reason === "NO_ACTIVE_COMP" ||
      data.reason === "NO_ACTIVE_SEQUENCE" ||
      data.reason === "NO_AUDIO" ||
      data.reason === "NO_INOUT" ||
      data.reason === "NO_WORK_AREA";
    const msg =
      (typeof data.message === "string" && data.message) ||
      "Could not export audio. Set In/Out (Premiere) or Work Area (After Effects) and try again.";
    const err = new Error(msg);
    (err as Error & { soft?: boolean; reason?: string }).soft = soft;
    if (data.reason) (err as Error & { reason?: string }).reason = data.reason;
    throw err;
  }

  if (!data.source || !data.dest) {
    const hostMsg =
      "message" in data && typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : undefined;
    const msg =
      hostMsg ||
      "Could not export audio. Set In/Out (Premiere) or Work Area (After Effects) and try again.";
    const err = new Error(msg);
    (err as Error & { soft?: boolean }).soft = true;
    throw err;
  }

  return {
    source: data.source,
    dest: data.dest,
    offset: data.offset ?? 0,
    durationSeconds: data.durationSeconds ?? 0,
    type: (data.type ?? "composition") as "composition" | "selected",
  };
}
