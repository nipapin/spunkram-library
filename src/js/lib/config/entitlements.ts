/**
 * Spunkram access tiers — values come from GET /api/cep/me (server-owned).
 * Local defaults only apply when the API omits entitlements (mock / legacy).
 *
 * Generations / month:
 * - no subscription → 5
 * - Editor (library) → 10
 * - Editor AI → 100
 */
export const SPUNKRAM_FREE_TIER = {
  generations: 5,
  freePackCount: 1,
} as const;

export const SPUNKRAM_EDITOR_TIER = {
  generations: 10,
} as const;

export const SPUNKRAM_EDITOR_AI_TIER = {
  generations: 100,
} as const;

/** @deprecated alias — Editor AI quota */
export const SPUNKRAM_SUBSCRIBED_TIER = SPUNKRAM_EDITOR_AI_TIER;

export type SpunkramAccessTier = "free" | "purchased" | "subscribed";

export function resolveAccessTier(opts: {
  tier?: string | null;
  subscribed: boolean;
  purchaseCount: number;
}): SpunkramAccessTier {
  const t = (opts.tier || "").toLowerCase();
  if (t === "subscribed" || t === "purchased" || t === "free") return t;
  if (opts.subscribed) return "subscribed";
  if (opts.purchaseCount > 0) return "purchased";
  return "free";
}

/** Infer Editor vs Editor AI from subscription plan label when server limit missing. */
export function generationLimitFromPlanLabel(plan?: string | null): number | null {
  if (!plan) return null;
  const blob = plan.toLowerCase();
  if (
    blob.includes("ai_toolkit") ||
    blob.includes("ai toolkit") ||
    /editor\s*ai/.test(blob) ||
    blob.includes("editor+ai")
  ) {
    return SPUNKRAM_EDITOR_AI_TIER.generations;
  }
  if (blob.includes("library") || /(^|[^a-z])editor([^a-z]|$)/.test(blob)) {
    return SPUNKRAM_EDITOR_TIER.generations;
  }
  return null;
}

export function generationLimitForTier(
  tier: SpunkramAccessTier,
  serverLimit?: number | null,
  planLabel?: string | null,
): number {
  if (typeof serverLimit === "number" && serverLimit > 0) return serverLimit;
  if (tier === "subscribed") {
    return (
      generationLimitFromPlanLabel(planLabel) ?? SPUNKRAM_EDITOR_AI_TIER.generations
    );
  }
  return SPUNKRAM_FREE_TIER.generations;
}
