/**
 * Apply a pack item (transition/title/SFX/footage) to the host project.
 * Orchestration port of Spunkram Beta `applyItemPremiereProLikeAs` +
 * `prepareToApplyPremierePro` — decrypt (if needed) then hand off to the
 * ExtendScript `applyPackItem` (see `src/jsx/{ppro,aeft}/*-apply-item.ts`).
 */
import { csi, evalTS } from "./bolt";
import { fs, path } from "../cep/node";
import { resolveItemSourceFile, type HostAppId } from "./pack-apply-paths";
import { cleanupCacheFile, decodeBinAxFile, decodeMgAssetFile } from "./pack-protect";
import type { PackSettings, PackTreeItem } from "./pack-types";

export type ApplyItemOutcome = { ok: true } | { ok: false; message: string };

const REASON_MESSAGES: Record<string, string> = {
  SOURCE_MISSING: "Item file is missing from the pack on disk.",
  NO_ACTIVE_SEQUENCE: "Open a sequence in Premiere Pro first, then try again.",
  IMPORT_FAILED: "The host application couldn't import this item.",
  PLACE_FAILED: "Imported into the project, but couldn't be placed on the timeline.",
  MOGRT_NOT_SUPPORTED_IN_AE: "This item's format (.mogrt) isn't supported in After Effects.",
};

function friendlyReason(reason: string): string {
  return REASON_MESSAGES[reason] || reason;
}

export function currentHostAppId(): HostAppId | null {
  const id = csi.hostEnvironment?.appId;
  if (id === "PPRO" || id === "AEFT") return id;
  return null;
}

/** Resolve + decrypt (if needed) + apply a pack item to the active project/sequence. */
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

  let resolved;
  try {
    resolved = resolveItemSourceFile(item, packFilePath, appId, settings);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  if (!resolved || resolved.ctype === "UNSUPPORTED") {
    return { ok: false, message: "This item type isn't supported for direct apply yet." };
  }

  if (!fs.existsSync(resolved.file)) {
    return {
      ok: false,
      message: `Source file not found: ${path.basename(resolved.file)}`,
    };
  }

  let filePath = resolved.file;
  let decodedCachePath: string | null = null;
  try {
    if (resolved.encrypted === "BIN_AX") {
      filePath = decodeBinAxFile(resolved.file, resolved.cacheName);
      decodedCachePath = filePath;
    } else if (resolved.encrypted === "MG_ASSET") {
      filePath = decodeMgAssetFile(resolved.file, resolved.cacheName);
      decodedCachePath = filePath;
    }
  } catch (e) {
    return {
      ok: false,
      message: `Couldn't decode item file: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // FULL_PROJECT is imported the same way as PROJECT once resolved/decrypted.
  const ctype = resolved.ctype === "FULL_PROJECT" ? "PROJECT" : resolved.ctype;

  try {
    const result = await evalTS("applyPackItem", {
      ctype,
      filePath,
      itemName: item.name,
      binName: "Spunkram Assets",
    });
    cleanupCacheFile(decodedCachePath);

    if (!result || !result.applied) {
      const reason = result && !result.applied ? result.reason : "UNKNOWN_ERROR";
      return { ok: false, message: friendlyReason(reason) };
    }
    return { ok: true };
  } catch (e) {
    cleanupCacheFile(decodedCachePath);
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
