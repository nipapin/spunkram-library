import { evalES } from "../lib/utils/bolt";
import { fs, os, path } from "../lib/cep/node";

export type AeWorkAreaExportResult = {
  source: string;
  dest: string;
  offset: number;
  durationSeconds: number;
  type: "composition";
};

type AddToRenderQueueResult = {
  ok: true;
  source: string;
  dest: string;
  offset: number;
  durationSeconds: number;
} | {
  ok: false;
  reason?: string;
  message?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const failFrom = (data: { reason?: string; message?: string }): Error => {
  const soft =
    data.reason === "NO_ACTIVE_COMP" ||
    data.reason === "NO_WORK_AREA";
  const msg =
    (typeof data.message === "string" && data.message) ||
    "Could not export audio. Set Work Area in After Effects and try again.";
  const err = new Error(msg);
  (err as Error & { soft?: boolean; reason?: string }).soft = soft;
  if (data.reason) (err as Error & { reason?: string }).reason = data.reason;
  return err;
};

/**
 * Wait for the output file to appear and stabilize (size stops changing).
 * Returns when the file exists and its size has not changed for `stableMs`.
 */
async function waitForFileStable(
  filePath: string,
  timeoutMs: number,
  stableMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  let stableSince = 0;

  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const size = stat.size;
        if (size > 0) {
          if (size === lastSize) {
            if (Date.now() - stableSince >= stableMs) {
              return;
            }
          } else {
            lastSize = size;
            stableSince = Date.now();
          }
        }
      }
    } catch {
      // file may be locked during write
    }
    await sleep(200);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error("Render timed out: audio file not created. Check Work Area and try again.");
  }
  throw new Error("Render timed out: audio file did not stabilize.");
}

/**
 * Export audio from the active AE comp's Work Area using the render queue.
 *
 * Flow:
 * 1. addToRenderQueue — ExtendScript adds active comp to queue, sets time span
 *    to work area, sets output file in temp, audio-only module. Returns immediately.
 * 2. Start render via renderQueue.render().
 * 3. Wait for the actual output file to appear and stabilize (size stops changing).
 *
 * This avoids the sidecar JSON / 10-minute poll approach.
 */
export async function exportAeWorkAreaAudio(): Promise<AeWorkAreaExportResult> {
  const tmpRoot = os.tmpdir();
  const dir = path.join(tmpRoot, "aitools-cep");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const timestamp = Date.now();
  const outputFile = path.join(dir, `ae-audio-${timestamp}.wav`);
  const mp3Dest = path.join(dir, `ae-audio-${timestamp}.mp3`);
  const esOutputPath = outputFile.replace(/\\/g, "/");

  // Clean up any existing file
  try {
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
  } catch {
    // ignore
  }

  // Step 1: Add to render queue and get metadata
  const addResult = await evalES(
    `(function() {
      var result = { ok: false, reason: "", message: "" };

      try {
        if (!app || !app.project) {
          result.reason = "NO_PROJECT";
          result.message = "No project open in After Effects.";
          return JSON.stringify(result);
        }

        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
          result.reason = "NO_ACTIVE_COMP";
          result.message = "No composition selected. Select a composition and try again.";
          return JSON.stringify(result);
        }

        var workStart = comp.workAreaStart;
        var workDur = comp.workAreaDuration;
        if (workDur <= 0) {
          result.reason = "NO_WORK_AREA";
          result.message = "Work Area duration is zero. Set a valid Work Area and try again.";
          return JSON.stringify(result);
        }

        // Check if comp has audio
        var hasAudio = false;
        for (var i = 1; i <= comp.numLayers; i++) {
          var layer = comp.layer(i);
          if (layer.hasAudio) {
            hasAudio = true;
            break;
          }
        }
        if (!hasAudio) {
          result.reason = "NO_AUDIO";
          result.message = "No audio layers found in the composition.";
          return JSON.stringify(result);
        }

        // Add to render queue
        var rqItem = app.project.renderQueue.items.add(comp);
        rqItem.timeSpanStart = workStart;
        rqItem.timeSpanDuration = workDur;

        // Set output module to audio only (WAV)
        var om = rqItem.outputModule(1);
        var outputPath = "${esOutputPath}";
        om.file = new File(outputPath);

        // Try to set audio-only template
        var templates = om.templates;
        var audioTemplate = null;
        for (var t = 0; t < templates.length; t++) {
          var tName = templates[t].toLowerCase();
          if (tName.indexOf("wav") >= 0 || tName.indexOf("audio") >= 0) {
            audioTemplate = templates[t];
            break;
          }
        }
        if (audioTemplate) {
          om.applyTemplate(audioTemplate);
        } else {
          // Fallback: use Lossless which includes audio
          try {
            om.applyTemplate("Lossless");
          } catch (e) {
            // Keep default template
          }
        }

        // Ensure file path is set after template
        om.file = new File(outputPath);

        result.ok = true;
        result.source = outputPath;
        result.dest = "${mp3Dest.replace(/\\/g, "/")}";
        result.offset = workStart;
        result.durationSeconds = workDur;

        return JSON.stringify(result);
      } catch (e) {
        result.reason = "ERROR";
        result.message = e.message || String(e);
        return JSON.stringify(result);
      }
    })()`,
    true,
  );

  let parsed: AddToRenderQueueResult;
  try {
    parsed = JSON.parse(String(addResult || "").trim()) as AddToRenderQueueResult;
  } catch {
    throw new Error("Failed to parse render queue result. Reload the panel and try again.");
  }

  if (!parsed.ok) {
    throw failFrom(parsed);
  }

  // Step 2: Start render
  // Note: renderQueue.render() may cause evalScript to return "" — this is expected.
  // We don't wait for the callback; we wait for the file instead.
  void evalES(
    `(function() {
      try {
        app.project.renderQueue.render();
      } catch (e) {
        // Render may throw or return empty — file wait handles this
      }
      return "started";
    })()`,
    true,
  ).catch(() => {
    // Expected: render() often makes evalScript return ""
  });

  // Step 3: Wait for output file to appear and stabilize
  // Use a generous timeout for long compositions
  const renderTimeoutMs = 10 * 60 * 1000; // 10 minutes max
  try {
    await waitForFileStable(outputFile, renderTimeoutMs, 1000);
  } catch (err) {
    // Clean up render queue on failure
    void evalES(
      `(function() {
        try {
          var rq = app.project.renderQueue;
          for (var i = rq.numItems; i >= 1; i--) {
            var item = rq.item(i);
            if (item.status === RQItemStatus.QUEUED || item.status === RQItemStatus.UNQUEUED) {
              item.remove();
            }
          }
        } catch (e) {}
        return "cleaned";
      })()`,
      true,
    ).catch(() => {});
    throw err;
  }

  return {
    source: outputFile,
    dest: mp3Dest,
    offset: parsed.offset,
    durationSeconds: parsed.durationSeconds,
    type: "composition",
  };
}
