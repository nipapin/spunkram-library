import { evalTS, initBolt, reloadJSX, csi } from "../lib/utils/bolt";
import { fs, os, path } from "../lib/cep/node";
import type { MotionFlowBridge, MfHost } from "motionflow-sdk";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readSidecar = (resultPath: string): unknown | undefined => {
  try {
    if (!fs.existsSync(resultPath)) return undefined;
    const raw = fs.readFileSync(resultPath, "utf8").trim();
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const waitForSidecar = async (
  resultPath: string,
  timeoutMs: number,
): Promise<unknown | undefined> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = readSidecar(resultPath);
    if (data !== undefined) return data;
    await sleep(250);
  }
  return readSidecar(resultPath);
};

/**
 * Write payload to temp JSON (ASCII-safe) and pass path to ExtendScript.
 * Keeps cyrillic out of evalScript strings.
 *
 * AE render/import often makes evalScript return "". The host writes a sibling
 * `.result.json`; we keep the payload on disk and read that sidecar instead of
 * treating the empty CEP callback as a hard failure.
 */
async function withHostJsonFile<T>(
  data: unknown,
  run: (filePath: string) => Promise<T>,
): Promise<T> {
  const dir = path.join(os.tmpdir(), "aitools-cep");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `host-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  const resultPath = filePath.replace(/\.json$/i, ".result.json");
  const asciiJson = JSON.stringify(data).replace(/[\u007f-\uffff]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${hex}`;
  });
  fs.writeFileSync(filePath, asciiJson, "utf8");
  try {
    try {
      fs.unlinkSync(resultPath);
    } catch {
      // no previous sidecar
    }
    // ExtendScript File() is more reliable with forward slashes on Windows.
    const esPath = filePath.replace(/\\/g, "/");
    let out: T | undefined;
    let runError: unknown;
    try {
      out = await run(esPath);
    } catch (e) {
      runError = e;
    }
    if (!runError && out != null) {
      const sidecar = readSidecar(resultPath);
      return (sidecar !== undefined ? sidecar : out) as T;
    }
    const sidecar = await waitForSidecar(resultPath, 3 * 60 * 1000);
    if (sidecar !== undefined) return sidecar as T;
    if (runError) throw runError;
    return out as T;
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // temp cleanup best-effort
    }
    try {
      fs.unlinkSync(resultPath);
    } catch {
      // temp cleanup best-effort
    }
  }
}

/** CEP/Bolt adapter for motionflow-sdk — only place that touches CSInterface. */
export function createCepBridge(): MotionFlowBridge {
  return {
    getHost(): MfHost | null {
      const id = csi.hostEnvironment?.appId;
      if (id === "AEFT") return "AE";
      if (id === "PPRO") return "PPRO";
      return null;
    },

    callHost<T = unknown>(functionName: string, ...args: unknown[]): Promise<T> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return evalTS(functionName as any, ...(args as any)) as Promise<T>;
    },

    isPanelEnvironment(): boolean {
      return typeof window !== "undefined" && !!window.cep;
    },

    async loadHostScripts(): Promise<void> {
      if (!window.cep) return;
      await initBolt(false);
    },

    withJsonFile: withHostJsonFile,
  };
}
