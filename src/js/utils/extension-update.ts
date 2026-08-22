import { fs, os, path } from "../lib/cep/node";
import { csi } from "../lib/utils/bolt";
import { extractZipToFolder } from "../lib/utils/pack-zip";
import { downloadToFile, type DownloadProgress } from "./download-file";
import { BRAND } from "@brands";

export type ExtensionUpdateProgress = {
  phase: "download" | "extract" | "apply" | "reload";
  bytesReceived: number;
  totalBytes: number | null;
};

export type ApplyExtensionUpdateResult = {
  /** Locked natives left as `*.pending-update` — host restart needed. */
  pendingNatives: string[];
};

const UPDATE_OLD_SUFFIX = ".update-old";
const PENDING_SUFFIX = ".pending-update";
const PENDING_MARKER = "pending-native-update.json";

type PendingMarker = {
  files: string[];
  updatedAt: string;
};

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

function isBusyError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

function unlinkBestEffort(target: string): void {
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    /* ignore — often still locked until host restarts */
  }
}

function isNativeBinary(filePath: string): boolean {
  const lower = filePath.replace(/\\/g, "/").toLowerCase();
  if (lower.includes("/bin/")) return true;
  return (
    lower.endsWith(".dll") ||
    lower.endsWith(".bundle") ||
    lower.endsWith(".acsrf") ||
    lower.endsWith(".prm") ||
    lower.endsWith(".dylib") ||
    lower.endsWith(".so")
  );
}

/** Pick a free backup path: `file.update-old`, then `file.update-old.1`, … */
function allocateUpdateOldPath(target: string): string {
  const base = `${target}${UPDATE_OLD_SUFFIX}`;
  if (!fs.existsSync(base)) return base;
  for (let i = 1; i < 100; i++) {
    const candidate = `${base}.${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  return `${base}.${Date.now()}`;
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

/**
 * Overwrite a file even when Windows has it mapped (e.g. Motionflow.dll).
 * On rename failure for natives: write `{name}.pending-update` and continue.
 * Returns the relative path that was deferred, or null if applied.
 */
function copyFileOverwrite(
  from: string,
  to: string,
  extRoot: string,
): string | null {
  try {
    fs.copyFileSync(from, to);
    return null;
  } catch (err) {
    if (!isBusyError(err) || !fs.existsSync(to)) throw err;
  }

  const backup = allocateUpdateOldPath(to);
  try {
    fs.renameSync(to, backup);
  } catch (renameErr) {
    if (!isNativeBinary(to)) {
      const name = path.basename(to);
      throw new Error(
        `Cannot replace locked file "${name}". Close Premiere Pro / After Effects and try again. (${
          renameErr instanceof Error ? renameErr.message : String(renameErr)
        })`,
      );
    }
    const pendingPath = `${to}${PENDING_SUFFIX}`;
    unlinkBestEffort(pendingPath);
    fs.copyFileSync(from, pendingPath);
    const rel = path.relative(extRoot, to).replace(/\\/g, "/");
    return rel || path.basename(to);
  }

  try {
    fs.copyFileSync(from, to);
  } catch (copyErr) {
    try {
      if (!fs.existsSync(to) && fs.existsSync(backup)) {
        fs.renameSync(backup, to);
      }
    } catch {
      /* ignore restore failure */
    }
    throw copyErr;
  }

  unlinkBestEffort(backup);
  return null;
}

/** Best-effort removal of leftover `*.update-old` / `*.update-old.N`. */
function cleanupUpdateBackups(root: string): void {
  if (!fs.existsSync(root)) return;
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = path.join(root, name);
    try {
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        cleanupUpdateBackups(full);
      } else if (
        name.includes(UPDATE_OLD_SUFFIX) ||
        name.endsWith(PENDING_SUFFIX)
      ) {
        // Do not delete pending-update here — finalize handles those.
        if (name.endsWith(PENDING_SUFFIX)) continue;
        if (name.includes(UPDATE_OLD_SUFFIX)) unlinkBestEffort(full);
      }
    } catch {
      /* ignore */
    }
  }
}

function copyDirOverwrite(
  src: string,
  dest: string,
  extRoot: string,
  pending: string[],
): void {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      copyDirOverwrite(from, to, extRoot, pending);
    } else {
      const deferred = copyFileOverwrite(from, to, extRoot);
      if (deferred) pending.push(deferred);
    }
  }
}

function extractArchive(archivePath: string, destDir: string): void {
  rimrafSafe(destDir);
  fs.mkdirSync(destDir, { recursive: true });

  // ZXP is a zip; use in-process reader (no PowerShell / unzip CLI).
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

/**
 * Try to promote `*.pending-update` files written while Premiere held the DLL.
 * Safe to call on every panel boot.
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
  const candidates = new Set<string>(marker?.files ?? []);

  // Also discover any orphaned *.pending-update under bin/
  const scanPending = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          scanPending(full);
        } else if (name.endsWith(PENDING_SUFFIX)) {
          const live = full.slice(0, -PENDING_SUFFIX.length);
          const rel = path.relative(extRoot, live).replace(/\\/g, "/");
          if (rel) candidates.add(rel);
        }
      } catch {
        /* ignore */
      }
    }
  };
  scanPending(path.join(extRoot, "bin"));

  const remaining: string[] = [];
  const applied: string[] = [];

  for (const rel of candidates) {
    const live = path.join(extRoot, rel);
    const pendingPath = `${live}${PENDING_SUFFIX}`;
    if (!fs.existsSync(pendingPath)) {
      applied.push(rel);
      continue;
    }

    try {
      if (fs.existsSync(live)) {
        const backup = allocateUpdateOldPath(live);
        try {
          fs.renameSync(live, backup);
        } catch {
          remaining.push(rel);
          continue;
        }
        unlinkBestEffort(backup);
      }
      fs.renameSync(pendingPath, live);
      applied.push(rel);
    } catch {
      // Fallback: copy pending over live if rename of pending fails
      try {
        fs.copyFileSync(pendingPath, live);
        unlinkBestEffort(pendingPath);
        applied.push(rel);
      } catch {
        remaining.push(rel);
      }
    }
  }

  writePendingMarker(extRoot, remaining);
  cleanupUpdateBackups(extRoot);
  return { remaining, applied };
}

export function hasPendingNativeUpdate(): boolean {
  const extRoot = csi.getSystemPath("extension");
  if (!extRoot) return false;
  const marker = readPendingMarker(extRoot);
  return Boolean(marker && marker.files.length > 0);
}

/**
 * Download a .zxp, unpack over the live extension root (userdata install),
 * then reload the panel. Locked natives may be deferred to `.pending-update`.
 */
export async function applyExtensionUpdate(
  zxpUrl: string,
  onProgress?: (p: ExtensionUpdateProgress) => void,
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

    // Some ZXPs nest a single root folder — unwrap if so
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
    // Do not ExternalObject.terminate() — breaks Motionflow.dll reload this session.
    cleanupUpdateBackups(extRoot);

    const prior = readPendingMarker(extRoot);
    const pending: string[] = [...(prior?.files ?? [])];
    copyDirOverwrite(payloadRoot, extRoot, extRoot, pending);
    writePendingMarker(extRoot, pending);

    onProgress?.({ phase: "reload", bytesReceived: 0, totalBytes: null });
    setTimeout(() => {
      if (typeof window !== "undefined" && window.location?.reload) {
        window.location.reload();
      }
    }, 250);

    return { pendingNatives: [...new Set(pending)] };
  } finally {
    try {
      rimrafSafe(workDir);
    } catch {
      /* temp cleanup best-effort */
    }
  }
}
