#!/usr/bin/env node
/**
 * Wipe this brand's CEP output without touching the other brand.
 *
 * `dist/cep` (legacy shared folder) is also removed so old Adobe junctions
 * are not left pointing at a mixed build.
 *
 * Premiere / After Effects may keep Motionflow.dll mapped. Windows cannot
 * unlink a loaded DLL, but it can usually rename it — which frees the original
 * path for the next copy. Leftover `*.update-old` files go away after the host
 * restarts.
 *
 * Env:
 *   APP_BRAND=gal|spunkram  (default: spunkram)
 *   CLEAN_DIST_ALL=1        wipe entire dist/ (both brands + zxp)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OLD_SUFFIX = ".update-old";
const BACKUP_DIR = "_mf_old";

const BRAND = process.env.APP_BRAND === "gal" ? "gal" : "spunkram";
const EXT_ID = {
  gal: "com.premieregal.cep",
  spunkram: "com.spunkramlibrary.cep",
}[BRAND];
const WIPE_ALL =
  process.env.CLEAN_DIST_ALL === "1" || process.argv.includes("--all");

function isBusy(err) {
  const code =
    err && typeof err === "object" && "code" in err ? String(err.code) : "";
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

function rel(file) {
  return path.relative(ROOT, file);
}

function isBackupName(name) {
  if (!name) return false;
  if (name === BACKUP_DIR) return true;
  if (name.includes(OLD_SUFFIX)) return true;
  if (name.endsWith(".pending-update")) return true;
  return /\.old(?:\.old)*$/i.test(name);
}

function allocateOldPath(target) {
  const dir = path.dirname(target);
  const trash = path.join(dir, BACKUP_DIR);
  fs.mkdirSync(trash, { recursive: true });
  const base = path.basename(target).replace(/(\.update-old)(\.\d+)?$/i, "").replace(/(\.old)+$/i, "");
  const stamp = Date.now();
  let candidate = path.join(trash, `${base}.${stamp}`);
  for (let i = 0; i < 50 && fs.existsSync(candidate); i++) {
    candidate = path.join(trash, `${base}.${stamp}.${i}`);
  }
  return candidate;
}

function removeFile(file) {
  try {
    fs.unlinkSync(file);
    return;
  } catch (err) {
    if (!isBusy(err)) throw err;
  }

  if (
    isBackupName(path.basename(file)) ||
    path.basename(path.dirname(file)) === BACKUP_DIR
  ) {
    console.warn(
      `[clean-dist] skip leftover backup (close Premiere / After Effects to remove): ${rel(file)}`,
    );
    return;
  }

  const backup = allocateOldPath(file);
  try {
    fs.renameSync(file, backup);
    console.warn(`[clean-dist] renamed locked file: ${rel(file)} → ${path.basename(backup)}`);
  } catch (err) {
    if (!isBusy(err)) throw err;
    console.warn(
      `[clean-dist] skip locked file (close Premiere / After Effects to replace): ${rel(file)}`,
    );
  }
}

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.lstatSync(full);
    } catch (err) {
      if (isBusy(err)) {
        console.warn(`[clean-dist] skip locked path: ${rel(full)}`);
        continue;
      }
      throw err;
    }
    if (st.isDirectory()) {
      cleanDir(full);
      try {
        fs.rmdirSync(full);
      } catch (err) {
        if (!isBusy(err) && err.code !== "ENOTEMPTY") throw err;
      }
    } else {
      removeFile(full);
    }
  }
}

function removePath(target) {
  if (!fs.existsSync(target)) return;
  const st = fs.lstatSync(target);
  if (st.isDirectory()) {
    cleanDir(target);
    try {
      fs.rmdirSync(target);
    } catch (err) {
      if (!isBusy(err) && err.code !== "ENOTEMPTY") throw err;
    }
  } else {
    removeFile(target);
  }
}

if (WIPE_ALL) {
  console.log("[clean-dist] wiping entire dist/");
  if (fs.existsSync(DIST)) cleanDir(DIST);
} else {
  const brandDir = path.join(DIST, `cep-${BRAND}`);
  const legacyDir = path.join(DIST, "cep");
  const zxpExact = path.join(DIST, "zxp", `${EXT_ID}.zxp`);
  const zxpDir = path.join(DIST, "zxp", EXT_ID);
  console.log(`[clean-dist] brand=${BRAND} → ${rel(brandDir)}`);
  removePath(brandDir);
  removePath(legacyDir);
  removePath(zxpExact);
  removePath(zxpDir);
}
