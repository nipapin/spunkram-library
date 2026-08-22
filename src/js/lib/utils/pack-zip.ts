/**
 * Minimal ZIP reader (no external dependency) for installing Market packages.
 * Supports Store (0) and Deflate (8). Reads via file descriptor so multi‑GB
 * Market zips are not loaded entirely into memory (CEP Buffer limits).
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
const MAX_EOCD_SCAN = 65557; // 22 (fixed) + max 65535 comment

function readExact(fd: number, offset: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const n = fs.readSync(fd, buf, filled, length - filled, offset + filled);
    if (n <= 0) {
      throw new Error(`Unexpected EOF reading zip at offset ${offset + filled}`);
    }
    filled += n;
  }
  return buf;
}

function findEndOfCentralDirectoryInBuffer(buf: Buffer): number {
  const start = Math.max(0, buf.length - MAX_EOCD_SCAN);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("Not a valid ZIP file (no end-of-central-directory record)");
}

function findEndOfCentralDirectory(fd: number, fileSize: number): {
  eocdOffset: number;
  totalEntries: number;
  cdSize: number;
  cdOffset: number;
} {
  const scanSize = Math.min(fileSize, MAX_EOCD_SCAN);
  const tail = readExact(fd, fileSize - scanSize, scanSize);
  const rel = findEndOfCentralDirectoryInBuffer(tail);
  const eocdOffset = fileSize - scanSize + rel;
  const totalEntries = tail.readUInt16LE(rel + 10);
  const cdSize = tail.readUInt32LE(rel + 12);
  const cdOffset = tail.readUInt32LE(rel + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || totalEntries === 0xffff) {
    throw new Error(
      "ZIP64 archives are not supported yet. Re-export the pack or contact support.",
    );
  }
  return { eocdOffset, totalEntries, cdSize, cdOffset };
}

function parseCentralDirectory(cdBuf: Buffer, totalEntries: number): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let cdOffset = 0;
  for (let i = 0; i < totalEntries; i++) {
    if (cdBuf.readUInt32LE(cdOffset) !== CENTRAL_DIR_SIG) {
      throw new Error("Malformed ZIP central directory");
    }
    const method = cdBuf.readUInt16LE(cdOffset + 10);
    const compressedSize = cdBuf.readUInt32LE(cdOffset + 20);
    const uncompressedSize = cdBuf.readUInt32LE(cdOffset + 24);
    const nameLength = cdBuf.readUInt16LE(cdOffset + 28);
    const extraLength = cdBuf.readUInt16LE(cdOffset + 30);
    const commentLength = cdBuf.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = cdBuf.readUInt32LE(cdOffset + 42);
    const name = cdBuf
      .subarray(cdOffset + 46, cdOffset + 46 + nameLength)
      .toString("utf8");

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new Error(
        `ZIP64 entry is not supported yet: "${name}". Re-export the pack or contact support.`,
      );
    }

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

/** List every entry in a zip buffer, reading only the central directory. */
export function listZipEntries(buf: Buffer): ZipEntry[] {
  const eocdRel = findEndOfCentralDirectoryInBuffer(buf);
  const totalEntries = buf.readUInt16LE(eocdRel + 10);
  const cdSize = buf.readUInt32LE(eocdRel + 12);
  const cdOffset = buf.readUInt32LE(eocdRel + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || totalEntries === 0xffff) {
    throw new Error(
      "ZIP64 archives are not supported yet. Re-export the pack or contact support.",
    );
  }
  return parseCentralDirectory(buf.subarray(cdOffset, cdOffset + cdSize), totalEntries);
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

function readZipEntryDataFromFd(fd: number, entry: ZipEntry): Buffer {
  const header = readExact(fd, entry.localHeaderOffset, 30);
  if (header.readUInt32LE(0) !== LOCAL_HEADER_SIG) {
    throw new Error(`Malformed ZIP local header for "${entry.name}"`);
  }
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const raw = readExact(fd, dataStart, entry.compressedSize);

  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`Unsupported ZIP compression method (${entry.method}) for "${entry.name}"`);
}

function mkdirRecursive(dir: string): void {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
}

export class ExtractAbortedError extends Error {
  constructor() {
    super("Extraction aborted");
    this.name = "ExtractAbortedError";
  }
}

/** Extract every entry of a zip file on disk into `destDir`, preserving structure. */
export function extractZipToFolder(
  zipPath: string,
  destDir: string,
  opts?: { signal?: AbortSignal },
): string[] {
  const fd = fs.openSync(zipPath, "r");
  try {
    const fileSize = fs.fstatSync(fd).size;
    const { totalEntries, cdSize, cdOffset } = findEndOfCentralDirectory(fd, fileSize);
    const cdBuf = readExact(fd, cdOffset, cdSize);
    const entries = parseCentralDirectory(cdBuf, totalEntries);
    const written: string[] = [];

    for (const entry of entries) {
      // Check for abort signal before each file
      if (opts?.signal?.aborted) {
        throw new ExtractAbortedError();
      }

      // Guard against zip-slip path traversal.
      const normalized = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
      if (normalized.split("/").includes("..")) continue;

      const targetPath = path.join(destDir, normalized);
      if (entry.isDir) {
        mkdirRecursive(targetPath);
        continue;
      }
      mkdirRecursive(path.dirname(targetPath));
      fs.writeFileSync(targetPath, readZipEntryDataFromFd(fd, entry));
      written.push(targetPath);
    }
    return written;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // best-effort
    }
  }
}
