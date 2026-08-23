import { fs, os, path } from "../lib/cep/node";

/** ExtendScript File() prefers forward slashes on Windows. */
export function esPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/** Copy to ASCII-only temp when path contains non-ASCII — AE importFile quirk. */
export function ensureAsciiImportPath(filePath: string): string {
  if (!/[^\u0000-\u007f]/.test(filePath)) return filePath;
  const ext = path.extname(filePath) || "";
  const dest = path.join(os.tmpdir(), `mf-import-ascii-${Date.now()}${ext}`);
  fs.copyFileSync(filePath, dest);
  return dest;
}
