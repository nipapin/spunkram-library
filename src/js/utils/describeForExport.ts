import { Motionflow, type MfResult } from "@/sdk";
import { evalES } from "../lib/utils/bolt";
import { ns } from "../../shared/shared";
import { fs, os, path } from "../lib/cep/node";

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readSidecar = (filePath: string): unknown | undefined => {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const isFailShape = (data: unknown): data is DescribeHostFail =>
  !!data &&
  typeof data === "object" &&
  (data as DescribeHostFail).ok === false;

const isStarted = (data: unknown): boolean => {
  if (!data || typeof data !== "object") return false;
  const status = (data as { status?: unknown }).status;
  return status === "started" || status === "entered";
};

const isValidExport = (data: unknown): data is DescribeHostOk => {
  if (!data || typeof data !== "object") return false;
  if ((data as DescribeHostFail).ok === false) return false;
  if (isStarted(data)) return false;
  const o = data as DescribeHostOk;
  return typeof o.source === "string" && !!o.source && typeof o.dest === "string" && !!o.dest;
};

const failFrom = (data: DescribeHostFail): Error => {
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
  return err;
};

const normalize = (data: DescribeHostOk): DescribeExportResult => ({
  source: data.source,
  dest: data.dest,
  offset: data.offset ?? 0,
  durationSeconds: data.durationSeconds ?? 0,
  type: (data.type ?? "composition") as "composition" | "selected",
});

const unlinkQuiet = (filePath: string) => {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // missing is fine
  }
};

const isFresh = (filePath: string, startedAt: number): boolean => {
  try {
    return fs.statSync(filePath).mtimeMs >= startedAt - 50;
  } catch {
    return false;
  }
};

/**
 * Calls host describe for audio export.
 * After Effects renderQueue.render() often makes CEP evalScript return "" —
 * the host writes a sidecar JSON; we wait for that instead of treating empty as fatal.
 * Never reuse a leftover mf-ae-describe-last.json from a previous click.
 */
export async function describeForExport(
  audioPresetPath?: string,
): Promise<DescribeExportResult> {
  await Motionflow.ready();

  const probeRaw = await evalES(
    `(function(){
      var host = typeof $ !== "undefined" ? $ : window;
      var api = host["${ns}"];
      var appName = "";
      var appId = "";
      var bt = "";
      var hasRQ = false;
      try { if (typeof app !== "undefined" && app && app.name) appName = String(app.name); } catch (e1) {}
      try { if (typeof app !== "undefined" && app && app.appName) appId = String(app.appName); } catch (e2) {}
      try { if (typeof BridgeTalk !== "undefined" && BridgeTalk.appName) bt = String(BridgeTalk.appName); } catch (e3) {}
      try { hasRQ = !!(app && app.project && app.project.renderQueue); } catch (e4) {}
      var tempDir = "";
      try { tempDir = Folder.temp.fsName; } catch (e5) {}
      return JSON.stringify({
        hasNs: !!api,
        hasDescribe: !!(api && typeof api.describe === "function"),
        appName: appName,
        appId: appId,
        bt: bt,
        hasRQ: hasRQ,
        tempDir: tempDir
      });
    })()`,
    true,
  );
  let hostTemp = "";
  try {
    const probe = JSON.parse(String(probeRaw || "").trim()) as {
      hasNs?: boolean;
      hasDescribe?: boolean;
      appName?: string;
      appId?: string;
      bt?: string;
      hasRQ?: boolean;
      tempDir?: string;
    };
    hostTemp = typeof probe.tempDir === "string" ? probe.tempDir : "";
    if (!probe.hasDescribe) {
      throw new Error(
        `Host describe is not loaded (app=${probe.appName || "?"} id=${probe.appId || "?"} bt=${probe.bt || "?"} ns=${probe.hasNs ? "yes" : "no"} rq=${probe.hasRQ ? "yes" : "no"}). Reload the panel.`,
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Host describe is not loaded")) throw e;
    throw new Error(
      `Host ping failed (${String(probeRaw || "").slice(0, 180) || "empty eval"}). Close the panel and open it again.`,
    );
  }

  const tmpRoot = hostTemp || os.tmpdir();
  const dir = path.join(tmpRoot, "aitools-cep");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fallbackPath = path.join(tmpRoot, "mf-ae-describe-last.json");
  const resultPath = path.join(dir, `describe-${Date.now()}.json`);
  const esPath = resultPath.replace(/\\/g, "/");

  unlinkQuiet(resultPath);
  unlinkQuiet(fallbackPath);
  const startedAt = Date.now();

  const readFresh = (): unknown | undefined => {
    if (isFresh(resultPath, startedAt)) {
      const data = readSidecar(resultPath);
      if (data !== undefined) return data;
    }
    if (isFresh(fallbackPath, startedAt)) {
      const data = readSidecar(fallbackPath);
      if (data !== undefined) return data;
    }
    return undefined;
  };

  const evalBox: { current: MfResult<unknown> | null } = { current: null };
  const describeDone = Motionflow.describe(audioPresetPath, esPath).then(
    (r) => {
      evalBox.current = r;
    },
    () => {
      // evalScript often returns "" during AE render — sidecar is the real result
    },
  );

  const deadline = Date.now() + 10 * 60 * 1000;
  try {
    while (Date.now() < deadline) {
      const file = readFresh();
      if (isStarted(file)) {
        await sleep(200);
        continue;
      }
      if (isValidExport(file)) return normalize(file);
      if (isFailShape(file)) throw failFrom(file);

      const fromEval = evalBox.current;
      if (fromEval && fromEval.ok === true) {
        const payload: unknown = fromEval.data;
        if (isStarted(payload)) {
          await sleep(200);
          continue;
        }
        if (isValidExport(payload)) return normalize(payload);
        if (isFailShape(payload)) throw failFrom(payload);
      }

      if (fromEval && fromEval.ok === false) {
        const graceEnd = Date.now() + 2500;
        while (Date.now() < graceEnd) {
          const late = readFresh();
          if (isStarted(late)) break;
          if (isValidExport(late)) return normalize(late);
          if (isFailShape(late)) throw failFrom(late);
          await sleep(200);
        }
        const late = readFresh();
        if (isValidExport(late)) return normalize(late);
        if (isFailShape(late)) throw failFrom(late);
        if (!isStarted(late)) {
          throw new Error(
            fromEval.error ||
              "Host script returned no result. Reload the panel and try again.",
          );
        }
      }

      await sleep(200);
    }
  } finally {
    void describeDone;
    unlinkQuiet(resultPath);
    unlinkQuiet(fallbackPath);
  }

  throw new Error(
    "Could not export audio from the timeline. Check Work Area / In-Out and try again.",
  );
}
