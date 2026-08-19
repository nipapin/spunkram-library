/**
 * Motionflow access tiers — numeric limits come from GET /api/cep/me (`entitlements`).
 * CEP must not hardcode generation or free-pack slot counts (server can change without a release).
 */
export type MotionflowAccessTier = "free" | "purchased" | "subscribed";

/** @deprecated use MotionflowAccessTier */
export type SpunkramAccessTier = MotionflowAccessTier;

export function resolveAccessTier(opts: {
  tier?: string | null;
  subscribed: boolean;
  purchaseCount: number;
}): MotionflowAccessTier {
  const t = (opts.tier || "").toLowerCase();
  if (t === "subscribed" || t === "purchased" || t === "free") return t;
  if (opts.subscribed) return "subscribed";
  if (opts.purchaseCount > 0) return "purchased";
  return "free";
}

/** Monthly AI generation cap from `entitlements.ai_generations_limit` only. */
export function resolveGenerationLimit(serverLimit?: number | null): number | null {
  if (typeof serverLimit !== "number" || !Number.isFinite(serverLimit) || serverLimit <= 0) {
    return null;
  }
  return Math.floor(serverLimit);
}

/** Free pack install slots from `entitlements.free_pack_slots` only. */
export function resolveFreePackSlots(serverSlots?: number | null): number | null {
  if (typeof serverSlots !== "number" || !Number.isFinite(serverSlots) || serverSlots < 0) {
    return null;
  }
  return Math.floor(serverSlots);
}
