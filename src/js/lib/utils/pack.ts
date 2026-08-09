import { fs, os, path } from "../cep/node";
import {
  isEncryptedAtomPack,
  isLegacyJsxbinPack,
  OLD_ATOM_JSXBIN_PIECE,
  PD_GLOBAL_SPLIT_ONE,
  pdRefractoring,
} from "./pack-decode";
import { noteLegacyEncryptedPack } from "./pack-legacy-warn";
import { resolvePackPreviewsPath } from "./pack-folders";
import type {
  InstalledPackMeta,
  PackContent,
  PackInitError,
  PackInitResult,
  PackageFiletype,
} from "./pack-types";
import { PACKAGE_FILETYPES } from "./pack-types";
import {
  currentPackHost,
  normalizePackHost,
  resolveInstalledPackHost,
  packMetaMatchesHost,
  type PackHostId,
} from "./pack-host";

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

/**
 * Normalize plaintext pack JSON. Market packs use `contents` (composer) or
 * `content` for the tree; older exports used `structure`. All map to the
 * in-memory `structure` field used by the panel.
 */
function parseJsonPackContent(raw: string): PackContent {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  const parsed = JSON.parse(cleaned) as {
    settings?: PackContent["settings"];
    structure?: PackContent["structure"];
    content?: PackContent["structure"];
    contents?: PackContent["structure"];
  };
  const structure = parsed.structure ?? parsed.contents ?? parsed.content;
  if (!parsed?.settings || !structure || typeof structure !== "object") {
    throw new Error("Missing settings or content");
  }
  return { settings: parsed.settings, structure };
}

function looksLikeJsonPack(raw: string): boolean {
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  return cleaned.startsWith("{");
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
 *
 * Prefers plaintext JSON (Motionflow Market). Soft-legacy: Atom 3.0+ encrypted
 * packs still decode, but callers should surface a reinstall-from-Market hint.
 * Legacy JSXBIN packs return `LEGACY_JSXBIN_PACK`.
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

  // Prefer buffer so plaintext UTF-8 JSON stays intact; encrypted legacy
  // packs are still decoded from a latin1/binary view of the same bytes.
  fs.readFile(packPath, (err, data) => {
    if (err || data == null) {
      initCallback(false, "CANT_OPEN");
      return;
    }

    const asUtf8 =
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
          ? data.toString("utf8")
          : String(data);
    const asBinary =
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
          ? data.toString("binary")
          : String(data);
    const testMode = options?.testMode ?? false;

    if (testMode) {
      if (
        asBinary.indexOf(PD_GLOBAL_SPLIT_ONE) !== -1 ||
        asBinary.indexOf(OLD_ATOM_JSXBIN_PIECE) !== -1
      ) {
        initCallback(
          false,
          "CORRUPTED_TEST_PACK|Please use an uncompiled package",
        );
        return;
      }
      try {
        initCallback(toInitResult(parseJsonPackContent(asUtf8)));
      } catch (ex) {
        const message = ex instanceof Error ? ex.message : String(ex);
        initCallback(false, `CORRUPTED_TEST_PACK|${message}`);
      }
      return;
    }

    // Plaintext Market packs (JSON with settings + content|structure)
    if (looksLikeJsonPack(asUtf8)) {
      try {
        initCallback(toInitResult(parseJsonPackContent(asUtf8)));
      } catch {
        initCallback(false, "CORRUPTED_PACK");
      }
      return;
    }

    if (isEncryptedAtomPack(asBinary)) {
      const packNewEvalObj = pdRefractoring(asBinary);
      if (!packNewEvalObj) {
        initCallback(false, "CORRUPTED_PACK");
        return;
      }
      try {
        const newPackStructure = parseJsonPackContent(packNewEvalObj[2]);
        noteLegacyEncryptedPack();
        initCallback(
          toInitResult(newPackStructure, packNewEvalObj[1], packNewEvalObj[0]),
        );
      } catch {
        initCallback(false, "CORRUPTED_PACK");
      }
      return;
    }

    if (isLegacyJsxbinPack(asBinary)) {
      // Pre-Atom-3.0 packs are JSXBIN-encoded — need ExtendScript eval, which
      // isn't available from CEP JS. Surfaced distinctly so the UI can point
      // users at reinstalling via Market instead of a generic error.
      initCallback(false, "LEGACY_JSXBIN_PACK");
      return;
    }

    try {
      initCallback(toInitResult(parseJsonPackContent(asUtf8)));
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

  const buf = fs.readFileSync(packPath);
  const asUtf8 = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
  const asBinary = Buffer.isBuffer(buf) ? buf.toString("binary") : String(buf);
  const testMode = options?.testMode ?? false;

  if (testMode) {
    if (isEncryptedAtomPack(asBinary) || isLegacyJsxbinPack(asBinary)) {
      throw new Error("CORRUPTED_TEST_PACK|Please use an uncompiled package");
    }
    return toInitResult(parseJsonPackContent(asUtf8));
  }

  if (looksLikeJsonPack(asUtf8)) {
    return toInitResult(parseJsonPackContent(asUtf8));
  }

  if (isEncryptedAtomPack(asBinary)) {
    const packNewEvalObj = pdRefractoring(asBinary);
    if (!packNewEvalObj) throw new Error("CORRUPTED_PACK");
    noteLegacyEncryptedPack();
    return toInitResult(
      parseJsonPackContent(packNewEvalObj[2]),
      packNewEvalObj[1],
      packNewEvalObj[0],
    );
  }

  if (isLegacyJsxbinPack(asBinary)) {
    throw new Error("LEGACY_JSXBIN_PACK");
  }

  return toInitResult(parseJsonPackContent(asUtf8));
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
      return "This pack uses a legacy format that isn't supported here — Remove it and Install again from Market.";
    case "CORRUPTED_PACK":
      return "This pack file looks corrupted. Remove it and Install again from Market if needed.";
    case "CORRUPTED_TEST_PACK":
      return detail || "This test pack looks corrupted.";
    default:
      return detail || code || "Unknown error loading pack.";
  }
}

/**
 * Resolve preview-media folder next to the pack file
 * (`Previews` / legacy `Spunkram Preview Assets` / `Atom Preview Assets` / `* Preview Assets`).
 */
export function resolvePackAssetsPath(packFilePath: string): string {
  return resolvePackPreviewsPath(packFilePath);
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
      if (!raw.trim()) return [];
      const json = JSON.parse(raw) as { packages?: InstalledPackMeta[] };
      // First existing prefs file wins — even when packages is [].
      // Do not fall through to legacy Aniom/Temp installs after a clear.
      if (Array.isArray(json.packages)) {
        return json.packages;
      }
      return [];
    } catch {
      // unreadable / empty wipe → treat as no packages for this path
      return [];
    }
  }
  return [];
}

/** All installed pack files (any host). Prefer {@link readInstallablePackages}. */
export function readAllInstallablePackages(): InstalledPackMeta[] {
  return readInstalledPackagesFromPreferences().filter(
    (p) => p.path && parsePackageFileFormat(p.path),
  );
}

/**
 * Installed packs for a host. Defaults to the current CEP host.
 * Packs with unknown/mismatched `appID` are excluded.
 */
export function readInstallablePackages(
  host: PackHostId | null = currentPackHost(),
): InstalledPackMeta[] {
  const all = readAllInstallablePackages();
  if (!host) return [];
  return all.filter((p) => packMetaMatchesHost(p, host));
}

/** Load one specific installed pack (used by the multi-pack switcher). */
export async function loadInstalledPack(meta: InstalledPackMeta): Promise<{
  meta: InstalledPackMeta;
  pack: PackInitResult;
  assetsPath: string;
}> {
  const host = currentPackHost();
  const pack = await initPackageAsync(meta.path);
  const resolvedHost =
    resolveInstalledPackHost(meta) ||
    normalizePackHost(pack.settings.main.software_id);
  if (host && (!resolvedHost || resolvedHost !== host)) {
    const other = host === "AE" ? "Premiere Pro" : "After Effects";
    throw new Error(
      resolvedHost
        ? `This pack is for ${other}. Open it there.`
        : "This pack has no host app id and can't be opened here.",
    );
  }
  return {
    meta,
    pack,
    assetsPath: resolvePackAssetsPath(meta.path),
  };
}

/**
 * Load the first installed pack for the current host (if any).
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
