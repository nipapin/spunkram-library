import type { CepMarketPackage } from "@/api/cep-market";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";
import { normalizePackHost } from "@/lib/utils/pack-host";

export function isOdinDemo(pack: { version?: string }): boolean {
  return pack.version?.trim().toUpperCase() === "DEMO";
}

export function selectOdinPackage(
  packages: CepMarketPackage[],
  host: "AE" | "PR",
  subscribed: boolean,
) {
  const candidates = packages.filter(
    (pack) =>
      normalizePackHost(pack.primary_type) === host &&
      isOdinDemo(pack) === !subscribed,
  );
  // Never silently choose another host, edition, or one of several ambiguous packs.
  return candidates.length === 1 ? candidates[0] : null;
}

export function matchesOdinInstall(
  meta: InstalledPackMeta,
  pack: CepMarketPackage,
): boolean {
  if (
    normalizePackHost(meta.appID || meta.load) !==
      normalizePackHost(pack.primary_type) ||
    isOdinDemo(meta) !== isOdinDemo(pack)
  )
    return false;
  if (meta.marketId) return String(meta.marketId) === String(pack.id);
  return [pack.pack_name, pack.name].some(
    (name) => name?.trim().toLowerCase() === meta.name.trim().toLowerCase(),
  );
}
