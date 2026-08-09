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
import { MotionFlow } from "@/sdk";
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
import { reportSupportError } from "@/api/support";
import { currentPackHost, normalizePackHost } from "./pack-host";

export type ApplyItemOutcome =
  | { ok: true; warning?: string }
  | { ok: false; message: string };

const REASON_MESSAGES: Record<string, string> = {
  SOURCE_MISSING: "Item file is missing from the pack on disk.",
  NO_ACTIVE_SEQUENCE: "Open a sequence in Premiere Pro first, then try again.",
  IMPORT_FAILED: "The host application couldn't import this item.",
  PLACE_FAILED: "Imported into the project, but couldn't be placed on the timeline.",
  MOGRT_NOT_SUPPORTED_IN_AE: "This item's format (.mogrt) isn't supported in After Effects.",
  NO_SUPPORT_APP: "This pack doesn't support the current host application.",
};

function friendlyReason(reason: string): string {
  return REASON_MESSAGES[reason] || reason;
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

  try {
    const wrapped = await MotionFlow.applyPackItem({
      ctype: ctype as "PROJECT" | "MOGRT" | "AUDIO" | "FOOTAGE",
      filePath,
      itemName: item.name,
      binName: "Spunkram Assets",
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
