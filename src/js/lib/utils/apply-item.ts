/**
 * Apply a pack item (transition/title/SFX/footage) to the host project.
 *
 * Premiere Pro:
 *   FULL_PROJECT → `$._copyPasteSystem` + Motionflow.dll (Beta customChain)
 *   MOGRT        → seq.importMGT
 *   FOOTAGE/AUDIO → importFiles + place
 *
 * After Effects:
 *   PROJECT (.aep) / FOOTAGE / AUDIO → host applyPackItem
 */
import { csi } from "./bolt";
import { Motionflow } from "@/sdk";
import { fs, path } from "../cep/node";
import {
  resolveItemSourceFile,
  resolvePackTemplatesPath,
  type HostAppId,
} from "./pack-apply-paths";
import {
  applyFullProjectViaCopyPaste,
  resolveFullProjectAssetsPath,
} from "./copy-paste-apply";
import type { PackSettings, PackTreeItem } from "./pack-types";
import { INSTANCE_GROUP_JOIN_CHAR } from "./pack-types";
import { reportSupportError } from "@/api/support";
import { currentPackHost, normalizePackHost } from "./pack-host";

export type ApplyItemOutcome =
  | { ok: true; warning?: string }
  | { ok: false; message: string };

/** Premiere ticks → seconds (same constant as Beta `getSecondsByTicks`). */
const TICKS_PER_SECOND = 254016000000;

const REASON_MESSAGES: Record<string, string> = {
  SOURCE_MISSING: "Item file is missing from the pack on disk.",
  NO_ACTIVE_SEQUENCE: "Open a sequence in Premiere Pro first, then try again.",
  IMPORT_FAILED: "The host application couldn't import this item.",
  PLACE_FAILED: "Imported into the project, but couldn't be placed on the timeline.",
  MOGRT_NOT_SUPPORTED_IN_AE: "This item's format (.mogrt) isn't supported in After Effects.",
  NO_SUPPORT_APP: "This pack doesn't support the current host application.",
  COMP: "Open a composition in After Effects first, then try again.",
  LAYER: "Select a layer in the active composition, then try again.",
  MISSING: "Preset or template file is missing from the pack.",
  MISSING_PRESETS: "Preset file is missing from the pack.",
  NO_MATCH: "Could not find a matching item in the project.",
  TEXT_LAYER: "Select a text layer in the active composition.",
};

function friendlyReason(reason: string): string {
  return REASON_MESSAGES[reason] || reason;
}

function durationSecondsForItem(item: PackTreeItem): number | undefined {
  const entry = item.group.preview?.[item.previewKey];
  const args = (entry?.custom_args as Record<string, unknown>) || {};
  const ticks = args.duration_ticks;
  if (typeof ticks === "number" && ticks > 0) {
    return ticks / TICKS_PER_SECOND;
  }
  if (typeof ticks === "string" && ticks.trim()) {
    const n = Number(ticks);
    if (Number.isFinite(n) && n > 0) return n / TICKS_PER_SECOND;
  }
  return undefined;
}

export function currentHostAppId(): HostAppId | null {
  const id = csi.hostEnvironment?.appId;
  if (id === "PPRO" || id === "AEFT") return id;
  return null;
}

/** Resolve + apply a pack item to the active project/sequence. */
export async function applyPackItemToHost(
  item: PackTreeItem,
  packFilePath: string,
  settings: PackSettings | null,
): Promise<ApplyItemOutcome> {
  const appId = currentHostAppId();
  if (!appId) {
    return { ok: false, message: "Open this panel inside Premiere Pro or After Effects." };
  }
  if (!packFilePath) {
    return { ok: false, message: "No pack loaded." };
  }

  const packHost = normalizePackHost(settings?.main?.software_id);
  const host = currentPackHost();
  if (host && packHost && packHost !== host) {
    return {
      ok: false,
      message: friendlyReason("NO_SUPPORT_APP"),
    };
  }

  let resolved;
  try {
    resolved = resolveItemSourceFile(item, packFilePath, appId, settings);
  } catch (e) {
    await reportSupportError("pack.resolve_item", e, { item: item.name });
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  if (!resolved || resolved.ctype === "UNSUPPORTED") {
    return { ok: false, message: "This item type isn't supported for direct apply yet." };
  }

  if (!fs.existsSync(resolved.file)) {
    const msg = `Source file not found: ${path.basename(resolved.file)}`;
    await reportSupportError("pack.apply_item", msg, {
      item: item.name,
      reason: "SOURCE_MISSING",
      ctype: resolved.ctype,
      file: path.basename(resolved.file),
    });
    return {
      ok: false,
      message: msg,
    };
  }

  const filePath = resolved.file;

  // Premiere FULL_PROJECT — native copy/paste chain (not simplified importFiles).
  if (appId === "PPRO" && resolved.ctype === "FULL_PROJECT") {
    try {
      const templatesDir = resolvePackTemplatesPath(packFilePath, "PPRO");
      const assetsPath = resolveFullProjectAssetsPath(templatesDir, item);
      const packName = settings?.main?.name || "Spunkram";
      const result = await applyFullProjectViaCopyPaste({
        projectPath: filePath,
        assetsPath,
        presetName: item.name,
        packName,
        groups: item.pathSegments,
        keepAudio: true,
      });
      if (!result.ok) {
        await reportSupportError("pack.apply_full_project", result.message, {
          item: item.name,
          ctype: "FULL_PROJECT",
        });
        return result;
      }
      return { ok: true };
    } catch (e) {
      await reportSupportError("pack.apply_full_project", e, { item: item.name });
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  // Host ctype: FULL_PROJECT never reaches here; AE PROJECT / MOGRT / media do.
  const ctype =
    resolved.ctype === "FULL_PROJECT" ? "PROJECT" : resolved.ctype;

  const previewEntry = item.group.preview?.[item.previewKey];
  const customArgs = (previewEntry?.custom_args as Record<string, unknown>) || {};
  const composerPayload =
    appId === "AEFT"
      ? {
          itemId: item.id,
          instanceGroup: item.pathSegments.join(INSTANCE_GROUP_JOIN_CHAR),
          argsObject: {
            ...(previewEntry || { name: item.name }),
            label_color_num:
              (previewEntry as Record<string, unknown> | undefined)?.label_color_num ?? 2,
            parent_folder:
              (previewEntry as Record<string, unknown> | undefined)?.parent_folder ?? false,
            change_auto_size_composition: customArgs.change_auto_size_composition,
            change_duplicate_origin_setting: customArgs.change_duplicate_origin_setting,
            change_use_start_timeline_pointer: customArgs.change_use_start_timeline_pointer,
            change_layer_index_position: customArgs.change_layer_index_position,
            is_audio: !!item.group.is_audio,
            is_footage: !!item.group.is_footage,
            is_presets: !!item.group.is_presets,
            individual_comp: !!customArgs.individual_comp,
            custom_args: customArgs,
          } as Record<string, unknown>,
          extraArguments: {
            filepath: filePath,
            last_group: item.pathSegments[item.pathSegments.length - 1] || item.name,
            name: item.name,
          },
          templatesDir: resolvePackTemplatesPath(packFilePath, "AEFT"),
          packName: settings?.main?.name || "Motionflow",
          packOptions: (settings?.inside_option_sets as Record<string, unknown>) || {},
        }
      : undefined;

  try {
    const wrapped = await Motionflow.applyPackItem({
      ctype: ctype as "PROJECT" | "MOGRT" | "AUDIO" | "FOOTAGE",
      filePath,
      itemName: item.name,
      binName: "Spunkram Assets",
      durationSeconds: durationSecondsForItem(item),
      composer: composerPayload,
    });

    if (!wrapped.ok) {
      await reportSupportError("pack.apply_item", wrapped.error, {
        item: item.name,
        ctype,
      });
      return { ok: false, message: wrapped.error };
    }

    const result = wrapped.data;
    if (!result || !result.applied) {
      const reason = result && !result.applied ? result.reason : "UNKNOWN_ERROR";
      const message = friendlyReason(reason);
      if (
        reason !== "NO_ACTIVE_SEQUENCE" &&
        reason !== "MOGRT_NOT_SUPPORTED_IN_AE"
      ) {
        await reportSupportError("pack.apply_item", message, {
          item: item.name,
          reason,
          ctype,
        });
      }
      return { ok: false, message };
    }
    return { ok: true };
  } catch (e) {
    await reportSupportError("pack.apply_item", e, { item: item.name, ctype });
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
