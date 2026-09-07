import { MotionFlow } from "@/sdk";
import { copyCollectFiles, type CollectStructure } from "./copy-collect-files";
import type { ScriptMessage } from "./definitions";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asResult(data: unknown): { type?: string; message?: unknown } {
  if (data && typeof data === "object") return data as { type?: string; message?: unknown };
  return { type: "success", message: data };
}

export async function runReduceProject(
  onMessage: (msg: ScriptMessage) => void,
): Promise<void> {
  if (MotionFlow.host !== "PPRO") {
    onMessage({ tone: "error", text: "Reduce Project is Premiere Pro only" });
    return;
  }
  const steps = [
    "saveFirst",
    "checkSelection",
    "saveSelection",
    "backupProject",
    "restoreSelection",
    "reduce",
  ] as const;

  for (const step of steps) {
    if (step === "backupProject") await sleep(400);
    const res = await MotionFlow.PPRO.project.reduce(step);
    if (!res.ok) {
      onMessage({ tone: "error", text: res.error });
      return;
    }
    const data = asResult(res.data);
    if (data.type && data.type !== "success") {
      onMessage({
        tone: data.type === "warning" ? "warning" : "error",
        text: String(data.message ?? data.type),
      });
      return;
    }
  }
  onMessage({ tone: "success", text: "Project reduced" });
}

export async function runHandyCollect(
  onMessage: (msg: ScriptMessage) => void,
): Promise<void> {
  if (MotionFlow.host !== "PPRO") {
    onMessage({ tone: "error", text: "Handy Collect is Premiere Pro only" });
    return;
  }

  const hostSteps = [
    "initRun",
    "selectDestination",
    "saveProjectAs",
    "getSelectedSequences",
    "buildTreePathMapFromSelection",
    "createTrashBin",
    "moveUnusedToTrash",
    "removeEmptyBins",
    "deleteTrashBin",
  ] as const;

  for (const step of hostSteps) {
    const res = await MotionFlow.PPRO.project.collect(step);
    if (!res.ok) {
      onMessage({ tone: "error", text: res.error });
      return;
    }
    const data = asResult(res.data);
    if (data.type && data.type !== "success") {
      onMessage({
        tone: data.type === "warning" ? "warning" : "error",
        text: String(data.message ?? data.type),
      });
      return;
    }
  }

  onMessage({ tone: "info", text: "Copying files…" });
  const structureRes = await MotionFlow.PPRO.project.collect("getStructureResponse");
  if (!structureRes.ok) {
    onMessage({ tone: "error", text: structureRes.error });
    return;
  }

  let structure: CollectStructure | null = null;
  const raw = structureRes.data;
  try {
    if (typeof raw === "string") structure = JSON.parse(raw) as CollectStructure;
    else if (raw && typeof raw === "object" && "message" in (raw as object)) {
      const msg = (raw as { message?: unknown }).message;
      structure =
        typeof msg === "string"
          ? (JSON.parse(msg) as CollectStructure)
          : (msg as CollectStructure);
    } else {
      structure = raw as CollectStructure;
    }
  } catch {
    onMessage({ tone: "error", text: "Could not parse collect structure" });
    return;
  }

  if (!structure) {
    onMessage({ tone: "error", text: "Empty collect structure" });
    return;
  }

  const copied = await copyCollectFiles(structure);
  if (copied.type !== "success") {
    onMessage({ tone: "error", text: copied.message });
    return;
  }

  const link = await MotionFlow.PPRO.project.collect("linkMedia");
  if (!link.ok) {
    onMessage({ tone: "error", text: link.error });
    return;
  }
  onMessage({ tone: "success", text: "Collect complete" });
}
