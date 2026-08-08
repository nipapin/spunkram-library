/**
 * One-off install smoke test against a cached Market zip.
 * Mirrors the fixed pack-install / pack-zip / contents parsing path outside CEP.
 *
 * Usage: node scripts/test-pack-install.mjs [zipPath]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const LOCAL_HEADER_SIG = 0x04034b50;
const MAX_EOCD_SCAN = 65557;

const zipPath =
  process.argv[2] ||
  path.join(
    process.env.APPDATA || "",
    "Spunkram",
    "Spunkram Extension",
    "pack-cache",
    "1.zip",
  );

const prefRoot = path.join(
  process.env.APPDATA || "",
  "Spunkram",
  "Spunkram Extension",
);
const prefPath = path.join(prefRoot, "preferences.json");
const installRoot = path.join(prefRoot, "_ABS");

function log(phase, extra) {
  const detail = extra
    ? " " +
      Object.entries(extra)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(" ")
    : "";
  console.log(`[pack.install] ${phase}${detail}`);
}

function readExact(fd, offset, length) {
  const buf = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const n = fs.readSync(fd, buf, filled, length - filled, offset + filled);
    if (n <= 0) throw new Error(`Unexpected EOF at ${offset + filled}`);
    filled += n;
  }
  return buf;
}

function findEOCDInBuffer(buf) {
  const start = Math.max(0, buf.length - MAX_EOCD_SCAN);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("Not a valid ZIP file (no EOCD)");
}

function extractZipToFolder(zipFile, destDir) {
  const fd = fs.openSync(zipFile, "r");
  try {
    const fileSize = fs.fstatSync(fd).size;
    const scanSize = Math.min(fileSize, MAX_EOCD_SCAN);
    const tail = readExact(fd, fileSize - scanSize, scanSize);
    const rel = findEOCDInBuffer(tail);
    const totalEntries = tail.readUInt16LE(rel + 10);
    const cdSize = tail.readUInt32LE(rel + 12);
    const cdOffset = tail.readUInt32LE(rel + 16);
    const cdBuf = readExact(fd, cdOffset, cdSize);
    let off = 0;
    const written = [];
    for (let i = 0; i < totalEntries; i++) {
      if (cdBuf.readUInt32LE(off) !== CENTRAL_DIR_SIG) {
        throw new Error("Malformed ZIP central directory");
      }
      const method = cdBuf.readUInt16LE(off + 10);
      const compressedSize = cdBuf.readUInt32LE(off + 20);
      const nameLength = cdBuf.readUInt16LE(off + 28);
      const extraLength = cdBuf.readUInt16LE(off + 30);
      const commentLength = cdBuf.readUInt16LE(off + 32);
      const localHeaderOffset = cdBuf.readUInt32LE(off + 42);
      const name = cdBuf.subarray(off + 46, off + 46 + nameLength).toString("utf8");
      off += 46 + nameLength + extraLength + commentLength;

      const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
      if (normalized.split("/").includes("..")) continue;
      const targetPath = path.join(destDir, normalized);
      if (normalized.endsWith("/")) {
        fs.mkdirSync(targetPath, { recursive: true });
        continue;
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const header = readExact(fd, localHeaderOffset, 30);
      if (header.readUInt32LE(0) !== LOCAL_HEADER_SIG) {
        throw new Error(`Malformed local header for ${name}`);
      }
      const nlen = header.readUInt16LE(26);
      const elen = header.readUInt16LE(28);
      const dataStart = localHeaderOffset + 30 + nlen + elen;
      const raw = readExact(fd, dataStart, compressedSize);
      const data =
        method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
      if (!data) throw new Error(`Unsupported method ${method} for ${name}`);
      fs.writeFileSync(targetPath, data);
      written.push(targetPath);
    }
    return written;
  } finally {
    fs.closeSync(fd);
  }
}

function findPackFileRecursive(dir, depth = 0) {
  if (depth > 4 || !fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && /\.(spunkram|atom)$/i.test(entry.name)) {
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

function parseJsonPackContent(raw) {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  const parsed = JSON.parse(cleaned);
  const structure = parsed.structure ?? parsed.contents ?? parsed.content;
  if (!parsed?.settings || !structure || typeof structure !== "object") {
    throw new Error("Missing settings or content");
  }
  return { settings: parsed.settings, structure };
}

function copyFolderRecursive(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyFolderRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function sanitizeFolderName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "Pack";
}

async function main() {
  const startedAt = Date.now();
  if (!fs.existsSync(zipPath)) {
    console.error("Zip not found:", zipPath);
    process.exit(1);
  }
  log("start", { zipPath, size: fs.statSync(zipPath).size });

  const stagingDir = path.join(
    os.tmpdir(),
    `spunkram-install-test-${Date.now()}`,
  );
  try {
    const extractStarted = Date.now();
    log("extract.begin", { stagingDir });
    const written = extractZipToFolder(zipPath, stagingDir);
    log("extract.done", { files: written.length, ms: Date.now() - extractStarted });

    const packFilePath = findPackFileRecursive(stagingDir);
    if (!packFilePath) throw new Error("No .spunkram/.atom pack file found inside the ZIP.");
    log("extract.pack_found", { packFilePath });

    // OLD parser (content only) — should fail on Market composer packs
    const raw = fs.readFileSync(packFilePath, "utf8");
    try {
      const old = JSON.parse(raw);
      const oldStructure = old.structure ?? old.content;
      if (!oldStructure) {
        log("regression.check", {
          oldParser: "FAIL Missing settings or content (expected before fix)",
          hasContents: Boolean(old.contents),
        });
      }
    } catch {
      /* ignore */
    }

    const pack = parseJsonPackContent(raw);
    const { main } = pack.settings;
    log("parse.ok", {
      name: main.name,
      appID: main.software_id,
      version: main.version,
      treeFolders: Object.keys(pack.structure).length,
    });

    const folderName = sanitizeFolderName(
      `${main.name || "Pack"}${main.software_id ? ` - ${main.software_id}` : ""}`,
    );
    const targetDir = path.join(installRoot, folderName);
    const sourceDir = path.dirname(packFilePath);
    const targetPackPath = path.join(targetDir, path.basename(packFilePath));

    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    const copyStarted = Date.now();
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const from = path.join(sourceDir, entry.name);
      const to = path.join(targetDir, entry.name);
      if (entry.isDirectory()) copyFolderRecursive(from, to);
      else fs.copyFileSync(from, to);
    }
    log("copy.done", {
      targetDir,
      top: fs.readdirSync(targetDir),
      ms: Date.now() - copyStarted,
    });

    const prefs = JSON.parse(fs.readFileSync(prefPath, "utf8"));
    const packages = Array.isArray(prefs.packages) ? [...prefs.packages] : [];
    const meta = {
      name: main.name || path.basename(packFilePath),
      author: main.cc_author_username || "Unknown",
      version: main.version || "1.0",
      path: targetPackPath,
      appID: main.software_id,
      appVersion: main.software_version,
    };
    const existingIndex = packages.findIndex(
      (p) => p.name === meta.name && p.appID === meta.appID,
    );
    if (existingIndex >= 0) packages[existingIndex] = meta;
    else packages.push(meta);
    prefs.packages = packages;
    fs.writeFileSync(prefPath, JSON.stringify(prefs, null, 2));

    // Remove successful cache zip like production install
    // (keep other cached zips)
    log("done", {
      name: meta.name,
      appID: meta.appID,
      path: meta.path,
      packagesCount: packages.length,
      ms: Date.now() - startedAt,
    });
    console.log("\nOK — pack installed into preferences + _ABS");
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error("[pack.install] FAIL", err);
  process.exit(1);
});
