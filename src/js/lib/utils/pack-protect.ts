/**
 * Pack asset file protection (port of Spunkram Beta `rw_protectionFileAssets`).
 * Both schemes are base64-based, not real encryption:
 * - BIN_AX: whole file base64-encoded → `.atomxasset`.
 * - MG_ASSET: base64 + fixed salt padding around the payload → `.mgasset`.
 */
import { fs, os, path } from "../cep/node";

/** Salt wrapped around MG_ASSET base64 payloads (ported verbatim from Beta `headers.js`). */
const MG_ASSET_SALT = {
  start: "SV9MT1ZFX1VfSEFDS0VSTUFO",
  end: "RG8geW91IGhhdmUgdG8gZGVhbCB3aXRoIEJhc2U2NCBmb3JtYXQ/IFRoZW4gdGhpcyBzaXRlIGlzIHBlcmZlY3QgZm9yIHlvdSEgVXNlIG91ciBzdXBlciBoYW5keSBvbmxpbmUgdG9vbCB0byBlbmNvZGUgb3IgZGVjb2RlIHlvdXIgZGF0YS4=",
} as const;

function cepFsAvailable(): boolean {
  return (
    typeof fs?.existsSync === "function" &&
    typeof fs?.readFileSync === "function" &&
    typeof fs?.writeFileSync === "function"
  );
}

function cacheDir(): string {
  if (typeof os?.tmpdir !== "function" || typeof path?.join !== "function") {
    throw new Error("CANT_OPEN");
  }
  const dir = path.join(os.tmpdir(), "spunkram-library-cache");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function replaceAll(input: string, search: string, replacement: string): string {
  return input.split(search).join(replacement);
}

/** Decode a `BIN_AX` (`.atomxasset`) file into a plain cache file. Returns the cache path. */
export function decodeBinAxFile(sourcePath: string, cacheName: string): string {
  if (!cepFsAvailable()) throw new Error("CANT_OPEN");
  if (!fs.existsSync(sourcePath)) throw new Error("MISSING_SOURCE_FILE");

  const raw = fs.readFileSync(sourcePath, { encoding: "ascii" }).toString();
  const decoded = Buffer.from(raw, "base64");
  const outPath = path.join(cacheDir(), cacheName);
  fs.writeFileSync(outPath, decoded);
  return outPath;
}

/** Decode an `MG_ASSET` (`.mgasset`) file into a plain `.mogrt` cache file. Returns the cache path. */
export function decodeMgAssetFile(sourcePath: string, cacheName: string): string {
  if (!cepFsAvailable()) throw new Error("CANT_OPEN");
  if (!fs.existsSync(sourcePath)) throw new Error("MISSING_SOURCE_FILE");

  let raw = fs.readFileSync(sourcePath, { encoding: "ascii" }).toString();
  // Undo the "Ab" symbol substitution, then strip the salt wrapping.
  raw = replaceAll(raw, "#i", "+a");
  raw = replaceAll(raw, "$1", "+s");
  raw = raw.replace(MG_ASSET_SALT.start, "").replace(MG_ASSET_SALT.end, "");

  const decoded = Buffer.from(raw, "base64");
  const outPath = path.join(cacheDir(), cacheName);
  fs.writeFileSync(outPath, decoded);
  return outPath;
}

/** Best-effort cache cleanup after a decoded file has been consumed. */
export function cleanupCacheFile(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    if (cepFsAvailable() && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best-effort — leftovers are harmless temp files
  }
}
