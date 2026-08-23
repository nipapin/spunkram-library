import { evalES } from "../lib/utils/bolt";
import { fs, os, path } from "../lib/cep/node";

export type AeWorkAreaExportResult = {
  source: string;
  dest: string;
  offset: number;
  durationSeconds: number;
  type: "composition";
};

type WorkAreaAudioInfo = {
  offset: number;
  durationSeconds: number;
  compId: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const softFail = (reason: string, message: string): Error => {
  const err = new Error(message) as Error & { soft?: boolean; reason?: string };
  err.soft = true;
  err.reason = reason;
  return err;
};

/**
 * Read the Work Area and audio state of the active comp.
 *
 * Pure read on purpose: After Effects only hands an evalScript value back for
 * scripts that change nothing — editing the project or writing a file loses the
 * callback, so anything with side effects must not be asked for an answer.
 */
async function readWorkAreaAudioInfo(): Promise<WorkAreaAudioInfo> {
  const raw = String(
    await evalES(
      `(function(){
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return "nocomp";
        var audio = "0";
        for (var i = 1; i <= comp.numLayers; i++) {
          if (comp.layer(i).hasAudio) { audio = "1"; break; }
        }
        return comp.workAreaStart + "|" + comp.workAreaDuration + "|" +
          comp.duration + "|" + audio + "|" + comp.id;
      })()`,
      true,
    ),
  ).trim();

  if (raw === "nocomp") {
    throw softFail("NO_ACTIVE_COMP", "Open a composition in After Effects, then try again.");
  }

  const parts = raw.split("|");
  const start = Number(parts[0]);
  const workArea = Number(parts[1]);
  const compDuration = Number(parts[2]);
  const durationSeconds = workArea > 0 ? workArea : compDuration;

  if (!(durationSeconds > 0)) {
    throw new Error(
      `Could not read the Work Area (host answered "${raw || "nothing"}"). Reload the panel and try again.`,
    );
  }
  if (parts[3] !== "1") {
    throw softFail("NO_AUDIO", "No audio layers found in the composition.");
  }

  return {
    offset: start >= 0 ? start : 0,
    durationSeconds,
    compId: Number(parts[4]),
  };
}

/** Assigns our comp to an already declared `comp` var. */
const findCompEs = (compId: number): string => `
        for (var i = 1; i <= app.project.numItems; i++) {
          var item = app.project.item(i);
          if (item.id === ${compId} && item instanceof CompItem) { comp = item; break; }
        }`;

/**
 * Bring the comp back to the front — rendering leaves the Render Queue focused
 * and the user loses the timeline they were working on.
 */
function openCompInViewer(compId: number): void {
  if (!(compId > 0)) return;
  void evalES(
    `(function(){
      var comp = null;
      try {${findCompEs(compId)}
        if (comp) comp.openInViewer();
      } catch (e) {}
    })()`,
    true,
  ).catch(() => {});
}

/** Start the render. It blocks After Effects and never answers — the file on disk is the signal. */
function startRender(): void {
  void evalES(
    `(function(){
      try {
        app.project.renderQueue.render();
      } catch (eRender) {
        try { $.writeln("[mf] render failed: " + eRender); } catch (eLog) {}
      }
    })()`,
    true,
  ).catch(() => {});
}

/** Queue the comp for an audio-only render. No answer is expected back. */
function queueAudioRender(
  esOutputPath: string,
  offset: number,
  durationSeconds: number,
): void {
  void evalES(
    `(function(){
      try {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return;

        var rqItem = app.project.renderQueue.items.add(comp);
        rqItem.timeSpanStart = ${offset};
        rqItem.timeSpanDuration = ${durationSeconds};

        var om = rqItem.outputModule(1);
        // Output templates are named per AE build and locale.
        var templates = om.templates;
        for (var t = 0; t < templates.length; t++) {
          var name = String(templates[t]).toLowerCase();
          if (
            name.indexOf("wav") >= 0 ||
            name.indexOf("aiff") >= 0 ||
            name.indexOf("mp3") >= 0 ||
            name.indexOf("audio") >= 0
          ) {
            om.applyTemplate(templates[t]);
            break;
          }
        }
        // applyTemplate resets the output path, so set the file last.
        om.file = new File("${esOutputPath}");
      } catch (e) {
        try { $.writeln("[mf] queue audio render failed: " + e); } catch (eLog) {}
      }
    })()`,
    true,
  ).catch(() => {
    // Project edits lose the callback — the queue is verified by a read below.
  });
}

/** `true` once a queue item points at our output file. Pure read. */
async function isQueuedForOutput(fileMarker: string): Promise<boolean> {
  const raw = String(
    await evalES(
      `(function(){
        var rq = app.project.renderQueue;
        for (var i = 1; i <= rq.numItems; i++) {
          try {
            var f = rq.item(i).outputModule(1).file;
            if (f && String(f.fsName).indexOf("${fileMarker}") >= 0) return "1";
          } catch (e) {}
        }
        return "0";
      })()`,
      true,
    ),
  ).trim();
  return raw === "1";
}

/** The rendered file, whatever extension the output template gave it (wav, aiff, mp3…). */
function findRenderedFile(dir: string, fileMarker: string): string {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.indexOf(fileMarker) !== 0) continue;
      if (/\.mp3$/i.test(name)) continue; // our own transcode target
      return path.join(dir, name);
    }
  } catch {
    // directory may be busy
  }
  return "";
}

/**
 * Wait for the rendered audio to appear and stabilize (size stops changing).
 * The extension comes from the output template, so the file is matched by name.
 */
async function waitForRenderedAudio(
  dir: string,
  fileMarker: string,
  timeoutMs: number,
  stableMs = 1000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  let stableSince = 0;
  let found = "";

  while (Date.now() < deadline) {
    found = findRenderedFile(dir, fileMarker);
    if (found) {
      try {
        const size = fs.statSync(found).size;
        if (size > 0) {
          if (size === lastSize) {
            if (Date.now() - stableSince >= stableMs) return found;
          } else {
            lastSize = size;
            stableSince = Date.now();
          }
        }
      } catch {
        // file is locked while AE writes it
      }
    }
    await sleep(200);
  }

  if (!found) {
    throw new Error("Render timed out: audio file not created. Check Work Area and try again.");
  }
  throw new Error("Render timed out: audio file did not stabilize.");
}

/**
 * Drop leftover queue items pointing at our output file, and hand the viewer
 * back to the comp first: the Render Queue is still in front at this point and
 * would stay there until the captions land at the end of the flow.
 */
function removeQueuedItems(fileMarker: string): void {
  void evalES(
    `(function(){
      try {
        var active = app.project.activeItem;
        if (active && active instanceof CompItem) active.openInViewer();
      } catch (eOpen) {}
      try {
        var rq = app.project.renderQueue;
        for (var i = rq.numItems; i >= 1; i--) {
          try {
            var item = rq.item(i);
            var f = item.outputModule(1).file;
            if (f && String(f.fsName).indexOf("${fileMarker}") >= 0) item.remove();
          } catch (eItem) {}
        }
      } catch (e) {}
    })()`,
    true,
  ).catch(() => {});
}

/**
 * Export the active comp's Work Area audio through the render queue.
 *
 * Read the range, queue the render, confirm it was queued, start it, then wait
 * for the file on disk. Only the reads are asked for an answer.
 */
export async function exportAeWorkAreaAudio(): Promise<AeWorkAreaExportResult> {
  const dir = path.join(os.tmpdir(), "aitools-cep");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const marker = `ae-audio-${Date.now()}`;
  const mp3Dest = path.join(dir, `${marker}.mp3`);
  const esOutputPath = path.join(dir, `${marker}.wav`).replace(/\\/g, "/");

  const info = await readWorkAreaAudioInfo();

  queueAudioRender(esOutputPath, info.offset, info.durationSeconds);

  let queued = false;
  for (let attempt = 0; attempt < 10 && !queued; attempt++) {
    queued = await isQueuedForOutput(marker);
    if (!queued) await sleep(200);
  }
  if (!queued) {
    throw new Error(
      "Could not add the composition to the render queue. Reload the panel and try again.",
    );
  }

  startRender();

  let renderedFile: string;
  try {
    renderedFile = await waitForRenderedAudio(dir, marker, 10 * 60 * 1000);
  } catch (err) {
    removeQueuedItems(marker);
    openCompInViewer(info.compId);
    throw err;
  }
  removeQueuedItems(marker);

  return {
    source: renderedFile,
    dest: mp3Dest,
    offset: info.offset,
    durationSeconds: info.durationSeconds,
    type: "composition",
  };
}
