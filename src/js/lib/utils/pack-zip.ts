/**
 * Minimal ZIP reader (no external dependency) for installing Market packages.
 * Supports the two methods every zip tool writes: Store (0) and Deflate (8).
 * CEP ships Node's `zlib`, which gives us raw inflate for free.
 */
import { fs, path, zlib } from "../cep/node";

export type ZipEntry = {
  name: string;
  isDir: boolean;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const EOCD_SIG = 0x06054b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const LOCAL_HEADER_SIG = 0x04034b50;

function findEndOfCentralDirectory(buf: Buffer): number {
  const maxCommentSize = 65557; // 22 (fixed) + max 65535 comment
  const start = Math.max(0, buf.length - maxCommentSize);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("Not a valid ZIP file (no end-of-central-directory record)");
}

/** List every entry in a zip buffer, reading only the central directory. */
export function listZipEntries(buf: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buf);
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(cdOffset) !== CENTRAL_DIR_SIG) {
      throw new Error("Malformed ZIP central directory");
    }
    const method = buf.readUInt16LE(cdOffset + 10);
    const compressedSize = buf.readUInt32LE(cdOffset + 20);
    const uncompressedSize = buf.readUInt32LE(cdOffset + 24);
    const nameLength = buf.readUInt16LE(cdOffset + 28);
    const extraLength = buf.readUInt16LE(cdOffset + 30);
    const commentLength = buf.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
    const name = buf
      .subarray(cdOffset + 46, cdOffset + 46 + nameLength)
      .toString("utf8");

    entries.push({
      name,
      isDir: name.endsWith("/"),
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cdOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Decompress a single entry's data given the source zip buffer. */
export function readZipEntryData(buf: Buffer, entry: ZipEntry): Buffer {
  const off = entry.localHeaderOffset;
  if (buf.readUInt32LE(off) !== LOCAL_HEADER_SIG) {
    throw new Error(`Malformed ZIP local header for "${entry.name}"`);
  }
  const nameLength = buf.readUInt16LE(off + 26);
  const extraLength = buf.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLength + extraLength;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`Unsupported ZIP compression method (${entry.method}) for "${entry.name}"`);
}

function mkdirRecursive(dir: string): void {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
}

/** Extract every entry of a zip file on disk into `destDir`, preserving structure. */
export function extractZipToFolder(zipPath: string, destDir: string): string[] {
  const buf = fs.readFileSync(zipPath);
  const entries = listZipEntries(buf);
  const written: string[] = [];

  for (const entry of entries) {
    // Guard against zip-slip path traversal.
    const normalized = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.split("/").includes("..")) continue;

    const targetPath = path.join(destDir, normalized);
    if (entry.isDir) {
      mkdirRecursive(targetPath);
      continue;
    }
    mkdirRecursive(path.dirname(targetPath));
    fs.writeFileSync(targetPath, readZipEntryData(buf, entry));
    written.push(targetPath);
  }
  return written;
}
