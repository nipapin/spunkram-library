/**
 * Premiere FULL_PROJECT apply via `$._copyPasteSystem` + Motionflow.dll.
 * Port of Spunkram Beta `js/features/apply-item.js` → `customChain`.
 */
import { csi, evalES } from "@/lib/utils/bolt";
import { fs, os, path, zlib } from "@/lib/cep/node";
import { loadLegacyJsx, legacyLoaded } from "@/sdk/legacy-loader";

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

/** Escape a value for embedding inside an ExtendScript double-quoted string. */
function esQuote(value: string): string {
  return JSON.stringify(value);
}

async function cps(script: string): Promise<string> {
  // Global — `$._copyPasteSystem` lives outside Bolt host namespace.
  return evalES(script, true);
}

async function ensureLegacy(): Promise<void> {
  if (!legacyLoaded()) {
    await loadLegacyJsx();
  }
}

function extensionPath(): string {
  return csi.getSystemPath("extension");
}

/** USER_DATA/Adobe/Common/Spunkram/ — PTX seed destination (Beta parity). */
function getPtxFolder(): string {
  const userData = csi.getSystemPath("userData");
  const folder = path.join(userData, "Adobe", "Common", "Spunkram");
  try {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  } catch {
    // ignore
  }
  return folder;
}

/** Copy template/colormatte seeds from extension bin → Common/Spunkram once. */
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
  // Soft skip — user may install manually; apply still attempts initializeLibrary.
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
  const prefsRaw = await cps(`$._copyPasteSystem.getAppPrefs()`);
  try {
    const prefs = JSON.parse(prefsRaw) as { version?: string };
    const major = Number(prefs.version);
    if (!Number.isFinite(major)) return 'Version="32"';
    // Beta: Version = Premiere major + 17 (project XML schema quirk)
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
  await ensureLegacy();
  ensurePtxSeeds();
  await ensureMotionflowBridgePlugins();

  if (!fs.existsSync(args.projectPath)) {
    return { ok: false, message: `Project file missing: ${path.basename(args.projectPath)}` };
  }

  const dllHint = path.join(extensionPath(), "bin", "win", "Motionflow.dll");
  if (isWin() && !fs.existsSync(dllHint)) {
    return {
      ok: false,
      message: "Motionflow.dll missing from extension bin/win — rebuild/reinstall the panel.",
    };
  }

  let undoStarted = false;
  try {
    const removeAudio = args.keepAudio === false;
    const ptxFolder = getPtxFolder().replace(/\\/g, "/");
    // ExtendScript File paths — keep trailing slash like Beta
    const ptxPathEs = (ptxFolder.endsWith("/") ? ptxFolder : ptxFolder + "/").replace(
      /\\/g,
      "/",
    );

    await cps(`$._copyPasteSystem.checkForDuplicatesOfAuthorFolder()`);

    // Bin tree for this pack item
    const groupsJson = JSON.stringify(args.groups || []);
    await cps(
      `$._copyPasteSystem.createStructure(${esQuote(args.packName)}, ${groupsJson})`,
    );

    const existsRaw = await cps(
      `$._copyPasteSystem.isSelectedItemExists(${esQuote(args.presetName)})`,
    );
    const alreadyImported =
      existsRaw === "true" || existsRaw.trim().toLowerCase() === "true";
    if (!alreadyImported) {
      // Windows ExtendScript prefers forward slashes
      const projectEs = args.projectPath.replace(/\\/g, "/");
      await cps(`$._copyPasteSystem.importSelectedItem(${esQuote(projectEs)})`);
    }

    const libraryBasePath = extensionPath().replace(/\\/g, "/");
    const platform = isWin() ? "win" : "mac";
    const libRaw = await cps(
      `$._copyPasteSystem.initializeLibrary(${esQuote(libraryBasePath)}, ${esQuote(platform)})`,
    );
    try {
      const lib = JSON.parse(libRaw) as { ready?: boolean; error?: string };
      if (!lib.ready) {
        return {
          ok: false,
          message: `Motionflow library failed to load: ${lib.error || libRaw}`,
        };
      }
    } catch {
      return { ok: false, message: `Motionflow library failed to load: ${libRaw}` };
    }

    const metadataRaw = await cps(`$._copyPasteSystem.getMetadata()`);
    if (!metadataRaw || metadataRaw === "null") {
      return { ok: false, message: "Open a sequence in Premiere Pro first." };
    }
    const metadata = JSON.parse(metadataRaw) as {
      sequenceID: string;
      resolution: [number, number];
    };
    const { sequenceID, resolution } = metadata;

    const presetSequenceID = await cps(
      `$._copyPasteSystem.getSelectedItem(${esQuote(args.presetName)})`,
    );
    if (!presetSequenceID || presetSequenceID === "null") {
      return {
        ok: false,
        message: `Could not find sequence "${args.presetName}" after importing the project.`,
      };
    }

    // Relink offline media from pack `_Assets`. Use native OS separators —
    // Premiere changeMediaPath breaks on mixed `/` + `\` paths (Beta kept `\`).
    const assetsNative = args.assetsPath ? path.normalize(args.assetsPath) : "";
    if (assetsNative) {
      await cps(
        `$._copyPasteSystem.resolveMissingFootages(${esQuote(assetsNative)}, ${esQuote(args.presetName)})`,
      );
    }

    const resKey = `${resolution[0]}x${resolution[1]}`;
    const resExistsRaw = await cps(
      `$._copyPasteSystem.isResolutionExists(${esQuote(resKey)})`,
    );
    const resExists = resExistsRaw === "true";
    if (!resExists) {
      const versionTag = await extractPremiereVersion();
      await preparePtxProject("template", resolution, versionTag);
      await preparePtxProject("colormatte", resolution, versionTag);
    }

    await cps(
      `$._copyPasteSystem.importAdjustmentSequence(${esQuote(ptxPathEs)}, ${esQuote(resKey)})`,
    );
    await cps(
      `$._copyPasteSystem.importColorMatteSequence(${esQuote(ptxPathEs)}, ${esQuote(resKey)})`,
    );
    await cps(`$._copyPasteSystem.collectClipsPreset(${esQuote(String(presetSequenceID))})`);

    await cps(`$._copyPasteSystem.executeCommand("cmd.edit.copy")`);

    const startResult = await cps(`PremiereUndoGroups.start()`);
    undoStarted = startResult === "OK";

    const detouchRaw = await cps(
      `$._copyPasteSystem.prepareToPastePreset(${esQuote(sequenceID)})`,
    );
    let detouchArgs: string;
    try {
      const parsed = JSON.parse(detouchRaw) as Record<string, unknown>;
      detouchArgs = JSON.stringify({
        ...parsed,
        resolution: resKey,
        removeAudio,
      });
    } catch {
      if (undoStarted) await cps(`PremiereUndoGroups.abort()`);
      return { ok: false, message: `prepareToPastePreset failed: ${detouchRaw}` };
    }

    await cps(`$._copyPasteSystem.executeCommand("cmd.edit.paste")`);
    await cps(`$._copyPasteSystem.executeCommand("cmd.clip.group")`);
    await cps(`$._copyPasteSystem.detouchPreset(${detouchArgs})`);

    if (undoStarted) {
      await cps(`PremiereUndoGroups.end()`);
      undoStarted = false;
    }

    return { ok: true };
  } catch (err) {
    if (undoStarted) {
      try {
        await cps(`PremiereUndoGroups.abort()`);
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
