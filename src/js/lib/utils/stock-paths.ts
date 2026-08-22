/**
 * Footage / stock download destination from Settings.
 * - Assets path (`customStockLocation`) is required unless overridden.
 * - "Use project location" overrides the download dir for footage only;
 *   it does not clear or replace the stored assets path.
 */
import {
  asBool,
  readPrefSettings,
  writePrefSettings,
} from "../api/preferences";
import { selectFolderAsync } from "./bolt";
import { Motionflow } from "@/sdk";
import { BRAND } from "@brands";
import { fs, os, path } from "../cep/node";

export function hasConfiguredAssetsPath(): boolean {
  try {
    return Boolean((readPrefSettings().customStockLocation || "").trim());
  } catch {
    return false;
  }
}

function persistAssetsPath(folder: string): void {
  const prefs = readPrefSettings();
  writePrefSettings({
    ...prefs,
    customStockLocation: folder,
    // Keep legacy flag in sync for older readers; UI no longer exposes it.
    useCustomPathForAssets: 1,
  });
}

/**
 * Ensure an assets download folder is configured (folder picker if empty).
 * Does not run when "Use project location" will override — caller decides.
 */
export async function ensureAssetsPathChosen(): Promise<
  { ok: true; path: string } | { ok: false; message: string }
> {
  const existing = (readPrefSettings().customStockLocation || "").trim();
  if (existing) return { ok: true, path: existing };

  const folder = await selectFolderAsync(
    "",
    `Choose where ${BRAND.authorName} should download footage`,
  );
  if (!folder) {
    return {
      ok: false,
      message:
        "Choose an assets folder in the dialog (or set it in Settings) to download footage.",
    };
  }
  persistAssetsPath(folder);
  return { ok: true, path: folder };
}

/**
 * Download dir for Import — never opens a native folder picker.
 * A picker behind After Effects looks like a dead click (Network stays empty).
 * Falls back to the OS temp directory, same as spunkram-assets.
 */
export async function resolveFootageDownloadDirSilent(): Promise<string> {
  try {
    const prefs = readPrefSettings();
    if (asBool(prefs.useCurrentProjectLocation)) {
      const projectDir = await Motionflow.getProjectFolderPath();
      if (projectDir.ok && projectDir.data) return projectDir.data;
    }
    const existing = (prefs.customStockLocation || "").trim();
    if (existing) return existing;
  } catch {
    // fall through to temp
  }
  try {
    if (typeof os?.tmpdir === "function") return os.tmpdir();
  } catch {
    // ignore
  }
  return "";
}

export async function resolveFootageDownloadDir(): Promise<
  { ok: true; dir: string } | { ok: false; message: string }
> {
  const prefs = readPrefSettings();

  if (asBool(prefs.useCurrentProjectLocation)) {
    const projectDir = await Motionflow.getProjectFolderPath();
    if (!projectDir.ok || !projectDir.data) {
      return {
        ok: false,
        message:
          "Save the project first to download footage next to it (or turn off “Use project location”).",
      };
    }
    const dir = projectDir.data;
    try {
      if (typeof fs?.existsSync === "function" && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // host path may still be writable
    }
    return { ok: true, dir };
  }

  const ensured = await ensureAssetsPathChosen();
  if (!ensured.ok) return ensured;

  const dir = path.normalize(ensured.path);
  try {
    if (typeof fs?.existsSync === "function" && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // continue; download will surface IO errors
  }
  return { ok: true, dir };
}
