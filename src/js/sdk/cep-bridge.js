import { evalTS, reloadJSX, cepHostAppId, probeHostAppIdFromDom, evalES } from "../lib/utils/bolt";
import { fs, os, path } from "../lib/cep/node";
import { getResolvedHostSync } from "../lib/utils/host-identity";
import { ensureAsciiImportPath, esPath } from "../utils/ae-import-path";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * A CEP callback can never be counted on to fire: AE drops it while a modal
 * dialog is up (missing fonts on project import, for one) and a promise that
 * never settles freezes the panel with no way out.
 */
const HOST_CALL_TIMEOUT_MS = 120 * 1000;
const hostLabel = () => (getResolvedHostSync() ?? cepHostAppId()) === "PPRO"
    ? "Premiere Pro"
    : "After Effects";
function withHostCallTimeout(promise, functionName) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${hostLabel()} did not answer "${functionName}". Close any open dialog in the app, then try again.`));
        }, HOST_CALL_TIMEOUT_MS);
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
const readSidecar = (resultPath) => {
    try {
        if (!fs.existsSync(resultPath))
            return undefined;
        const raw = fs.readFileSync(resultPath, "utf8").trim();
        if (!raw)
            return undefined;
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
};
const isSidecarStarted = (data) => !!data &&
    typeof data === "object" &&
    data.status === "started";
/**
 * Write payload to temp JSON (ASCII-safe) and pass path to ExtendScript.
 * Keeps cyrillic out of evalScript strings.
 *
 * The sidecar `.result.json` the host writes is the answer, not the evalScript
 * callback: a script that edits the project comes back empty at best and often
 * never comes back at all, so the run is never awaited on its own.
 */
async function withHostJsonFile(data, run) {
    const dir = path.join(os.tmpdir(), "aitools-cep");
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `host-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    const resultPath = filePath.replace(/\.json$/i, ".result.json");
    const asciiJson = JSON.stringify(data).replace(/[\u007f-\uffff]/g, (ch) => {
        const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
        return `\\u${hex}`;
    });
    fs.writeFileSync(filePath, asciiJson, "utf8");
    try {
        try {
            fs.unlinkSync(resultPath);
        }
        catch {
            // no previous sidecar
        }
        // ExtendScript File() is more reliable with forward slashes on Windows.
        const esPath = filePath.replace(/\\/g, "/");
        let out;
        let runError;
        let runSettled = false;
        void run(esPath).then((value) => {
            out = value;
            runSettled = true;
        }, (error) => {
            runError = error;
            runSettled = true;
        });
        if (window.cep && cepHostAppId() === "AEFT") {
            void evalES(`(function(){
        try {
          app.scheduleTask(
            "try{if($._mfRunQueuedApply)$._mfRunQueuedApply();}catch(e){}",
            80,
            false
          );
          return "scheduled";
        } catch (e) {
          return String(e && e.message != null ? e.message : e);
        }
      })()`, true);
        }
        const hardDeadline = Date.now() + 3 * 60 * 1000;
        let graceDeadline = 0;
        while (Date.now() < hardDeadline) {
            const sidecar = readSidecar(resultPath);
            if (sidecar !== undefined && !isSidecarStarted(sidecar))
                return sidecar;
            if (isSidecarStarted(sidecar)) {
                // Host reported it started — it owns the timing now.
                graceDeadline = 0;
            }
            else if (runSettled) {
                // A callback that carries a value means the host finished and answered.
                if (!runError && out != null && !isSidecarStarted(out))
                    return out;
                // Host returned JSON null — soft failure, not a hang.
                if (!runError && out === null) {
                    throw new Error("Could not update captions on the timeline.");
                }
                // Otherwise give the host a moment to flush the sidecar.
                if (!graceDeadline)
                    graceDeadline = Date.now() + 2000;
                if (Date.now() > graceDeadline)
                    break;
            }
            await sleep(150);
        }
        const late = readSidecar(resultPath);
        if (late !== undefined && !isSidecarStarted(late))
            return late;
        if (runError)
            throw runError;
        if (out != null && !isSidecarStarted(out))
            return out;
        if (runSettled && out === null) {
            throw new Error("Could not update captions on the timeline.");
        }
        throw new Error(`${hostLabel()} did not answer. Reload the panel and try again.`);
    }
    finally {
        try {
            fs.unlinkSync(filePath);
        }
        catch {
            // temp cleanup best-effort
        }
        try {
            fs.unlinkSync(resultPath);
        }
        catch {
            // temp cleanup best-effort
        }
    }
}
/** CEP/Bolt adapter for motionflow-sdk — only place that touches CSInterface. */
export function createCepBridge() {
    return {
        getHost() {
            // DOM probe beats CSInterface — AE 24–25 can report PPRO inside After Effects.
            const id = getResolvedHostSync() ?? cepHostAppId();
            if (id === "AEFT")
                return "AE";
            if (id === "PPRO")
                return "PPRO";
            return null;
        },
        callHost(functionName, ...args) {
            return withHostCallTimeout(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            evalTS(functionName, ...args), functionName);
        },
        evalScript(script) {
            return evalES(script, true);
        },
        prepareImportPath(filePath) {
            return esPath(ensureAsciiImportPath(filePath));
        },
        isPanelEnvironment() {
            return typeof window !== "undefined" && !!window.cep;
        },
        async loadHostScripts() {
            if (!window.cep)
                return;
            await reloadJSX();
            await probeHostAppIdFromDom();
        },
        async refreshHost() {
            if (!window.cep)
                return null;
            await probeHostAppIdFromDom();
            const id = cepHostAppId();
            if (id === "AEFT")
                return "AE";
            if (id === "PPRO")
                return "PPRO";
            return null;
        },
        withJsonFile: withHostJsonFile,
    };
}
