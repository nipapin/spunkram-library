import { fs, path } from "../lib/cep/node";
import { csi } from "../lib/utils/bolt";
import { Motionflow } from "@/sdk";
import { defaultsFromDefinition } from "../presets";
import type { MogrtDefinition } from "../presets/types";
import { loadLocalPackage } from "./localStore";
import { downloadStylePackage, ensureDefinitionForStyle, makeOrigin, previewFromValues } from "./sync";
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

/** Локальные пути к project.aep / project.mogrt (null в browser preview). */
export const getLocalStyleAssetPaths = (styleId: string): LocalStyleAssetPaths | null => {
  const pkg = loadLocalPackage(styleId);
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
 * 1) при необходимости POST /api/captions (session + subscription)
 * 2) сохранить проект в AppData
 * 3) вернуть локальные пути
 */
export const acquirePresetProject = async (
  target: Pick<StylePreset, "id" | "name" | "styleId" | "files" | "controlsUrl" | "previewImageUrl" | "previewVideoUrl">,
  options?: { forceDownload?: boolean },
): Promise<PreparedPresetProject> => {
  const hostAppId = csi.hostEnvironment?.appId;
  const local = loadLocalPackage(target.styleId);
  const paths = local ? getLocalStyleAssetPaths(target.styleId) : null;
  const definition = await ensureDefinitionForStyle(target.styleId, {
    name: target.name,
    files: target.files,
    controlsUrl: target.controlsUrl,
    previewImageUrl: target.previewImageUrl,
    previewVideoUrl: target.previewVideoUrl,
  });

  if (local && !options?.forceDownload && hostHasNeededFile(paths, hostAppId)) {
    return {
      preset: presetFromLocal(target, definition, local.manifest.version),
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
  });

  return {
    preset,
    definition: downloadedDef.clientControls?.length ? downloadedDef : definition,
    paths: getLocalStyleAssetPaths(target.styleId),
  };
};

/**
 * Применить скачанный проект в AE / Premiere.
 * JSX пока-заглушка — { applied: false, reason: "not_implemented" }.
 */
export const applyPresetProjectInHost = async (
  prepared: PreparedPresetProject,
): Promise<ApplyStyleProjectResult> => {
  const appId = csi.hostEnvironment?.appId;
  if (appId !== "AEFT" && appId !== "PPRO") {
    return { applied: false, reason: "unsupported_host" };
  }

  const hostApi = Motionflow.host === "AE" ? Motionflow.AE : Motionflow.PPRO;
  const wrapped = await hostApi.applyStyleProject({
    styleId: prepared.preset.styleId,
    styleName: prepared.preset.name,
    aepPath: prepared.paths?.aep,
    mogrtPath: prepared.paths?.mogrt,
    values: prepared.preset.values,
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
