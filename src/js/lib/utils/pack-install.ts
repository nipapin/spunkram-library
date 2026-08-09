/**
 * Install a pack from a local file: a raw `.spunkram`/`.atom`, or a `.zip`
 * downloaded from Market containing one alongside its preview/template
 * folders. Copies everything into the managed packages root and registers
 * the pack in `preferences.json`, so it shows up immediately in Editing.
 */
import { fs, os, path } from "../cep/node";
import {
  loadPreferencesFile,
  readPrefSettings,
  resolvePreferencesPath,
  savePreferencesFile,
} from "../api/preferences";
import { initPackageAsync, parsePackageFileFormat } from "./pack";
import type { InstalledPackMeta } from "./pack-types";
import { extractZipToFolder } from "./pack-zip";
import { installPackFonts } from "./pack-fonts";
import { reportSupportError, reportSupportInfo } from "@/api/support";
import { currentPackHost, normalizePackHost, type PackHostId } from "./pack-host";

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

function defaultPackagesInstallRoot(): string {
  const prefPath = resolvePreferencesPath();
  const base = prefPath ? path.dirname(prefPath) : "";
  return base
    ? path.join(base, "_ABS")
    : path.join(os.tmpdir(), "spunkram-library-packages");
}

/**
 * Packages install root.
 * When Settings → "Use custom path for packages" is on and a folder is set,
 * installs land there; otherwise `<prefs dir>/_ABS`.
 * Pass a pack host to install under `<root>/AE` or `<root>/PR`.
 */
export function resolvePackagesInstallRoot(host?: PackHostId | null): string {
  let root = defaultPackagesInstallRoot();
  try {
    const prefs = readPrefSettings();
    const useCustom = Boolean(Number(prefs.useCustomPathBySubscription));
    const custom = (prefs.absCustomAbsolutePath || "").trim();
    if (useCustom && custom) {
      root = path.normalize(custom);
    }
  } catch {
    // fall back to default
  }
  const packHost = host === undefined ? currentPackHost() : host;
  if (packHost) {
    root = path.join(root, packHost);
  }
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
    const packHost = normalizePackHost(main.software_id);
    const host = currentPackHost();
    installLog("parse.ok", {
      name: main.name || null,
      appID: main.software_id || null,
      version: main.version || null,
      treeFolders: Object.keys(pack.structure || {}).length,
    });

    if (host && packHost && packHost !== host) {
      return {
        ok: false,
        message:
          host === "AE"
            ? "This pack is for Premiere Pro and can't be installed in After Effects."
            : "This pack is for After Effects and can't be installed in Premiere Pro.",
      };
    }
    if (host && !packHost) {
      return {
        ok: false,
        message: "This pack has no host app id (AE/PR) and can't be installed safely.",
      };
    }

    const folderName = sanitizeFolderName(
      `${main.name || "Pack"}${main.software_id ? ` - ${main.software_id}` : ""}`,
    );
    const installRoot = resolvePackagesInstallRoot(packHost || host);
    const targetDir = path.join(installRoot, folderName);
    const sourceDir = path.dirname(packFilePath);
    const targetPackPath = path.join(targetDir, path.basename(packFilePath));

    const copyStarted = Date.now();
    copyPackBundle(sourceDir, targetDir, packFilePath);
    installLog("copy.done", {
      targetDir,
      ms: Date.now() - copyStarted,
    });

    try {
      const fontsInstalled = await installPackFonts(targetPackPath);
      if (fontsInstalled > 0) {
        installLog("fonts.done", { installed: fontsInstalled });
      }
    } catch (fontErr) {
      installLog("fonts.failed", {
        error: fontErr instanceof Error ? fontErr.message : String(fontErr),
      });
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
    const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const targetPath = norm(meta.path || "");
    const targetMarketId =
      meta.marketId != null ? String(meta.marketId) : null;

    prefs.packages = packages.filter((p) => {
      if (targetPath && p.path && norm(p.path) === targetPath) return false;
      if (
        targetMarketId &&
        p.marketId != null &&
        String(p.marketId) === targetMarketId
      ) {
        return false;
      }
      // Same name + host (legacy installs without marketId).
      const metaHost = normalizePackHost(meta.appID || meta.load);
      const entryHost = normalizePackHost(p.appID || p.load);
      if (
        meta.name &&
        p.name === meta.name &&
        metaHost &&
        entryHost &&
        metaHost === entryHost
      ) {
        return false;
      }
      return true;
    });
    savePreferencesFile(prefs);

    const baseRoot = path.normalize(resolvePackagesInstallRoot(null));
    const packDir = path.normalize(path.dirname(meta.path));
    if (
      cepFsAvailable() &&
      meta.path &&
      (packDir === baseRoot || packDir.startsWith(baseRoot + path.sep)) &&
      fs.existsSync(packDir)
    ) {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
    return true;
  } catch {
    return false;
  }
}
