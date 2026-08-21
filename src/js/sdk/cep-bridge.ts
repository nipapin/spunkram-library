import { evalTS, initBolt, reloadJSX, csi } from "../lib/utils/bolt";
import { fs, os, path } from "../lib/cep/node";
import type { MotionFlowBridge, MfHost } from "motionflow-sdk";

/**
 * Write payload to temp JSON (ASCII-safe) and pass path to ExtendScript.
 * Keeps cyrillic out of evalScript strings.
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
  const asciiJson = JSON.stringify(data).replace(/[\u007f-\uffff]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${hex}`;
  });
  fs.writeFileSync(filePath, asciiJson, "utf8");
  try {
    return await run(filePath);
  } finally {
    try {
      fs.unlinkSync(filePath);
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
      initBolt(false);
      await reloadJSX();
    },

    withJsonFile: withHostJsonFile,
  };
}
