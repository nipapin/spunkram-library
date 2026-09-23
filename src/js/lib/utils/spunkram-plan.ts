import type { MotionflowPurchase } from "@/api/motionflow-auth";

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
  };
}
