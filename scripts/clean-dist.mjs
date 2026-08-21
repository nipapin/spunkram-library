#!/usr/bin/env node
/**
 * Wipe dist/ without failing when Premiere / After Effects still has
 * Motionflow.dll (or other natives) mapped. Windows cannot unlink a loaded
 * DLL, but it can usually rename it — which frees the original path for the
 * next copy. Leftover `*.update-old` files go away after the host restarts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OLD_SUFFIX = ".update-old";

function isBusy(err) {
  const code =
    err && typeof err === "object" && "code" in err ? String(err.code) : "";
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

function rel(file) {
  return path.relative(ROOT, file);
}

function allocateOldPath(target) {
  const base = `${target}${OLD_SUFFIX}`;
  if (!fs.existsSync(base)) return base;
  for (let i = 1; i < 100; i++) {
    const candidate = `${base}.${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  return `${base}.${Date.now()}`;
}

function removeFile(file) {
  try {
    fs.unlinkSync(file);
    return;
  } catch (err) {
    if (!isBusy(err)) throw err;
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

if (fs.existsSync(DIST)) cleanDir(DIST);
