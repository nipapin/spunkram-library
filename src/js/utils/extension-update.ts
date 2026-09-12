import { fs, os, path } from "../lib/cep/node";
import { csi } from "../lib/utils/bolt";
import { extractZipToFolder } from "../lib/utils/pack-zip";
import { downloadToFile, type DownloadProgress } from "./download-file";
import {
  markExtensionUpdateApplied,
  reloadPanelHard,
} from "./extension-version";
import { BRAND } from "@brands";
import { isUpdateBackupName, NATIVE_BACKUP_DIR } from "./update-backup-path";
import {
  cleanupUpdateBackups,
  copyFileOverwrite,
  pendingNativesOnly,
  promotePendingUpdates,
  type ReplaceIo,
} from "./replace-live-file";
import { buildSwapHtml, pathToFileUrl, SWAP_PAGE_NAME } from "./update-swap-page";

export type ExtensionUpdateProgress = {
  phase: "download" | "extract" | "apply" | "reload";
  bytesReceived: number;
  totalBytes: number | null;
};

export type ApplyExtensionUpdateResult = {
  /** Locked natives left as `*.pending-update` — host restart needed. */
  pendingNatives: string[];
};

const PENDING_MARKER = "pending-native-update.json";

type PendingMarker = {
  files: string[];
  updatedAt: string;
};

const io: ReplaceIo = { fs, path };

function rimrafSafe(target: string): void {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    try {
      const st = fs.statSync(target);
      if (st.isDirectory()) {
        for (const name of fs.readdirSync(target)) {
          rimrafSafe(path.join(target, name));
        }
        fs.rmdirSync(target);
      } else {
        fs.unlinkSync(target);
      }
    } catch {
      /* ignore */
    }
  }
}

function unlinkBestEffort(target: string): void {
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    /* ignore */
  }
}

function readPendingMarker(extRoot: string): PendingMarker | null {
  const markerPath = path.join(extRoot, PENDING_MARKER);
  if (!fs.existsSync(markerPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(markerPath, "utf8")) as PendingMarker;
    if (!raw || !Array.isArray(raw.files)) return null;
    return raw;
  } catch {
    return null;
  }
}

function writePendingMarker(extRoot: string, files: string[]): void {
  const markerPath = path.join(extRoot, PENDING_MARKER);
  if (files.length === 0) {
    unlinkBestEffort(markerPath);
    return;
  }
  const payload: PendingMarker = {
    files: [...new Set(files)],
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(markerPath, JSON.stringify(payload, null, 2), "utf8");
}

function copyDirOverwrite(
  src: string,
  dest: string,
  extRoot: string,
  pending: string[],
): void {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === NATIVE_BACKUP_DIR || isUpdateBackupName(name)) continue;
    if (name === SWAP_PAGE_NAME || name === PENDING_MARKER) continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      copyDirOverwrite(from, to, extRoot, pending);
    } else {
      const deferred = copyFileOverwrite(io, from, to, extRoot);
      if (deferred) pending.push(deferred);
    }
  }
}

function extractArchive(archivePath: string, destDir: string): void {
  rimrafSafe(destDir);
  fs.mkdirSync(destDir, { recursive: true });

  const zipPath = archivePath.toLowerCase().endsWith(".zip")
    ? archivePath
    : `${archivePath}.zip`;
  if (zipPath !== archivePath) {
    fs.copyFileSync(archivePath, zipPath);
  }
  try {
    extractZipToFolder(zipPath, destDir);
  } finally {
    if (zipPath !== archivePath) {
      unlinkBestEffort(zipPath);
    }
  }
}

function panelDestRel(): string {
  return (BRAND.panelMainPath || "./index.html").replace(/^[./\\]+/, "").replace(/\\/g, "/");
}

function reloadAfterApply(extRoot: string, pending: string[]): void {
  const destRel = panelDestRel();
  const needsSwap = pending.some((rel) => !pendingNativesOnly([rel]).length);
  if (needsSwap) {
    try {
      fs.writeFileSync(
        path.join(extRoot, SWAP_PAGE_NAME),
        buildSwapHtml(extRoot, destRel),
        "utf8",
      );
      const swapUrl = pathToFileUrl(path.join(extRoot, SWAP_PAGE_NAME));
      setTimeout(() => {
        if (typeof window !== "undefined" && window.location) {
          window.location.replace(`${swapUrl}?_cep_upd=${Date.now()}`);
        }
      }, 250);
      return;
    } catch (err) {
      console.warn("[extension-update] swap page failed, falling back to reload", err);
    }
  }
  setTimeout(() => {
    reloadPanelHard();
  }, 250);
}

/**
 * Try to promote `*.pending-update` files written while CEF / Premiere held a lock.
 * Safe to call on every panel boot. Panel HTML/JS usually promote after the swap
 * page unloads the old document; natives may remain until host restart.
 */
export function finalizePendingNativeUpdate(): {
  remaining: string[];
  applied: string[];
} {
  const extRoot = csi.getSystemPath("extension");
  if (!extRoot || !fs.existsSync(extRoot)) {
    return { remaining: [], applied: [] };
  }

  const marker = readPendingMarker(extRoot);
  const { remaining, applied } = promotePendingUpdates(
    io,
    extRoot,
    marker?.files ?? [],
  );
  writePendingMarker(extRoot, remaining);
  return { remaining, applied };
}

export function hasPendingNativeUpdate(): boolean {
  const extRoot = csi.getSystemPath("extension");
  if (!extRoot) return false;
  const marker = readPendingMarker(extRoot);
  return Boolean(marker && pendingNativesOnly(marker.files).length > 0);
}

/**
 * Download a .zxp, unpack over the live extension root (userdata install),
 * then reload the panel. Locked files are renamed away or written as
 * `*.pending-update`; a swap page unloads CEF so HTML/JS can be promoted
 * without restarting Premiere / After Effects. Mapped natives may still
 * need a host restart.
 */
export async function applyExtensionUpdate(
  zxpUrl: string,
  onProgress?: (p: ExtensionUpdateProgress) => void,
  appliedVersion?: string,
): Promise<ApplyExtensionUpdateResult> {
  const extRoot = csi.getSystemPath("extension");
  if (!extRoot || !fs.existsSync(extRoot)) {
    throw new Error("Extension path unavailable");
  }

  const workDir = path.join(os.tmpdir(), `${BRAND.id}-update-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const zxpPath = path.join(workDir, "update.zxp");
  const extractDir = path.join(workDir, "extracted");

  try {
    onProgress?.({
      phase: "download",
      bytesReceived: 0,
      totalBytes: null,
    });
    await downloadToFile(zxpUrl, zxpPath, {
      timeoutMs: 15 * 60 * 1000,
      onProgress: (p: DownloadProgress) =>
        onProgress?.({
          phase: "download",
          bytesReceived: p.bytesReceived,
          totalBytes: p.totalBytes,
        }),
    });

    onProgress?.({ phase: "extract", bytesReceived: 0, totalBytes: null });
    extractArchive(zxpPath, extractDir);

    let payloadRoot = extractDir;
    const top = fs.readdirSync(extractDir).filter((n) => n !== "__MACOSX");
    if (top.length === 1) {
      const only = path.join(extractDir, top[0]);
      if (fs.statSync(only).isDirectory()) {
        const hasManifest =
          fs.existsSync(path.join(only, "CSXS")) ||
          fs.existsSync(path.join(only, "csxs")) ||
          fs.existsSync(path.join(only, "manifest.xml"));
        if (hasManifest) payloadRoot = only;
      }
    }

    onProgress?.({ phase: "apply", bytesReceived: 0, totalBytes: null });
    cleanupUpdateBackups(io, extRoot);

    const prior = readPendingMarker(extRoot);
    const pending: string[] = [...(prior?.files ?? [])];
    copyDirOverwrite(payloadRoot, extRoot, extRoot, pending);
    writePendingMarker(extRoot, pending);

    if (appliedVersion) {
      markExtensionUpdateApplied(appliedVersion);
    }

    const natives = pendingNativesOnly(pending);
    onProgress?.({ phase: "reload", bytesReceived: 0, totalBytes: null });
    reloadAfterApply(extRoot, pending);

    return { pendingNatives: natives };
  } finally {
    try {
      rimrafSafe(workDir);
    } catch {
      /* temp cleanup best-effort */
    }
  }
}
