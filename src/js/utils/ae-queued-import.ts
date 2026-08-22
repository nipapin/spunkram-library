import { Motionflow } from "@/sdk";
import { cepHostAppId, evalES } from "../lib/utils/bolt";
import { fs, os, path } from "../lib/cep/node";

type HostImportOutcome = { ok?: boolean; reason?: string; status?: string } | null | undefined;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ExtendScript File() prefers forward slashes on Windows. */
function esPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/** Copy to ASCII-only temp when path contains non-ASCII — AE importFile quirk. */
export function ensureAsciiImportPath(filePath: string): string {
  if (!/[^\u0000-\u007f]/.test(filePath)) return filePath;
  const ext = path.extname(filePath) || "";
  const dest = path.join(os.tmpdir(), `mf-import-ascii-${Date.now()}${ext}`);
  fs.copyFileSync(filePath, dest);
  return dest;
}

const STOCK_FOLDER_NAME = "Spunkram Stock Assets";

/**
 * Direct AE stock footage import — no queue, no sidecar, no polling.
 * Single evalES: importFile → folder placement → optional timeline add.
 * @see https://ae-scripting.docsforadobe.dev/general/project/#projectimportfile
 */
export async function importAeStockFootage(
  filePath: string,
  destination: "project" | "timeline",
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const importPath = esPath(ensureAsciiImportPath(filePath));
  const folderName = STOCK_FOLDER_NAME;
  const addToTimeline = destination === "timeline";

  const script = `(function(){
    try {
      var f = new File("${importPath}");
      if (!f.exists) {
        return JSON.stringify({ ok: false, reason: "SOURCE_MISSING" });
      }
      var opts = new ImportOptions(f);
      if (!opts.canImportAs(ImportAsType.FOOTAGE)) {
        return JSON.stringify({ ok: false, reason: "IMPORT_FAILED" });
      }
      var item = app.project.importFile(opts);
      if (!item) {
        return JSON.stringify({ ok: false, reason: "IMPORT_FAILED" });
      }

      var folder = null;
      for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof FolderItem && it.name === "${folderName}") {
          folder = it;
          break;
        }
      }
      if (!folder) {
        folder = app.project.items.addFolder("${folderName}");
      }
      item.parentFolder = folder;

      if (${addToTimeline}) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
          return JSON.stringify({ ok: false, reason: "NO_ACTIVE_COMP" });
        }
        var layer = comp.layers.add(item);
        layer.startTime = comp.time;
      }

      return JSON.stringify({ ok: true });
    } catch (e) {
      return JSON.stringify({
        ok: false,
        reason: String(e && e.message != null ? e.message : e)
      });
    }
  })()`;

  try {
    const raw = await evalES(script, true);
    const trimmed = String(raw || "").trim();
    if (!trimmed) {
      return { ok: false, reason: "Host script returned no result" };
    }
    const parsed = JSON.parse(trimmed) as { ok?: boolean; reason?: string; evalESError?: boolean };
    if (parsed.evalESError) {
      return { ok: false, reason: parsed.reason || "ExtendScript error" };
    }
    if (parsed.ok === true) {
      return { ok: true };
    }
    return { ok: false, reason: parsed.reason || "Unknown error" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg };
  }
}

function readSidecarFile(
  filePath: string,
  startedAt: number,
  requireFresh = true,
): HostImportOutcome {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    if (requireFresh && fs.statSync(filePath).mtimeMs < startedAt - 50) return undefined;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return undefined;
    return JSON.parse(raw) as HostImportOutcome;
  } catch {
    return undefined;
  }
}

function isFinal(data: HostImportOutcome): boolean {
  if (!data || typeof data !== "object") return false;
  if (data.status === "started") return false;
  return data.ok === true || data.ok === false;
}

function parseKickPayload(raw: string): HostImportOutcome {
  try {
    const parsed = JSON.parse(String(raw || "").trim()) as HostImportOutcome & {
      evalESError?: boolean;
    };
    if (!parsed || typeof parsed !== "object") return undefined;
    if (parsed.evalESError) return undefined;
    if (parsed.ok === false && (parsed.reason === "NO_FILE" || parsed.reason === "NO_KICK")) {
      return undefined;
    }
    if (parsed.ok === true || parsed.ok === false) return parsed;
    return undefined;
  } catch {
    return undefined;
  }
}

async function kickQueuedImport(): Promise<HostImportOutcome | undefined> {
  const raw = await evalES(
    `(function(){
      try {
        var host = typeof $ !== "undefined" ? $ : this;
        var api = typeof host._mfPickApi === "function" ? host._mfPickApi() : host;
        var fn = (api && typeof api.runQueuedImportMedia === "function")
          ? api.runQueuedImportMedia
          : host._mfRunQueuedImport;
        if (typeof fn !== "function") {
          return JSON.stringify({ ok: false, reason: "NO_KICK" });
        }
        return JSON.stringify(fn());
      } catch (e) {
        return JSON.stringify({
          ok: false,
          reason: String(e && e.message != null ? e.message : e)
        });
      }
    })()`,
    true,
  );
  return parseKickPayload(String(raw || ""));
}

async function scheduleImportKick(): Promise<void> {
  await evalES(
    `(function(){
      try {
        app.scheduleTask(
          "try{if($._mfRunQueuedImport)$._mfRunQueuedImport();}catch(e){}",
          80,
          false
        );
        return "scheduled";
      } catch (e) {
        return String(e && e.message != null ? e.message : e);
      }
    })()`,
    true,
  );
}

async function waitForQueueEval(
  evalBox: {
    current: { ok: true; data?: unknown } | { ok: false; error?: string } | null;
  },
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (evalBox.current) return;
    await sleep(50);
  }
}

function readImportSidecar(
  resultPath: string,
  startedAt: number,
): HostImportOutcome | undefined {
  const fallback = path.join(os.tmpdir(), "mf-ae-import-last.json");
  const fromResult = readSidecarFile(resultPath, startedAt, false);
  if (isFinal(fromResult)) return fromResult;
  const fromFallback = readSidecarFile(fallback, startedAt, true);
  if (isFinal(fromFallback)) return fromFallback;
  return undefined;
}

/**
 * Run AE queued import with scheduleTask kick + sidecar poll.
 * NOTE: Stock footage now uses `importAeStockFootage` (direct evalES).
 * This function is kept for voiceover audio which still uses the SDK path.
 */
export async function runAeQueuedHostImport(
  filePath: string,
  destination: "project" | "timeline",
  duration: number,
  callImport: (
    path: string,
    dest: "project" | "timeline",
    dur: number,
    resultPath: string,
  ) => Promise<{ ok: boolean; data?: unknown; error?: string }>,
): Promise<HostImportOutcome> {
  if (cepHostAppId() !== "AEFT") {
    const wrapped = await callImport(filePath, destination, duration, "");
    if (!wrapped.ok) return { ok: false, reason: wrapped.error };
    return wrapped.data as HostImportOutcome;
  }

  const importPath = esPath(ensureAsciiImportPath(filePath));
  const startedAt = Date.now();
  const resultPath = esPath(
    path.join(
      os.tmpdir(),
      `mf-import-${startedAt}-${Math.random().toString(36).slice(2, 6)}.json`,
    ),
  );
  try {
    fs.unlinkSync(resultPath);
  } catch {
    // no leftover
  }

  const evalBox: {
    current: { ok: true; data?: unknown } | { ok: false; error?: string } | null;
  } = { current: null };

  void callImport(importPath, destination, duration, resultPath).then(
    (r) => {
      evalBox.current = r;
    },
    (e) => {
      evalBox.current = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    },
  );

  // Wait until ExtendScript queues the job — scheduleTask before this races NO_FILE.
  await waitForQueueEval(evalBox, 15_000);

  if (evalBox.current && !evalBox.current.ok) {
    const err = String(evalBox.current.error || "");
    const emptyEval =
      /no result/i.test(err) ||
      /unexpected end of json/i.test(err) ||
      /host script failed/i.test(err);
    if (!emptyEval) return { ok: false, reason: err };
  }

  const queueData = evalBox.current?.ok
    ? (evalBox.current.data as HostImportOutcome)
    : undefined;
  if (queueData && isFinal(queueData)) return queueData;

  await scheduleImportKick();

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const sidecar = readImportSidecar(resultPath, startedAt);
    if (sidecar) return sidecar;

    const kicked = await kickQueuedImport();
    if (kicked && (kicked.ok === true || kicked.ok === false)) return kicked;

    const fromEval = evalBox.current;
    if (fromEval && fromEval.ok === true) {
      const data = fromEval.data as HostImportOutcome;
      if (isFinal(data)) return data;
    }

    await sleep(200);
  }

  try {
    fs.unlinkSync(resultPath);
  } catch {
    // cleanup
  }
  return { ok: false, reason: "Host script returned no result" };
}

export function isAeHost(): boolean {
  return cepHostAppId() === "AEFT" || Motionflow.host === "AE";
}
