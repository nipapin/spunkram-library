import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hashedAssetRedirectStub,
  rewriteHtmlAssetDepth,
  writeLegacyCepEntries,
} from "../src/js/utils/legacy-cep-entries.ts";
import { bootPanelHtmlName } from "../src/js/utils/cross-host-update.ts";

test("nested 0.9.17 HTML gains an extra ../ for assets", () => {
  const html = `<link href="../assets/main-x.css"><script src="../assets/main-x.cjs"></script>`;
  const nested = rewriteHtmlAssetDepth(html, 1, 2);
  assert.equal(
    nested,
    `<link href="../../assets/main-x.css"><script src="../../assets/main-x.cjs"></script>`,
  );
});

test("redirect stub jumps to the uncached boot html", () => {
  const stub = hashedAssetRedirectStub("../spunkram/index-0.10.4.html");
  assert.match(stub, /spunkram\/index-0\.10\.4\.html/);
  assert.match(stub, /_cep_upd/);
  assert.match(stub, /slice\(-file\.length\)/);
});

test("Spunkram dist gets main/ + ui/spunkram/ + 0.9.16 hash stub", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-cep-"));
  try {
    fs.mkdirSync(path.join(root, "spunkram"), { recursive: true });
    fs.mkdirSync(path.join(root, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "spunkram", "index.html"),
      `<link href="../assets/main-NEW.css"><script src="../assets/main-NEW.cjs"></script>`,
    );
    fs.writeFileSync(path.join(root, "assets", "main-NEW.cjs"), "bundle()");
    fs.writeFileSync(path.join(root, "assets", "main-NEW.css"), "body{}");

    const written = writeLegacyCepEntries(root, "spunkram", "0.10.4");
    const bootName = bootPanelHtmlName("0.10.4");
    assert.equal(bootName, "index-0.10.4.html");
    assert.ok(written.some((p) => p.replace(/\\/g, "/").endsWith("main/index.html")));

    const mainHtml = fs.readFileSync(path.join(root, "main", "index.html"), "utf8");
    assert.match(mainHtml, /\.\.\/assets\/main-NEW\.cjs/);

    const nestedHtml = fs.readFileSync(
      path.join(root, "ui", "spunkram", "index.html"),
      "utf8",
    );
    assert.match(nestedHtml, /\.\.\/\.\.\/assets\/main-NEW\.cjs/);

    const stub16 = fs.readFileSync(
      path.join(root, "assets", "main-B6WaLxLX.cjs"),
      "utf8",
    );
    assert.match(stub16, /location\.replace/);
    assert.match(stub16, /spunkram\/index-0\.10\.4\.html/);

    assert.equal(
      fs.readFileSync(path.join(root, "spunkram", bootName), "utf8"),
      `<link href="../assets/main-NEW.css"><script src="../assets/main-NEW.cjs"></script>`,
    );

    const stub17 = fs.readFileSync(
      path.join(root, "ui", "assets", "main-PMs0Ubu9.cjs"),
      "utf8",
    );
    assert.match(stub17, /\.\.\/\.\.\/spunkram\/index-0\.10\.4\.html/);

    // Do not clobber the live hashed bundle with a stub
    assert.equal(
      fs.readFileSync(path.join(root, "assets", "main-NEW.cjs"), "utf8"),
      "bundle()",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
