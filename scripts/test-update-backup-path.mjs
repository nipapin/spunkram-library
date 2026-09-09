import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import {
  allocateNativeBackupPath,
  isUpdateBackupName,
  liveNativeBaseName,
  NATIVE_BACKUP_DIR,
} from "../src/js/utils/update-backup-path.ts";

test("leftover updater names are backups, live DLL is not", () => {
  assert.equal(isUpdateBackupName("Motionflow.dll"), false);
  assert.equal(isUpdateBackupName("Motionflow.dll.update-old"), true);
  assert.equal(isUpdateBackupName("Motionflow.dll.update-old.3"), true);
  assert.equal(isUpdateBackupName("Motionflow.dll.old"), true);
  assert.equal(isUpdateBackupName("Motionflow.dll.old.old.old"), true);
  assert.equal(isUpdateBackupName("Motionflow.dll.pending-update"), true);
  assert.equal(isUpdateBackupName(NATIVE_BACKUP_DIR), true);
});

test("live basename strips stacked suffixes", () => {
  assert.equal(liveNativeBaseName("Motionflow.dll"), "Motionflow.dll");
  assert.equal(
    liveNativeBaseName("Motionflow.dll.update-old.2"),
    "Motionflow.dll",
  );
  assert.equal(liveNativeBaseName("Motionflow.dll.old.old.old"), "Motionflow.dll");
});

test("backup path stays in _mf_old and does not stack suffixes", () => {
  const existing = new Set();
  const opts = {
    exists: (p) => existing.has(p.replace(/\\/g, "/")),
    join: path.posix.join,
    dirname: path.posix.dirname,
    basename: path.posix.basename,
  };
  const first = allocateNativeBackupPath("bin/win/Motionflow.dll", opts).replace(
    /\\/g,
    "/",
  );
  assert.match(first, /bin\/win\/_mf_old\/Motionflow\.dll\.\d+$/);
  assert.equal(first.includes(".update-old"), false);
  assert.equal(first.includes(".old.old"), false);

  existing.add(first);
  const stackedTarget = allocateNativeBackupPath(
    "bin/win/Motionflow.dll.old.old.old",
    opts,
  ).replace(/\\/g, "/");
  assert.match(stackedTarget, /bin\/win\/_mf_old\/Motionflow\.dll\.\d+/);
  assert.equal(stackedTarget.includes(".old.old"), false);
});
