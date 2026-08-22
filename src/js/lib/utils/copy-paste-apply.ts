/**
 * Premiere FULL_PROJECT apply via host TS copy/paste + Motionflow.dll.
 * Port of Spunkram Beta `js/features/apply-item.js` → `customChain`.
 */
import { csi, evalTS } from "@/lib/utils/bolt";
import { fs, os, path, zlib } from "@/lib/cep/node";
import { MotionFlow } from "@/sdk";

/** `%USER_DATA%/Adobe/Common/{folder}/` — PTX seed destination (legacy parity). */
const PTX_COMMON_FOLDER = "Motionflow";

export { resolveFullProjectAssetsPath } from "./pack-folders";

export type FullProjectApplyArgs = {
  /** Absolute path to decrypted .prproj */
  projectPath: string;
  /** Absolute path to pack `_Assets/<folder>` for relinking missing media */
  assetsPath: string;
  /** Sequence / preset name inside the .prproj */
  presetName: string;
  /** Pack display name — used for project bin structure */
  packName: string;
  /** Category path segments (groups) for bin tree */
  groups: string[];
  /** Strip audio clips after paste when false */
  keepAudio?: boolean;
};

export type FullProjectApplyResult =
  | { ok: true }
  | { ok: false; message: string };

function isWin(): boolean {
  try {
    return os.platform() === "win32";
  } catch {
    return csi.getOSInformation?.()?.includes("Windows") ?? true;
  }
}

async function undoGroupStart(): Promise<boolean> {
  const r = await evalTS("undoGroupStart");
  return r?.ok === true;
}

async function undoGroupEnd(): Promise<void> {
  await evalTS("undoGroupEnd");
}

async function undoGroupAbort(): Promise<void> {
  await evalTS("undoGroupAbort");
}

function extensionPath(): string {
  return csi.getSystemPath("extension");
}

/** USER_DATA/Adobe/Common/Motionflow/ — PTX seed destination. */
function getPtxFolder(): string {
  const userData = csi.getSystemPath("userData");
  const folder = path.join(userData, "Adobe", "Common", PTX_COMMON_FOLDER);
  try {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  } catch {
    // ignore
  }
  return folder;
}

/** Copy template/colormatte seeds from extension bin → Common/Motionflow once. */
function ensurePtxSeeds(): void {
  const dest = getPtxFolder();
  const srcBin = path.join(extensionPath(), "bin");
  for (const name of ["template", "colormatte"] as const) {
    const from = path.join(srcBin, name);
    const to = path.join(dest, name);
    try {
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.copyFileSync(from, to);
      }
    } catch {
      // non-fatal — prepare* will fail later with a clearer error
    }
  }
}

/**
 * Best-effort install of Premiere Motionflow bridge plugins (requires admin on first run).
 * Without these, ExternalObject execute(cmd.edit.*) may no-op.
 */
export async function ensureMotionflowBridgePlugins(): Promise<void> {
  if (!isWin()) return;
  const ext = extensionPath();
  const pairs: [string, string][] = [
    [
      path.join(ext, "bin", "win", "MotionflowBridge.acsrf"),
      "C:\\Program Files\\Adobe\\Common\\Plug-ins\\ControlSurface\\MotionflowBridge.acsrf",
    ],
    [
      path.join(ext, "bin", "win", "MotionflowInit.prm"),
      "C:\\Program Files\\Adobe\\Common\\Plug-ins\\7.0\\MediaCore\\MotionflowInit.prm",
    ],
  ];
  const missing = pairs.filter(([src, dest]) => fs.existsSync(src) && !fs.existsSync(dest));
  if (!missing.length) return;
  console.warn(
    "[FULL_PROJECT] Premiere Motionflow bridge plugins missing. Copy from extension bin/win into Adobe Common Plug-ins if paste fails:",
    missing.map(([, d]) => d),
  );
}

function gzipFileSync(inputPath: string, outputPath: string): void {
  const data = fs.readFileSync(inputPath) as Buffer;
  const gz = zlib.gzipSync(data);
  fs.writeFileSync(outputPath, gz);
}

async function extractPremiereVersion(): Promise<string> {
  try {
    const prefs = await evalTS("copyPasteGetAppPrefs");
    const major = Number((prefs as { version?: string })?.version);
    if (!Number.isFinite(major)) return 'Version="32"';
    return `Version="${major + 17}"`;
  } catch {
    return 'Version="32"';
  }
}

async function preparePtxProject(
  templateName: "template" | "colormatte",
  resolution: [number, number],
  versionTag: string,
): Promise<void> {
  const ptxPath = getPtxFolder();
  const templatePath = path.join(ptxPath, templateName);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`PTX seed missing: ${templatePath}`);
  }
  const outName =
    templateName === "colormatte"
      ? `cm_${resolution.join("x")}.prproj`
      : `${resolution.join("x")}.prproj`;
  const outPath = path.join(ptxPath, outName);
  if (fs.existsSync(outPath)) return;

  const raw = fs.readFileSync(templatePath, { encoding: "utf8" }).toString();
  const newData = raw
    .replace(/%DIMENSIONS%/g, resolution.join(","))
    .replace(/%VERSION%/g, versionTag);
  const tempPath = path.join(ptxPath, `${templateName}.temp`);
  fs.writeFileSync(tempPath, newData, { encoding: "utf8" });
  try {
    gzipFileSync(tempPath, outPath);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Apply a FULL_PROJECT .prproj onto the active Premiere sequence via copy/paste injection.
 */
export async function applyFullProjectViaCopyPaste(
  args: FullProjectApplyArgs,
): Promise<FullProjectApplyResult> {
  await MotionFlow.ready();
  ensurePtxSeeds();
  await ensureMotionflowBridgePlugins();

  if (!fs.existsSync(args.projectPath)) {
    return { ok: false, message: `Project file missing: ${path.basename(args.projectPath)}` };
  }

  // Check native library exists before proceeding
  if (isWin()) {
    const dllHint = path.join(extensionPath(), "bin", "win", "Motionflow.dll");
    if (!fs.existsSync(dllHint)) {
      return {
        ok: false,
        message: "Motionflow.dll missing from extension bin/win — rebuild/reinstall the panel.",
      };
    }
  } else {
    // Mac: the bundle lives under bin/mac/, not directly in the extension root
    const bundleHint = path.join(extensionPath(), "bin", "mac", "Motionflow.bundle");
    if (!fs.existsSync(bundleHint)) {
      return {
        ok: false,
        message: "Motionflow.bundle missing from extension bin/mac — rebuild/reinstall the panel.",
      };
    }
  }

  let undoStarted = false;
  try {
    const removeAudio = args.keepAudio === false;
    const ptxFolder = getPtxFolder().replace(/\\/g, "/");
    const ptxPathEs = (ptxFolder.endsWith("/") ? ptxFolder : ptxFolder + "/").replace(
      /\\/g,
      "/",
    );

    await evalTS("copyPasteCheckForDuplicatesOfAuthorFolder");

    await evalTS("copyPasteCreateStructure", {
      packName: args.packName,
      groups: args.groups || [],
    });

    const existsResult = await evalTS("copyPasteIsSelectedItemExists", args.presetName);
    const alreadyImported = existsResult?.exists === true;
    if (!alreadyImported) {
      const projectEs = args.projectPath.replace(/\\/g, "/");
      await evalTS("copyPasteImportSelectedItem", projectEs);
    }

    const libraryBasePath = extensionPath().replace(/\\/g, "/");
    const platform = isWin() ? "win" : "mac";
    const lib = await evalTS("copyPasteInitializeLibrary", libraryBasePath, platform);
    if (!lib?.ready) {
      return {
        ok: false,
        message: `Motionflow library failed to load: ${(lib as { error?: string })?.error || "unknown"}`,
      };
    }

    const metadata = await evalTS("copyPasteGetMetadata");
    if (!metadata?.ok) {
      return { ok: false, message: "Open a sequence in Premiere Pro first." };
    }
    const { sequenceID, resolution } = metadata as {
      sequenceID: string;
      resolution: [number, number];
    };

    const presetResult = await evalTS("copyPasteGetSelectedItem", args.presetName);
    const presetSequenceID = presetResult?.sequenceID;
    if (!presetSequenceID) {
      return {
        ok: false,
        message: `Could not find sequence "${args.presetName}" after importing the project.`,
      };
    }

    const assetsNative = args.assetsPath ? path.normalize(args.assetsPath) : "";
    if (assetsNative) {
      await evalTS("copyPasteResolveMissingFootages", assetsNative, args.presetName);
    }

    const resKey = `${resolution[0]}x${resolution[1]}`;
    const resExistsResult = await evalTS("copyPasteIsResolutionExists", resKey);
    const resExists = resExistsResult?.exists === true;
    if (!resExists) {
      const versionTag = await extractPremiereVersion();
      await preparePtxProject("template", resolution, versionTag);
      await preparePtxProject("colormatte", resolution, versionTag);
    }

    const adjResult = await evalTS("copyPasteImportAdjustmentSequence", ptxPathEs, resKey);
    if (adjResult && "ok" in adjResult && adjResult.ok === false) {
      return { ok: false, message: `importAdjustmentSequence: ${adjResult.error}` };
    }
    const cmResult = await evalTS("copyPasteImportColorMatteSequence", ptxPathEs, resKey);
    if (cmResult && "ok" in cmResult && cmResult.ok === false) {
      return { ok: false, message: `importColorMatteSequence: ${cmResult.error}` };
    }

    await evalTS("copyPasteCollectClipsPreset", String(presetSequenceID));
    await evalTS("copyPasteExecuteCommand", "cmd.edit.copy");

    undoStarted = await undoGroupStart();

    const prepareResult = await evalTS("copyPastePrepareToPastePreset", sequenceID);
    if (!prepareResult?.ok) {
      if (undoStarted) await undoGroupAbort();
      return {
        ok: false,
        message: `prepareToPastePreset failed: ${(prepareResult as { error?: string })?.error || "unknown"}`,
      };
    }

    await evalTS("copyPasteExecuteCommand", "cmd.edit.paste");
    await evalTS("copyPasteExecuteCommand", "cmd.clip.group");
    await evalTS("copyPasteDetouchPreset", {
      tracks: prepareResult.tracks,
      savePlayerPosition: prepareResult.savePlayerPosition,
      resolution: resKey,
      removeAudio,
    });

    if (undoStarted) {
      await undoGroupEnd();
      undoStarted = false;
    }

    return { ok: true };
  } catch (err) {
    if (undoStarted) {
      try {
        await undoGroupAbort();
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
