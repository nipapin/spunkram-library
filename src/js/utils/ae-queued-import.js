import { Motionflow } from "@/sdk";
import { cepHostAppId, evalES } from "../lib/utils/bolt";
import { fs, os, path } from "../lib/cep/node";
import { ensureAsciiImportPath, esPath } from "./ae-import-path";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function readSidecarFile(filePath, startedAt, requireFresh = true) {
    try {
        if (!fs.existsSync(filePath))
            return undefined;
        if (requireFresh && fs.statSync(filePath).mtimeMs < startedAt - 50)
            return undefined;
        const raw = fs.readFileSync(filePath, "utf8").trim();
        if (!raw)
            return undefined;
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
function isFinal(data) {
    if (!data || typeof data !== "object")
        return false;
    if (data.status === "started")
        return false;
    return data.ok === true || data.ok === false;
}
function parseKickPayload(raw) {
    try {
        const parsed = JSON.parse(String(raw || "").trim());
        if (!parsed || typeof parsed !== "object")
            return undefined;
        if (parsed.evalESError)
            return undefined;
        if (parsed.ok === false && (parsed.reason === "NO_FILE" || parsed.reason === "NO_KICK")) {
            return undefined;
        }
        if (parsed.ok === true || parsed.ok === false)
            return parsed;
        return undefined;
    }
    catch {
        return undefined;
    }
}
async function kickQueuedImport() {
    const raw = await evalES(`(function(){
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
    })()`, true);
    return parseKickPayload(String(raw || ""));
}
async function scheduleImportKick() {
    await evalES(`(function(){
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
    })()`, true);
}
async function waitForQueueEval(evalBox, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (evalBox.current)
            return;
        await sleep(50);
    }
}
function readImportSidecar(resultPath, startedAt) {
    const fallback = path.join(os.tmpdir(), "mf-ae-import-last.json");
    const fromResult = readSidecarFile(resultPath, startedAt, false);
    if (isFinal(fromResult))
        return fromResult;
    const fromFallback = readSidecarFile(fallback, startedAt, true);
    if (isFinal(fromFallback))
        return fromFallback;
    return undefined;
}
/**
 * Run AE queued import with scheduleTask kick + sidecar poll.
 * Voiceover audio still uses this path. Stock footage uses Motionflow.importMedia.
 */
export async function runAeQueuedHostImport(filePath, destination, duration, callImport) {
    if (cepHostAppId() !== "AEFT") {
        const wrapped = await callImport(filePath, destination, duration, "");
        if (!wrapped.ok)
            return { ok: false, reason: wrapped.error };
        return wrapped.data;
    }
    const importPath = esPath(ensureAsciiImportPath(filePath));
    const startedAt = Date.now();
    const resultPath = esPath(path.join(os.tmpdir(), `mf-import-${startedAt}-${Math.random().toString(36).slice(2, 6)}.json`));
    try {
        fs.unlinkSync(resultPath);
    }
    catch {
        // no leftover
    }
    const evalBox = { current: null };
    void callImport(importPath, destination, duration, resultPath).then((r) => {
        evalBox.current = r;
    }, (e) => {
        evalBox.current = {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
        };
    });
    // Wait until ExtendScript queues the job — scheduleTask before this races NO_FILE.
    await waitForQueueEval(evalBox, 15_000);
    if (evalBox.current && !evalBox.current.ok) {
        const err = String(evalBox.current.error || "");
        const emptyEval = /no result/i.test(err) ||
            /unexpected end of json/i.test(err) ||
            /host script failed/i.test(err);
        if (!emptyEval)
            return { ok: false, reason: err };
    }
    const queueData = evalBox.current?.ok
        ? evalBox.current.data
        : undefined;
    if (queueData && isFinal(queueData))
        return queueData;
    await scheduleImportKick();
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        const sidecar = readImportSidecar(resultPath, startedAt);
        if (sidecar)
            return sidecar;
        const kicked = await kickQueuedImport();
        if (kicked && (kicked.ok === true || kicked.ok === false))
            return kicked;
        const fromEval = evalBox.current;
        if (fromEval && fromEval.ok === true) {
            const data = fromEval.data;
            if (isFinal(data))
                return data;
        }
        await sleep(200);
    }
    try {
        fs.unlinkSync(resultPath);
    }
    catch {
        // cleanup
    }
    return { ok: false, reason: "Host script returned no result" };
}
export function isAeHost() {
    return cepHostAppId() === "AEFT" || Motionflow.host === "AE";
}
