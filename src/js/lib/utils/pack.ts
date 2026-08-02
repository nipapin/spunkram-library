import { fs, os, path } from "../cep/node";
import {
  isEncryptedAtomPack,
  isLegacyJsxbinPack,
  OLD_ATOM_JSXBIN_PIECE,
  PD_GLOBAL_SPLIT_ONE,
  pdRefractoring,
} from "./pack-decode";
import type {
  InstalledPackMeta,
  PackContent,
  PackInitError,
  PackInitResult,
  PackageFiletype,
} from "./pack-types";
import { PACKAGE_FILETYPES } from "./pack-types";

export type InitPackageCallback = (
  result: PackInitResult | false,
  error?: PackInitError,
) => void;

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function" && typeof fs?.readFile === "function";
}

/**
 * Check whether filename matches a pack extension (.spunkram / .atom).
 */
export function parsePackageFileFormat(
  filename: string,
  customFileType?: PackageFiletype | string,
): boolean {
  const match = /(?:\.([^.]+))?$/.exec(filename.toString());
  const format = match?.[1]?.toLowerCase();
  if (!format) return false;
  if (customFileType) return format === customFileType.toLowerCase();
  return (PACKAGE_FILETYPES as readonly string[]).includes(format);
}

function parseJsonPackContent(raw: string): PackContent {
  const parsed = JSON.parse(raw) as PackContent;
  if (!parsed?.settings || !parsed?.structure) {
    throw new Error("Missing settings or structure");
  }
  return parsed;
}

function toInitResult(
  content: PackContent,
  headerBytes = "",
  packHash = "",
): PackInitResult {
  return {
    method: "JSON",
    full_content: content,
    settings: content.settings,
    structure: content.structure,
    header_bytes: headerBytes,
    pack_hash: packHash,
  };
}

/**
 * Read and parse a `.spunkram` / `.atom` pack file.
 * Port of Spunkram Beta `initPackage`.
 *
 * Supports:
 * - plain JSON (test / uncompiled packs)
 * - Atom 3.0+ encrypted packs (PDRefractoring)
 *
 * Legacy JSXBIN packs return `CORRUPTED_PACK` here — they need ExtendScript.
 */
export function initPackage(
  packPath: string,
  initCallback: InitPackageCallback,
  options?: { testMode?: boolean },
): void {
  if (!cepFsAvailable()) {
    initCallback(false, "CANT_OPEN");
    return;
  }

  if (!fs.existsSync(packPath)) {
    initCallback(false, "PACK_NOT_FOUND");
    return;
  }

  fs.readFile(packPath, { encoding: "binary" }, (err, data) => {
    if (err || data == null) {
      initCallback(false, "CANT_OPEN");
      return;
    }

    const packContent = data.toString();
    const testMode = options?.testMode ?? false;

    if (testMode) {
      if (
        packContent.indexOf(PD_GLOBAL_SPLIT_ONE) !== -1 ||
        packContent.indexOf(OLD_ATOM_JSXBIN_PIECE) !== -1
      ) {
        initCallback(
          false,
          "CORRUPTED_TEST_PACK|Please use an uncompiled package",
        );
        return;
      }
      try {
        initCallback(toInitResult(parseJsonPackContent(packContent)));
      } catch (ex) {
        const message = ex instanceof Error ? ex.message : String(ex);
        initCallback(false, `CORRUPTED_TEST_PACK|${message}`);
      }
      return;
    }

    if (isEncryptedAtomPack(packContent)) {
      const packNewEvalObj = pdRefractoring(packContent);
      if (!packNewEvalObj) {
        initCallback(false, "CORRUPTED_PACK");
        return;
      }
      try {
        const newPackStructure = parseJsonPackContent(packNewEvalObj[2]);
        initCallback(
          toInitResult(newPackStructure, packNewEvalObj[1], packNewEvalObj[0]),
        );
      } catch {
        initCallback(false, "CORRUPTED_PACK");
      }
      return;
    }

    if (isLegacyJsxbinPack(packContent)) {
      // Pre-Atom-3.0 packs are JSXBIN-encoded — need ExtendScript eval, which
      // isn't available from CEP JS. Surfaced distinctly so the UI can point
      // users at reinstalling via Market instead of a generic error.
      initCallback(false, "LEGACY_JSXBIN_PACK");
      return;
    }

    // Unencrypted JSON packs (dev / exported structure)
    try {
      initCallback(toInitResult(parseJsonPackContent(packContent)));
    } catch {
      initCallback(false, "CORRUPTED_PACK");
    }
  });
}

/** Promise wrapper around {@link initPackage}. */
export function initPackageAsync(
  packPath: string,
  options?: { testMode?: boolean },
): Promise<PackInitResult> {
  return new Promise((resolve, reject) => {
    initPackage(
      packPath,
      (result, error) => {
        if (result) resolve(result);
        else reject(new Error(error ?? "UNKNOWN_ERROR"));
      },
      options,
    );
  });
}

/** Synchronous read — useful when already on the CEP Node thread. */
export function initPackageSync(
  packPath: string,
  options?: { testMode?: boolean },
): PackInitResult {
  if (!cepFsAvailable() || typeof fs.readFileSync !== "function") {
    throw new Error("CANT_OPEN");
  }
  if (!fs.existsSync(packPath)) {
    throw new Error("PACK_NOT_FOUND");
  }

  const packContent = fs.readFileSync(packPath, { encoding: "binary" }).toString();
  const testMode = options?.testMode ?? false;

  if (testMode) {
    if (isEncryptedAtomPack(packContent) || isLegacyJsxbinPack(packContent)) {
      throw new Error("CORRUPTED_TEST_PACK|Please use an uncompiled package");
    }
    return toInitResult(parseJsonPackContent(packContent));
  }

  if (isEncryptedAtomPack(packContent)) {
    const packNewEvalObj = pdRefractoring(packContent);
    if (!packNewEvalObj) throw new Error("CORRUPTED_PACK");
    return toInitResult(
      parseJsonPackContent(packNewEvalObj[2]),
      packNewEvalObj[1],
      packNewEvalObj[0],
    );
  }

  if (isLegacyJsxbinPack(packContent)) {
    throw new Error("LEGACY_JSXBIN_PACK");
  }

  return toInitResult(parseJsonPackContent(packContent));
}

/** Human-friendly message for a {@link PackInitError} code. */
export function packInitErrorMessage(error: string): string {
  const [code, detail] = error.split("|");
  switch (code) {
    case "PACK_NOT_FOUND":
      return "The pack file is missing on disk.";
    case "CANT_OPEN":
      return "Couldn't open the pack file.";
    case "LEGACY_JSXBIN_PACK":
      return "This pack uses a legacy format that isn't supported here — reinstall it from Market to get an updated version.";
    case "CORRUPTED_PACK":
      return "This pack file looks corrupted.";
    case "CORRUPTED_TEST_PACK":
      return detail || "This test pack looks corrupted.";
    default:
      return detail || code || "Unknown error loading pack.";
  }
}

/**
 * Resolve assets folder next to the pack file
 * (`Spunkram Preview Assets` / legacy `Atom Preview Assets`).
 */
export function resolvePackAssetsPath(packFilePath: string): string {
  if (typeof path?.dirname !== "function" || typeof path?.join !== "function") {
    return "";
  }
  const dir = path.dirname(packFilePath);
  const candidates = [
    path.join(dir, "Spunkram Preview Assets"),
    path.join(dir, "Atom Preview Assets"),
  ];
  for (const candidate of candidates) {
    if (cepFsAvailable() && fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

/** Default preferences.json locations used by Spunkram / Atom installs. */
export function getPreferencesCandidates(): string[] {
  if (typeof os?.homedir !== "function" || typeof path?.join !== "function") {
    return [];
  }
  const roaming =
    os.platform() === "win32"
      ? path.join(os.homedir(), "AppData", "Roaming")
      : path.join(os.homedir(), "Library", "Application Support");
  return [
    path.join(roaming, "Spunkram", "Spunkram Extension", "preferences.json"),
    path.join(roaming, "SpunkramTemp", "Spunkram Extension", "preferences.json"),
    path.join(roaming, "Aniom", "Atom Extension", "preferences.json"),
    path.join(roaming, "Aniom", "Spunkram Extension", "preferences.json"),
  ];
}

export function readInstalledPackagesFromPreferences(
  preferencesPath?: string,
): InstalledPackMeta[] {
  if (!cepFsAvailable() || typeof fs.readFileSync !== "function") return [];

  const candidates = preferencesPath
    ? [preferencesPath]
    : getPreferencesCandidates();

  for (const prefPath of candidates) {
    if (!fs.existsSync(prefPath)) continue;
    try {
      const raw = fs.readFileSync(prefPath, { encoding: "utf8" }).toString();
      const json = JSON.parse(raw) as { packages?: InstalledPackMeta[] };
      if (Array.isArray(json.packages) && json.packages.length > 0) {
        return json.packages;
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

/** All installed packages that look like valid `.spunkram`/`.atom` pack files. */
export function readInstallablePackages(): InstalledPackMeta[] {
  return readInstalledPackagesFromPreferences().filter(
    (p) => p.path && parsePackageFileFormat(p.path),
  );
}

/** Load one specific installed pack (used by the multi-pack switcher). */
export async function loadInstalledPack(meta: InstalledPackMeta): Promise<{
  meta: InstalledPackMeta;
  pack: PackInitResult;
  assetsPath: string;
}> {
  const pack = await initPackageAsync(meta.path);
  return {
    meta,
    pack,
    assetsPath: resolvePackAssetsPath(meta.path),
  };
}

/**
 * Load the first installed pack from preferences (if any).
 */
export async function loadFirstInstalledPack(): Promise<{
  meta: InstalledPackMeta;
  pack: PackInitResult;
  assetsPath: string;
} | null> {
  const meta = readInstallablePackages()[0];
  if (!meta) return null;
  return loadInstalledPack(meta);
}
