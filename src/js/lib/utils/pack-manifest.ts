/**
 * Pack file manifests (`manifest.json` next to the `.spunkram`).
 * Array form matches installed Spunkram packs; object form matches smart_update / R2.
 */
import { fs, path } from "../cep/node";

export type PackManifestFileEntry = {
  name?: string;
  path: string;
  size?: number;
  hash: string;
};

export type PackManifestMap = Map<string, string>;

export function resolvePackBundleDir(packFilePath: string): string {
  return path.dirname(packFilePath);
}

export function packManifestPath(packDir: string): string {
  return path.join(packDir, "manifest.json");
}

export function readLocalPackManifest(packDir: string): unknown | null {
  const file = packManifestPath(packDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeLocalPackManifest(packDir: string, manifest: unknown): void {
  fs.writeFileSync(
    packManifestPath(packDir),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

export function normalizePackManifest(raw: unknown): PackManifestMap {
  const map: PackManifestMap = new Map();
  if (raw == null) return map;

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      const p =
        typeof rec.path === "string"
          ? rec.path.replace(/\\/g, "/").replace(/^\/+/, "")
          : "";
      const hash = typeof rec.hash === "string" ? rec.hash.trim().toLowerCase() : "";
      if (p && hash && !p.split("/").includes("..")) map.set(p, hash);
    }
    return map;
  }

  if (typeof raw === "object" && raw !== null && "files" in raw) {
    const files = (raw as { files: unknown }).files;
    if (files && typeof files === "object") {
      for (const [key, meta] of Object.entries(files as Record<string, unknown>)) {
        const p = key.replace(/\\/g, "/").replace(/^\/+/, "");
        if (!p || p.split("/").includes("..")) continue;
        let hash = "";
        if (meta && typeof meta === "object" && "hash" in meta) {
          hash = String((meta as { hash: unknown }).hash ?? "")
            .trim()
            .toLowerCase();
        } else if (typeof meta === "string") {
          hash = meta.trim().toLowerCase();
        }
        if (hash) map.set(p, hash);
      }
    }
  }
  return map;
}

/** Delete files listed in `oldManifest` but absent from `newManifest` (paths relative to packDir). */
export function removeFilesNotInManifest(
  packDir: string,
  oldManifest: unknown,
  newManifest: unknown,
): number {
  const oldMap = normalizePackManifest(oldManifest);
  const newMap = normalizePackManifest(newManifest);
  let deleted = 0;

  for (const rel of oldMap.keys()) {
    if (rel === "manifest.json") continue;
    if (newMap.has(rel)) continue;
    const full = path.join(packDir, rel);
    try {
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
        deleted += 1;
      }
    } catch {
      /* skip locked / missing */
    }
  }

  // Best-effort empty dir cleanup (shallow walk of removed parents is enough for most packs).
  const dirs = new Set<string>();
  for (const rel of oldMap.keys()) {
    if (newMap.has(rel)) continue;
    let dir = path.dirname(path.join(packDir, rel));
    while (dir && dir.startsWith(packDir) && dir !== packDir) {
      dirs.add(dir);
      dir = path.dirname(dir);
    }
  }
  const sorted = [...dirs].sort((a, b) => b.length - a.length);
  for (const dir of sorted) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
    } catch {
      /* ignore */
    }
  }

  return deleted;
}
