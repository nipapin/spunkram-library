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
import { reportSupportError } from "@/api/support";

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function";
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

const SIBLING_FOLDER_NAMES = [
  "Spunkram Preview Assets",
  "Atom Preview Assets",
  "Spunkram Premiere Pro",
  "Atom Premiere Pro",
  "Spunkram After Effects",
  "Atom After Effects",
];

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

  try {
    if (sourcePath.toLowerCase().endsWith(".zip")) {
      const stagingDir = path.join(
        os.tmpdir(),
        `spunkram-install-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      );
      extractZipToFolder(sourcePath, stagingDir);
      cleanupStagingDir = stagingDir;
      const found = findPackFileRecursive(stagingDir);
      if (!found) {
        return { ok: false, message: "No .spunkram/.atom pack file found inside the ZIP." };
      }
      packFilePath = found;
    } else if (!parsePackageFileFormat(sourcePath)) {
      return { ok: false, message: "Pick a .spunkram, .atom, or .zip file." };
    }

    const pack = await initPackageAsync(packFilePath);
    const { main } = pack.settings;
    const folderName = sanitizeFolderName(
      `${main.name || "Pack"}${main.software_id ? ` - ${main.software_id}` : ""}`,
    );
    const installRoot = resolvePackagesInstallRoot();
    const targetDir = path.join(installRoot, folderName);
    fs.mkdirSync(targetDir, { recursive: true });

    const sourceDir = path.dirname(packFilePath);
    const targetPackPath = path.join(targetDir, path.basename(packFilePath));
    fs.copyFileSync(packFilePath, targetPackPath);

    for (const siblingName of SIBLING_FOLDER_NAMES) {
      copyFolderRecursive(path.join(sourceDir, siblingName), path.join(targetDir, siblingName));
    }

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

    return { ok: true, meta };
  } catch (e) {
    reportSupportError("pack.install", e);
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
