import { normalizePackHost } from "./pack-host";
/** Legacy Gal Toolkit marketplace item ids (PR / AE). */
export const GAL_TOOLKIT_MARKET_IDS = new Set(["1102", "813"]);
const TOOLKIT_NAME_RE = /gal\s*toolkit/i;
const MAX_NAME_RE = /max/i;
export function hasGalToolkitPurchase(purchases, host) {
    if (!host || !Array.isArray(purchases) || purchases.length === 0)
        return false;
    const want = normalizePackHost(host);
    if (!want)
        return false;
    return purchases.some((p) => {
        const purchaseHost = p.primary_type
            ? normalizePackHost(p.primary_type)
            : null;
        if (purchaseHost && purchaseHost !== want)
            return false;
        const id = String(p.id ?? "").trim();
        if (id && GAL_TOOLKIT_MARKET_IDS.has(id))
            return true;
        const name = (p.name || "").trim();
        if (!name)
            return false;
        return TOOLKIT_NAME_RE.test(name) && !MAX_NAME_RE.test(name);
    });
}
export function resolveGalAccountPlan(opts) {
    if (opts.subscribed)
        return "max";
    if (hasGalToolkitPurchase(opts.purchases, opts.host))
        return "toolkit";
    return "free";
}
export function galAccountPlanLabel(plan) {
    switch (plan) {
        case "max":
            return "MAX";
        case "toolkit":
            return "Regular";
        default:
            return "Free";
    }
}
export const GAL_DEV_PLANS = ["free", "toolkit", "max"];
export function isGalAccountPlan(value) {
    return value === "free" || value === "toolkit" || value === "max";
}
function toolkitPurchaseForHost(host) {
    return {
        id: host === "PR" ? "1102" : "813",
        name: "Gal Toolkit",
        product_type: "pack",
        primary_type: host,
    };
}
function withoutToolkitPurchases(purchases) {
    return purchases.filter((p) => {
        const id = String(p.id ?? "").trim();
        if (id && GAL_TOOLKIT_MARKET_IDS.has(id))
            return false;
        const name = (p.name || "").trim();
        return !(name && TOOLKIT_NAME_RE.test(name) && !MAX_NAME_RE.test(name));
    });
}
function withToolkitPurchase(purchases, host) {
    const hosts = host ? [host] : ["AE", "PR"];
    let next = withoutToolkitPurchases(purchases);
    for (const h of hosts) {
        if (!hasGalToolkitPurchase(next, h)) {
            next = [...next, toolkitPurchaseForHost(h)];
        }
    }
    return next;
}
/** Admin-only local override of /me subscription for CEP plan testing. */
export function applyAdminDevPlan(status, plan, host) {
    if (!isGalAccountPlan(plan))
        return status;
    if (plan === "max") {
        return {
            ...status,
            subscribed: true,
            plan: "max",
            status: "active",
            tier: "subscribed",
        };
    }
    return {
        ...status,
        subscribed: false,
        plan,
        status: "inactive",
        tier: "free",
        purchases: plan === "toolkit"
            ? withToolkitPurchase(status.purchases, host)
            : withoutToolkitPurchases(status.purchases),
    };
}
/**
 * Catalog `plan` tags that unlock a given account plan.
 * JSON uses `demo` for the free tier (not `free`).
 */
const ITEM_PLAN_ALIASES = {
    free: ["free", "demo"],
    toolkit: ["toolkit"],
    max: ["max"],
};
/**
 * Max unlocks everything. Free/Toolkit need `item.plan` to include that key
 * (`demo` counts as Free). Empty/missing item plan → Max-only.
 */
export function itemUnlockedForGalPlan(itemPlan, accountPlan) {
    if (accountPlan === "max")
        return true;
    const plans = Array.isArray(itemPlan) ? itemPlan : [];
    if (plans.length === 0)
        return false;
    return ITEM_PLAN_ALIASES[accountPlan].some((key) => plans.includes(key));
}
