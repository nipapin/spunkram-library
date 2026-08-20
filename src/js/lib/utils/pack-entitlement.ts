/**
 * Pack access checks — subscription, market catalog, and /me purchases.
 * Used when registering packs from disk and when gating Apply in Editing.
 */
import type { MotionflowPurchase } from "@/api/motionflow-auth";
import type { CepMarketPackage } from "@/api/cep-market";
import type { InstalledPackMeta } from "./pack-types";
import { normalizePackHost } from "./pack-host";

/** Collapse "Wedding Pack" / "Wedding Package for Premiere Pro" → "wedding". */
function normalizePackLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/for\s+(premiere\s*pro|after\s*effects)/g, " ")
    .replace(/\b(packages?|packs?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function packNamesMatch(a: string, b: string): boolean {
  const left = (a || "").trim().toLowerCase();
  const right = (b || "").trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;

  const leftNorm = normalizePackLabel(a);
  const rightNorm = normalizePackLabel(b);
  if (!leftNorm || !rightNorm) return false;
  return (
    leftNorm === rightNorm ||
    leftNorm.includes(rightNorm) ||
    rightNorm.includes(leftNorm)
  );
}

/** Match a local install to a market catalog row (marketId, then name + host). */
export function installedPackMatchesMarketItem(
  meta: InstalledPackMeta,
  item: CepMarketPackage,
): boolean {
  if (meta.marketId != null && String(meta.marketId) === String(item.id)) {
    return true;
  }

  const metaApp = normalizePackHost(meta.appID || meta.load || "");
  const itemApp = normalizePackHost(item.primary_type || "");
  if (metaApp && itemApp && metaApp !== itemApp) return false;

  const installedName = (meta.name || "").trim();
  if (!installedName) return false;

  const catalogNames = [item.pack_name, item.name].filter(Boolean) as string[];
  if (catalogNames.some((n) => packNamesMatch(installedName, n))) return true;

  const installedNorm = normalizePackLabel(installedName);
  if (!installedNorm) return false;
  return catalogNames.some((n) => {
    const catalogNorm = normalizePackLabel(n);
    if (!catalogNorm) return false;
    return (
      catalogNorm === installedNorm ||
      catalogNorm.includes(installedNorm) ||
      installedNorm.includes(catalogNorm)
    );
  });
}

export function findMarketItemForPack(
  meta: InstalledPackMeta,
  catalog: CepMarketPackage[],
): CepMarketPackage | undefined {
  return catalog.find((item) => installedPackMatchesMarketItem(meta, item));
}

function purchaseMatchesPack(
  purchase: MotionflowPurchase,
  meta: InstalledPackMeta,
): boolean {
  if (meta.marketId && String(purchase.id) === String(meta.marketId)) {
    return true;
  }

  const metaHost = normalizePackHost(meta.appID || meta.load || "");
  const purchaseHost = purchase.primary_type
    ? normalizePackHost(purchase.primary_type)
    : null;
  if (metaHost && purchaseHost && metaHost !== purchaseHost) return false;

  const purchaseName = purchase.name || "";
  const metaName = meta.name || "";
  if (!purchaseName || !metaName) return false;
  return packNamesMatch(metaName, purchaseName);
}

export type PackEntitlementContext = {
  signedIn: boolean;
  subscriptionActive: boolean;
  purchases: MotionflowPurchase[];
  catalog: CepMarketPackage[];
};

export function buildPackEntitlementContext(opts: {
  signedIn: boolean;
  subscriptionActive: boolean;
  purchases: MotionflowPurchase[];
  catalog: CepMarketPackage[];
}): PackEntitlementContext {
  return {
    signedIn: opts.signedIn,
    subscriptionActive: Boolean(opts.subscriptionActive),
    purchases: Array.isArray(opts.purchases) ? opts.purchases : [],
    catalog: Array.isArray(opts.catalog) ? opts.catalog : [],
  };
}

function catalogItemIsFree(item: CepMarketPackage): boolean {
  const action = (item.action || "").toLowerCase();
  if (action === "get_free") return true;
  const price =
    typeof item.custom_price === "number"
      ? item.custom_price
      : Number(item.custom_price) || 0;
  return price <= 0 && action !== "buy";
}

/**
 * True when the signed-in account may use this pack (disk scan + Apply gate).
 * Unknown packs (not in catalog) are denied unless covered by subscription.
 */
export function isPackEntitled(
  meta: InstalledPackMeta,
  ctx: PackEntitlementContext | null | undefined,
): boolean {
  if (!ctx?.signedIn) return false;
  if (ctx.subscriptionActive) return true;

  const item = findMarketItemForPack(meta, ctx.catalog);
  if (item) {
    if (item.owned || item.covered_by_subscription) return true;
    if (catalogItemIsFree(item)) return true;
  }

  if (ctx.purchases.some((p) => purchaseMatchesPack(p, meta))) return true;

  return false;
}
