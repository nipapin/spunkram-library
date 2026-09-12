import {
  allocateNativeBackupPath,
  isUpdateBackupName,
  NATIVE_BACKUP_DIR,
  PENDING_SUFFIX,
} from "./update-backup-path";

export type ReplaceFs = {
  existsSync: (p: string) => boolean;
  mkdirSync: (p: string, opts?: { recursive?: boolean }) => void;
  copyFileSync: (from: string, to: string) => void;
  renameSync: (from: string, to: string) => void;
  unlinkSync: (p: string) => void;
  readdirSync: (p: string) => string[];
  statSync: (p: string) => { isDirectory: () => boolean };
  rmdirSync?: (p: string) => void;
};

export type ReplacePath = {
  join: (...parts: string[]) => string;
  dirname: (p: string) => string;
  basename: (p: string) => string;
  relative: (from: string, to: string) => string;
};

export type ReplaceIo = {
  fs: ReplaceFs;
  path: ReplacePath;
};

/** Windows UV: EPERM -4048, EBUSY -4082, EACCES -4092 (CEP Node often omits `.code`). */
const BUSY_ERRNO = new Set([-4048, -4082, -4092, 4058]);

export function isBusyError(err: unknown): boolean {
  if (err == null) return false;
  const o = err as { code?: unknown; errno?: unknown; message?: unknown };
  const code = String(o.code ?? "");
  if (code === "EBUSY" || code === "EPERM" || code === "EACCES") return true;
  const errno = typeof o.errno === "number" ? o.errno : Number(o.errno);
  if (Number.isFinite(errno) && BUSY_ERRNO.has(errno)) return true;
  const msg = typeof o.message === "string" ? o.message : String(err);
  return /EPERM|EBUSY|EACCES|operation not permitted|not permitted|resource busy|being used by another process|locked/i.test(
    msg,
  );
}

export function isNativeBinary(filePath: string): boolean {
  const lower = filePath.replace(/\\/g, "/").toLowerCase();
  if (lower.includes("/bin/")) return true;
  return (
    lower.endsWith(".dll") ||
    lower.endsWith(".bundle") ||
    lower.endsWith(".acsrf") ||
    lower.endsWith(".prm") ||
    lower.endsWith(".dylib") ||
    lower.endsWith(".so") ||
    lower.endsWith(".node")
  );
}

function unlinkBestEffort(io: ReplaceIo, target: string): void {
  try {
    if (io.fs.existsSync(target)) io.fs.unlinkSync(target);
  } catch {
    /* still locked */
  }
}

function allocateBackup(io: ReplaceIo, target: string): string {
  const backup = allocateNativeBackupPath(target, {
    exists: (p) => io.fs.existsSync(p),
    join: io.path.join,
    dirname: io.path.dirname,
    basename: io.path.basename,
  });
  try {
    io.fs.mkdirSync(io.path.dirname(backup), { recursive: true });
  } catch {
    /* rename may still work */
  }
  return backup;
}

function retryBusy<T>(fn: () => T, attempts = 3): T {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (err) {
      last = err;
      if (!isBusyError(err) || i === attempts - 1) throw err;
    }
  }
  throw last;
}

function relToExt(io: ReplaceIo, extRoot: string, abs: string): string {
  const rel = io.path.relative(extRoot, abs).replace(/\\/g, "/");
  return rel || io.path.basename(abs);
}

/**
 * Copy `from` over `to`. If Windows has `to` mapped (CEF HTML/JS or a DLL):
 * rename-away then copy. If rename also fails, write `{to}.pending-update`
 * and return the relative path — never throw on sharing violations.
 */
export function copyFileOverwrite(
  io: ReplaceIo,
  from: string,
  to: string,
  extRoot: string,
): string | null {
  if (isUpdateBackupName(io.path.basename(to))) return null;

  try {
    retryBusy(() => io.fs.copyFileSync(from, to));
    return null;
  } catch (err) {
    if (!isBusyError(err) || !io.fs.existsSync(to)) throw err;
  }

  const backup = allocateBackup(io, to);
  try {
    retryBusy(() => io.fs.renameSync(to, backup));
    try {
      retryBusy(() => io.fs.copyFileSync(from, to));
      unlinkBestEffort(io, backup);
      return null;
    } catch (copyErr) {
      try {
        if (!io.fs.existsSync(to) && io.fs.existsSync(backup)) {
          io.fs.renameSync(backup, to);
        }
      } catch {
        /* restore failed — still write pending */
      }
      if (!isBusyError(copyErr)) throw copyErr;
    }
  } catch (renameErr) {
    if (!isBusyError(renameErr)) throw renameErr;
  }

  const pendingPath = `${to}${PENDING_SUFFIX}`;
  unlinkBestEffort(io, pendingPath);
  io.fs.copyFileSync(from, pendingPath);
  return relToExt(io, extRoot, to);
}

export function cleanupUpdateBackups(io: ReplaceIo, root: string): void {
  if (!io.fs.existsSync(root)) return;
  let entries: string[];
  try {
    entries = io.fs.readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = io.path.join(root, name);
    try {
      const st = io.fs.statSync(full);
      if (st.isDirectory()) {
        if (name === NATIVE_BACKUP_DIR) {
          cleanupUpdateBackups(io, full);
          try {
            if (io.fs.readdirSync(full).length === 0) io.fs.rmdirSync?.(full);
          } catch {
            /* still locked */
          }
        } else {
          cleanupUpdateBackups(io, full);
        }
      } else if (name.endsWith(PENDING_SUFFIX)) {
        continue;
      } else if (isUpdateBackupName(name)) {
        unlinkBestEffort(io, full);
      }
    } catch {
      /* ignore */
    }
  }
}

function collectPendingRels(io: ReplaceIo, extRoot: string, dir: string, out: Set<string>): void {
  if (!io.fs.existsSync(dir)) return;
  let entries: string[];
  try {
    entries = io.fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === NATIVE_BACKUP_DIR) continue;
    const full = io.path.join(dir, name);
    try {
      const st = io.fs.statSync(full);
      if (st.isDirectory()) {
        collectPendingRels(io, extRoot, full, out);
      } else if (name.endsWith(PENDING_SUFFIX)) {
        const live = full.slice(0, -PENDING_SUFFIX.length);
        out.add(relToExt(io, extRoot, live));
      }
    } catch {
      /* ignore */
    }
  }
}

export function promotePendingUpdates(
  io: ReplaceIo,
  extRoot: string,
  markerFiles: string[] = [],
): { remaining: string[]; applied: string[] } {
  const candidates = new Set<string>(markerFiles);
  collectPendingRels(io, extRoot, extRoot, candidates);

  const remaining: string[] = [];
  const applied: string[] = [];

  for (const rel of candidates) {
    const live = io.path.join(extRoot, rel);
    const pendingPath = `${live}${PENDING_SUFFIX}`;
    if (!io.fs.existsSync(pendingPath)) {
      applied.push(rel);
      continue;
    }

    try {
      if (io.fs.existsSync(live)) {
        const backup = allocateBackup(io, live);
        try {
          retryBusy(() => io.fs.renameSync(live, backup));
        } catch {
          remaining.push(rel);
          continue;
        }
        unlinkBestEffort(io, backup);
      }
      io.fs.renameSync(pendingPath, live);
      applied.push(rel);
    } catch {
      try {
        io.fs.copyFileSync(pendingPath, live);
        unlinkBestEffort(io, pendingPath);
        applied.push(rel);
      } catch {
        remaining.push(rel);
      }
    }
  }

  cleanupUpdateBackups(io, extRoot);
  return { remaining, applied };
}

export function pendingNativesOnly(paths: string[]): string[] {
  return [...new Set(paths)].filter((rel) => isNativeBinary(rel));
}
