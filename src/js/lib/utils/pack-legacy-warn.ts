/**
 * Soft-legacy warnings for AtomX-era encrypted packs.
 * Decode still works; users are nudged to reinstall plaintext packs from Market.
 */
import * as panelStore from "@/lib/userdata-store";

const WARNED_KEY = "spunkram.legacyEncryptedPackWarned";

export const LEGACY_ENCRYPTED_PACK_MESSAGE =
  "This pack uses a legacy encrypted format. Remove it and Install again from Market for the updated version.";

/** Returns true the first time we should surface the reinstall CTA this session/store. */
export function consumeLegacyEncryptedPackWarning(): boolean {
  try {
    if (panelStore.getItem(WARNED_KEY) === "1") return false;
    panelStore.setItem(WARNED_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

export function noteLegacyEncryptedPack(): string | null {
  if (!consumeLegacyEncryptedPackWarning()) return null;
  return LEGACY_ENCRYPTED_PACK_MESSAGE;
}
