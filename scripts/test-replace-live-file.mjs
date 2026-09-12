import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  copyFileOverwrite,
  isBusyError,
  isNativeBinary,
  pendingNativesOnly,
  promotePendingUpdates,
} from "../src/js/utils/replace-live-file.ts";
import { PENDING_SUFFIX } from "../src/js/utils/update-backup-path.ts";
import { buildSwapHtml, pathToFileUrl } from "../src/js/utils/update-swap-page.ts";

const io = { fs, path };

function busy(code = "EPERM") {
  return Object.assign(new Error(`${code}: in use`), { code });
}

test("isBusyError catches CEP Node errors without .code", () => {
  assert.equal(isBusyError({ errno: -4048, message: "operation not permitted" }), true);
  assert.equal(isBusyError(new Error("EPERM: operation not permitted, copyfile")), true);
  assert.equal(isBusyError({ code: "EPERM" }), true);
  assert.equal(isBusyError(new Error("no such file")), false);
});

test("index.html is not a native; Motionflow.dll is", () => {
  assert.equal(isNativeBinary("gal/index.html"), false);
  assert.equal(isNativeBinary("assets/main-x.cjs"), false);
  assert.equal(isNativeBinary("bin/win/Motionflow.dll"), true);
  assert.equal(isNativeBinary("js/lib/bin/foo"), true);
});

test("unlocked copy replaces in place", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mf-upd-"));
  try {
    const from = path.join(root, "new.html");
    const to = path.join(root, "index.html");
    fs.writeFileSync(from, "NEW");
    fs.writeFileSync(to, "OLD");
    const pending = copyFileOverwrite(io, from, to, root);
    assert.equal(pending, null);
    assert.equal(fs.readFileSync(to, "utf8"), "NEW");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("busy copy + successful rename replaces without pending", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mf-upd-"));
  try {
    const from = path.join(root, "new.html");
    const to = path.join(root, "index.html");
    fs.writeFileSync(from, "NEW");
    fs.writeFileSync(to, "OLD");

    const wrappedFs = {
      ...fs,
      copyFileSync(a, b) {
        if (b === to && fs.existsSync(to)) throw busy();
        return fs.copyFileSync(a, b);
      },
    };
    const pending = copyFileOverwrite({ fs: wrappedFs, path }, from, to, root);
    assert.equal(pending, null);
    assert.equal(fs.readFileSync(to, "utf8"), "NEW");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("busy copy and rename writes pending instead of throwing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mf-upd-"));
  try {
    const from = path.join(root, "new.html");
    const to = path.join(root, "gal", "index.html");
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(from, "NEW");
    fs.writeFileSync(to, "OLD");

    const wrappedFs = {
      ...fs,
      copyFileSync(a, b) {
        if (b === to) throw busy();
        return fs.copyFileSync(a, b);
      },
      renameSync(a, b) {
        if (a === to) throw busy();
        return fs.renameSync(a, b);
      },
    };
    const pending = copyFileOverwrite({ fs: wrappedFs, path }, from, to, root);
    assert.equal(pending, "gal/index.html");
    assert.equal(fs.readFileSync(to, "utf8"), "OLD");
    assert.equal(fs.readFileSync(to + PENDING_SUFFIX, "utf8"), "NEW");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("promotePendingUpdates swaps sidecar after lock is gone", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mf-upd-"));
  try {
    const live = path.join(root, "gal", "index.html");
    fs.mkdirSync(path.dirname(live), { recursive: true });
    fs.writeFileSync(live, "OLD");
    fs.writeFileSync(live + PENDING_SUFFIX, "NEW");
    const { remaining, applied } = promotePendingUpdates(io, root, ["gal/index.html"]);
    assert.deepEqual(remaining, []);
    assert.ok(applied.includes("gal/index.html"));
    assert.equal(fs.readFileSync(live, "utf8"), "NEW");
    assert.equal(fs.existsSync(live + PENDING_SUFFIX), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pendingNativesOnly drops panel files", () => {
  assert.deepEqual(
    pendingNativesOnly(["gal/index.html", "bin/win/Motionflow.dll", "assets/main.cjs"]),
    ["bin/win/Motionflow.dll"],
  );
});

test("swap page file URL and inline promote", () => {
  const url = pathToFileUrl("C:\\Users\\x\\com.premieregal.cep\\gal\\index.html");
  assert.equal(url, "file:///C:/Users/x/com.premieregal.cep/gal/index.html");
  const html = buildSwapHtml("C:\\ext", "gal/index.html");
  assert.match(html, /cep_node/);
  assert.match(html, /require\("fs"\)|req\("fs"\)/);
  assert.match(html, /file:\/\/\/C:\/ext\/gal\/index\.html/);
  assert.match(html, /\.pending-update/);
});
