import type { MotionflowPurchase } from "@/api/motionflow-auth";
import type { CepMarketPayload } from "@/api/cep-market";
import { catalogItemIsFree } from "./pack-entitlement";

/** Local Spunkram tiers an admin can pretend to be. Empty prefs value means live `/me`. */
export const SPUNKRAM_DEV_PLANS = ["free", "purchased", "subscribed"] as const;

export type SpunkramDevPlan = (typeof SPUNKRAM_DEV_PLANS)[number];

export function isSpunkramDevPlan(value: string | null | undefined): value is SpunkramDevPlan {
  return value === "free" || value === "purchased" || value === "subscribed";
}

export function spunkramDevPlanLabel(plan: SpunkramDevPlan): string {
  if (plan === "purchased") return "Purchased";
  if (plan === "subscribed") return "Subscribed";
  return "Free";
}

const DEV_PURCHASE: MotionflowPurchase = {
  id: "dev-purchased",
  name: "Purchased pack",
  product_type: "pack",
};

type DevStatus = {
  subscribed: boolean;
  plan?: string;
  status?: string;
  purchases: MotionflowPurchase[];
  tier?: string;
  aiGenerationsLimit?: number;
  renews_at?: string;
};

/** Admin-only local override of `/me` so Spunkram can be tested as free, purchased, or subscribed. */
export function applySpunkramAdminDevPlan<T extends DevStatus>(
  status: T,
  plan: string | null | undefined,
): T {
  if (!isSpunkramDevPlan(plan)) return status;
  if (plan === "subscribed") {
    const serverLimit = status.aiGenerationsLimit;
    return {
      ...status,
      subscribed: true,
      plan: status.plan && status.plan !== "free" ? status.plan : "Creator",
      status: "active",
      tier: "subscribed",
      aiGenerationsLimit:
        typeof serverLimit === "number" && serverLimit > 0 ? serverLimit : 100,
    };
  }
  if (plan === "purchased") {
    return {
      ...status,
      subscribed: false,
      plan: "Purchased",
      status: "inactive",
      tier: "purchased",
      purchases: status.purchases.length > 0 ? status.purchases : [DEV_PURCHASE],
      aiGenerationsLimit: 0,
      renews_at: undefined,
    };
  }
  return {
    ...status,
    subscribed: false,
    plan: "Free",
    status: "inactive",
    tier: "free",
    purchases: [],
    aiGenerationsLimit: 0,
    renews_at: undefined,
  };
}

/** Keep catalog rights in sync with the simulated account, including disk scans. */
export function applySpunkramAdminDevMarket(
  market: CepMarketPayload | null,
  plan: string | null | undefined,
): CepMarketPayload | null {
  if (!market || !isSpunkramDevPlan(plan)) return market;
  const subscribed = plan === "subscribed";
  return {
    ...market,
    subscription_active: subscribed,
    Packages: market.Packages?.map((item) => {
      const owned = plan !== "free" && Boolean(item.owned);
      const free = catalogItemIsFree(item);
      return {
        ...item,
        owned,
        covered_by_subscription: subscribed,
        action: free ? "get_free" : owned || subscribed ? "install" : "buy",
      };
    }),
  };
}
