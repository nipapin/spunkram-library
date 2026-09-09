/**
 * Native-file backups during in-panel / dist copy (Motionflow.dll is often
 * mapped by Premiere). Never append `.old` / `.update-old` onto a path that
 * already has that suffix — leftovers stay locked, so stacking hits MAX_PATH.
 */

export const UPDATE_OLD_SUFFIX = ".update-old";
export const PENDING_SUFFIX = ".pending-update";
/** Short sidecar folder next to the live native (same volume rename). */
export const NATIVE_BACKUP_DIR = "_mf_old";

const STACKED_OLD_RE = /\.old(?:\.old)+$/i;
const TRAILING_OLD_RE = /\.old$/i;
const UPDATE_OLD_TRAIL_RE = /\.update-old(?:\.\d+)?$/i;
const PENDING_TRAIL_RE = /\.pending-update$/i;

export function isUpdateBackupName(name: string): boolean {
  if (!name) return false;
  if (name === NATIVE_BACKUP_DIR) return true;
  if (name.includes(UPDATE_OLD_SUFFIX)) return true;
  if (name.endsWith(PENDING_SUFFIX)) return true;
  if (STACKED_OLD_RE.test(name)) return true;
  if (TRAILING_OLD_RE.test(name)) return true;
  return false;
}

/** Strip leftover updater suffixes so the live basename stays short. */
export function liveNativeBaseName(name: string): string {
  let out = name;
  out = out.replace(PENDING_TRAIL_RE, "");
  out = out.replace(UPDATE_OLD_TRAIL_RE, "");
  out = out.replace(STACKED_OLD_RE, "");
  out = out.replace(TRAILING_OLD_RE, "");
  return out || name;
}

export function allocateNativeBackupPath(
  target: string,
  opts: {
    exists: (p: string) => boolean;
    join: (...parts: string[]) => string;
    dirname: (p: string) => string;
    basename: (p: string) => string;
  },
): string {
  const dir = opts.dirname(target);
  const base = liveNativeBaseName(opts.basename(target));
  const trash = opts.join(dir, NATIVE_BACKUP_DIR);
  const stamp = Date.now();
  let candidate = opts.join(trash, `${base}.${stamp}`);
  for (let i = 0; i < 50 && opts.exists(candidate); i++) {
    candidate = opts.join(trash, `${base}.${stamp}.${i}`);
  }
  return candidate;
}
