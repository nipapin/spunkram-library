import { fs, path } from "../lib/cep/node";
import { cepHostAppId } from "../lib/utils/bolt";
import { hostSdk } from "@/sdk";
import { getBundledCaptionsJsxPath } from "../utils/captionsJsx";
import { defaultsFromDefinition } from "../presets";
import type { MogrtDefinition } from "../presets/types";
import { loadLocalPackage } from "./localStore";
import { getLocalOverrideAssetPaths } from "./localSource";
import { packIdFromStyleId } from "./paths";
import { downloadStylePackage, ensureDefinitionForStyle, hasLocalPackTemplate, makeOrigin, previewFromValues } from "./sync";
import type { CaptionCatalogEntry, StylePreset } from "./types";

export interface LocalStyleAssetPaths {
  dir: string;
  aep?: string;
  mogrt?: string;
}

export interface PreparedPresetProject {
  preset: StylePreset;
  definition: MogrtDefinition;
  paths: LocalStyleAssetPaths | null;
}

export type ApplyStyleProjectResult = {
  applied: boolean;
  reason?: string;
};

export type AcquirePresetStatus = "idle" | "verifying" | "downloading" | "applying" | "ready" | "error";

const fileExists = (p?: string): boolean => {
  if (!p || typeof fs?.existsSync !== "function") return false;
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

/**
 * Local paths to this style's pack `{Pack}.aep` / `{Pack}.mogrt`.
 * Admin local override prefers live `{Pack}/{Pack}.*` under the chosen folder.
 */
export const getLocalStyleAssetPaths = (styleId: string): LocalStyleAssetPaths | null => {
  const packId = packIdFromStyleId(styleId);
  if (!packId) return null;

  const override = getLocalOverrideAssetPaths(packId);
  if (override) return override;

  const pkg = loadLocalPackage(packId);
  if (!pkg || pkg.dir.startsWith("memory://")) return null;
  const aep = pkg.manifest.files.aep ? path.join(pkg.dir, pkg.manifest.files.aep) : undefined;
  const mogrt = pkg.manifest.files.mogrt ? path.join(pkg.dir, pkg.manifest.files.mogrt) : undefined;
  return {
    dir: pkg.dir,
    aep: fileExists(aep) ? aep : undefined,
    mogrt: fileExists(mogrt) ? mogrt : undefined,
  };
};

const hostHasNeededFile = (paths: LocalStyleAssetPaths | null, hostAppId?: string): boolean => {
  if (!paths) return false;
  if (hostAppId === "AEFT") return !!paths.aep || !!paths.mogrt;
  if (hostAppId === "PPRO") return !!paths.mogrt || !!paths.aep;
  return !!(paths.mogrt || paths.aep);
};

const presetFromLocal = (
  target: Pick<StylePreset, "id" | "name" | "styleId" | "files" | "controlsUrl" | "previewImageUrl" | "previewVideoUrl">,
  definition: MogrtDefinition,
  version: string,
): StylePreset => {
  const values = defaultsFromDefinition(definition);
  return {
    id: target.styleId,
    name: target.name,
    favorite: false,
    styleId: target.styleId,
    styleVersion: version,
    source: "downloaded",
    values,
    origin: makeOrigin(target.name, values),
    updateAvailable: false,
    preview: previewFromValues(values, definition),
    files: target.files,
    controlsUrl: target.controlsUrl,
    previewImageUrl: target.previewImageUrl,
    previewVideoUrl: target.previewVideoUrl,
  };
};

/**
 * 1) ensure this pack's .aep/.mogrt in AppData (POST id=packName)
 * 2) load controls.json for this preset
 * 3) return local pack paths
 */
export const acquirePresetProject = async (
  target: Pick<StylePreset, "id" | "name" | "styleId" | "files" | "controlsUrl" | "previewImageUrl" | "previewVideoUrl">,
  options?: { forceDownload?: boolean },
): Promise<PreparedPresetProject> => {
  const hostAppId = cepHostAppId() ?? undefined;
  const packId = packIdFromStyleId(target.styleId);
  const paths = getLocalStyleAssetPaths(target.styleId);
  const definition = await ensureDefinitionForStyle(target.styleId, {
    name: target.name,
    files: target.files,
    controlsUrl: target.controlsUrl,
    previewImageUrl: target.previewImageUrl,
    previewVideoUrl: target.previewVideoUrl,
  });

  if (!options?.forceDownload && hasLocalPackTemplate(packId, hostAppId) && hostHasNeededFile(paths, hostAppId)) {
    const pack = loadLocalPackage(packId);
    return {
      preset: presetFromLocal(target, definition, pack?.manifest.version || "local"),
      definition,
      paths,
    };
  }

  const { preset, definition: downloadedDef } = await downloadStylePackage(target.styleId, {
    hostAppId,
    files: target.files as CaptionCatalogEntry["files"] | undefined,
    name: target.name,
    controlsUrl: target.controlsUrl,
    previewImageUrl: target.previewImageUrl,
    previewVideoUrl: target.previewVideoUrl,
    force: options?.forceDownload,
  });

  return {
    preset,
    definition: downloadedDef.clientControls?.length ? downloadedDef : definition,
    paths: getLocalStyleAssetPaths(target.styleId),
  };
};

/**
 * Import the pack caption .mogrt/.aep (first placement only).
 * Style values are applied afterwards via applyCaptionStyleValues.
 */
export const applyPresetProjectInHost = async (
  prepared: PreparedPresetProject,
): Promise<ApplyStyleProjectResult> => {
  const appId = cepHostAppId();
  if (appId !== "AEFT" && appId !== "PPRO") {
    return { applied: false, reason: "unsupported_host" };
  }

  const hostApi = hostSdk();
  const wrapped = await hostApi.applyStyleProject({
    styleId: prepared.preset.styleId,
    styleName: prepared.preset.name,
    aepPath: prepared.paths?.aep,
    mogrtPath: prepared.paths?.mogrt,
    values: prepared.preset.values,
    captionsJsxPath: getBundledCaptionsJsxPath() ?? undefined,
  });
  if (!wrapped.ok) {
    return { applied: false, reason: wrapped.error };
  }
  const result = wrapped.data as ApplyStyleProjectResult | null;
  return result ?? { applied: false, reason: "host_returned_null" };
};

export const acquireAndApplyPreset = async (
  target: Pick<StylePreset, "id" | "name" | "styleId" | "files" | "controlsUrl" | "previewImageUrl" | "previewVideoUrl">,
  options?: { forceDownload?: boolean },
): Promise<{ prepared: PreparedPresetProject; apply: ApplyStyleProjectResult }> => {
  const prepared = await acquirePresetProject(target, options);
  const apply = await applyPresetProjectInHost(prepared);
  return { prepared, apply };
};
