/**
 * Install a pack from a local file: a raw `.spunkram`/`.atom`, or a `.zip`
 * downloaded from Market containing one alongside its preview/template
 * folders. Copies everything into the managed packages root and registers
 * the pack in `preferences.json`, so it shows up immediately in Editing.
 */
import { fs, os, path } from "../cep/node";
import { loadPreferencesFile, resolvePreferencesPath, savePreferencesFile } from "../api/preferences";
import { initPackageAsync, parsePackageFileFormat } from "./pack";
import type { InstalledPackMeta } from "./pack-types";
import { extractZipToFolder } from "./pack-zip";
import { reportSupportError, reportSupportInfo } from "@/api/support";

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function";
}

function installLog(
  phase: string,
  extra?: Record<string, string | number | boolean | null>,
): void {
  const detail = extra
    ? Object.entries(extra)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
    : "";
  const message = detail ? `${phase} ${detail}` : phase;
  try {
    console.info(`[pack.install] ${message}`);
  } catch {
    /* ignore */
  }
  reportSupportInfo("pack.install", message, extra);
}

/** `<same folder as preferences.json>/_ABS` — mirrors Beta's unified packages root. */
export function resolvePackagesInstallRoot(): string {
  const prefPath = resolvePreferencesPath();
  const base = prefPath ? path.dirname(prefPath) : "";
  const root = base
    ? path.join(base, "_ABS")
    : path.join(os.tmpdir(), "spunkram-library-packages");
  if (cepFsAvailable() && !fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function findPackFileRecursive(dir: string, depth = 0): string | null {
  if (depth > 4 || !fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && parsePackageFileFormat(entry.name)) {
      return path.join(dir, entry.name);
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findPackFileRecursive(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function copyFolderRecursive(source: string, destination: string): void {
  if (!fs.existsSync(source)) return;
  if (!fs.existsSync(destination)) fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyFolderRecursive(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

/**
 * Copy the pack file and every sibling (Assets / Previews / Fonts /
 * Spunkram Premiere Pro / …) into the managed install folder.
 * Market composer zips use Assets+Previews; legacy packs use brand folders.
 */
function copyPackBundle(sourceDir: string, targetDir: string, packFilePath: string): void {
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyFolderRecursive(from, to);
    } else if (from === packFilePath || entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "Pack";
}

export type InstallPackResult =
  | { ok: true; meta: InstalledPackMeta }
  | { ok: false; message: string };

/**
 * Install a pack given a local file path (`.spunkram`, `.atom`, or a `.zip`
 * bundling one). Copies the pack + its sibling asset/template folders into
 * the managed packages root, then registers it in preferences.json.
 */
export async function installPackFromFile(sourcePath: string): Promise<InstallPackResult> {
  if (!cepFsAvailable() || !fs.existsSync(sourcePath)) {
    return { ok: false, message: "File not found." };
  }

  let packFilePath = sourcePath;
  let cleanupStagingDir: string | null = null;
  const startedAt = Date.now();

  try {
    const sourceStat =
      typeof fs.statSync === "function" ? fs.statSync(sourcePath) : null;
    installLog("start", {
      sourcePath,
      size: sourceStat?.size ?? null,
      isZip: sourcePath.toLowerCase().endsWith(".zip"),
    });

    if (sourcePath.toLowerCase().endsWith(".zip")) {
      const stagingDir = path.join(
        os.tmpdir(),
        `spunkram-install-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      );
      const extractStarted = Date.now();
      installLog("extract.begin", { stagingDir });
      const written = extractZipToFolder(sourcePath, stagingDir);
      installLog("extract.done", {
        files: written.length,
        ms: Date.now() - extractStarted,
      });
      cleanupStagingDir = stagingDir;
      const found = findPackFileRecursive(stagingDir);
      if (!found) {
        installLog("extract.no_pack", { stagingDir });
        return { ok: false, message: "No .spunkram/.atom pack file found inside the ZIP." };
      }
      packFilePath = found;
      installLog("extract.pack_found", { packFilePath });
    } else if (!parsePackageFileFormat(sourcePath)) {
      return { ok: false, message: "Pick a .spunkram, .atom, or .zip file." };
    }

    const pack = await initPackageAsync(packFilePath);
    const { main } = pack.settings;
    installLog("parse.ok", {
      name: main.name || null,
      appID: main.software_id || null,
      version: main.version || null,
      treeFolders: Object.keys(pack.structure || {}).length,
    });

    const folderName = sanitizeFolderName(
      `${main.name || "Pack"}${main.software_id ? ` - ${main.software_id}` : ""}`,
    );
    const installRoot = resolvePackagesInstallRoot();
    const targetDir = path.join(installRoot, folderName);
    const sourceDir = path.dirname(packFilePath);
    const targetPackPath = path.join(targetDir, path.basename(packFilePath));

    const copyStarted = Date.now();
    copyPackBundle(sourceDir, targetDir, packFilePath);
    installLog("copy.done", {
      targetDir,
      ms: Date.now() - copyStarted,
    });

    const meta: InstalledPackMeta = {
      name: main.name || path.basename(packFilePath),
      author: main.cc_author_username || "Unknown",
      version: main.version || "1.0",
      path: targetPackPath,
      appID: main.software_id,
      appVersion: main.software_version,
    };

    const prefs = loadPreferencesFile();
    const packages = Array.isArray(prefs.packages) ? [...(prefs.packages as InstalledPackMeta[])] : [];
    const existingIndex = packages.findIndex((p) => p.name === meta.name && p.appID === meta.appID);
    if (existingIndex >= 0) packages[existingIndex] = meta;
    else packages.push(meta);
    prefs.packages = packages;
    savePreferencesFile(prefs);

    installLog("done", {
      name: meta.name,
      appID: meta.appID || null,
      path: meta.path,
      ms: Date.now() - startedAt,
    });

    return { ok: true, meta };
  } catch (e) {
    reportSupportError("pack.install", e, {
      sourcePath,
      ms: Date.now() - startedAt,
    });
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    if (cleanupStagingDir) {
      try {
        fs.rmSync(cleanupStagingDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  }
}

/** Remove an installed pack: preferences entry + its managed folder (only inside our install root). */
export function uninstallPack(meta: InstalledPackMeta): boolean {
  try {
    const prefs = loadPreferencesFile();
    const packages = Array.isArray(prefs.packages) ? (prefs.packages as InstalledPackMeta[]) : [];
    prefs.packages = packages.filter((p) => p.path !== meta.path);
    savePreferencesFile(prefs);

    const installRoot = resolvePackagesInstallRoot();
    const packDir = path.dirname(meta.path);
    if (cepFsAvailable() && packDir.startsWith(installRoot) && fs.existsSync(packDir)) {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
    return true;
  } catch {
    return false;
  }
}
