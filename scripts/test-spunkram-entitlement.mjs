import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(file, imports, globals = {}) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", ...Object.keys(globals), code)(
    (name) => {
      if (!(name in imports)) throw Error("Unexpected import " + name);
      return imports[name];
    }, mod.exports, mod, ...Object.values(globals),
  );
  return mod.exports;
}
const brand = { BRAND: { id: "spunkram", apiClient: "spunkram" }, storageKey: key => key };
const hosts = load("src/js/lib/utils/pack-host.ts", { "./bolt": {}, "@brands": brand });
const access = load("src/js/lib/utils/pack-entitlement.ts", {
  "./pack-host": hosts, "@brands": brand,
});
const plans = load("src/js/lib/utils/spunkram-plan.ts", { "./pack-entitlement": access });
const meta = name => ({ name, appID: "AE", path: name + ".spunkram", version: "1.0" });
const row = (id, name, extra = {}) => ({
  id, name, pack_name: name, primary_type: "AE", image_url: "", custom_price: 49,
  action: "install", covered_by_subscription: true, ...extra,
});
const market = {
  subscription_active: true,
  Packages: [row(1, "Premium"), row(2, "Owned", { owned: true }),
    row(3, "Freebie", { custom_price: 0, action: "get_free" })],
};
const liveStatus = {
  subscribed: true, purchases: [{ id: 2, name: "Owned" }],
  renews_at: "2027-08-02T00:00:00Z",
};
function context(plan) {
  const status = plans.applySpunkramAdminDevPlan(liveStatus, plan);
  const catalog = plans.applySpunkramAdminDevMarket(market, plan);
  return access.buildPackEntitlementContext({
    signedIn: true, subscriptionActive: status.subscribed,
    purchases: status.purchases, catalog: catalog.Packages,
  });
}
test("Free immediately revokes real catalog ownership and subscription rights", () => {
  const ctx = context("free");
  for (const name of ["Premium", "Owned", "Stories", "Wedding"]) {
    assert.equal(access.isPackEntitled(meta(name), ctx), false, name);
  }
  assert.equal(access.isPackEntitled(meta("Freebie"), ctx), true);
  const free = plans.applySpunkramAdminDevMarket(market, "free");
  assert.equal(free.subscription_active, false);
  assert.deepEqual(free.Packages.map(p => p.action), ["buy", "buy", "get_free"]);
  assert.equal(plans.applySpunkramAdminDevPlan(liveStatus, "free").renews_at, undefined);
  assert.equal(market.Packages[1].owned, true, "the live snapshot remains intact");
});
test("Purchased retains owned packs; Subscribed covers packs outside Market", () => {
  const purchased = context("purchased");
  assert.equal(access.isPackEntitled(meta("Owned"), purchased), true);
  assert.equal(access.isPackEntitled(meta("Premium"), purchased), false);
  assert.equal(access.isPackEntitled(meta("Wedding"), purchased), false);
  for (const name of ["Premium", "Stories", "Wedding"]) {
    assert.equal(access.isPackEntitled(meta(name), context("subscribed")), true);
  }
  assert.equal(plans.applySpunkramAdminDevMarket(market, "").subscription_active, true);
  assert.equal(plans.applySpunkramAdminDevMarket(market, ""), market);
});
test("expiry revokes subscription-only packs even with a stale catalog", () => {
  const ctx = { ...context(""), subscriptionActive: false };
  assert.equal(access.isPackEntitled(meta("Premium"), ctx), false);
  assert.equal(access.isPackEntitled(meta("Owned"), ctx), true);
  assert.equal(access.isPackEntitled(meta("Stories"), ctx), false);
  assert.equal(access.isPackEntitled(meta("Freebie"), ctx), true);
  assert.equal(access.isPackEntitled(meta("Owned"), { ...ctx, signedIn: false }), false);
  assert.equal(access.isPackEntitled(meta("Wedding"), {
    ...ctx, purchases: [{ id: 99, name: "Wedding Pack", primary_type: "AE" }],
  }), true, "a separate purchase survives expiry even outside Market");
});
test("an install action or a missing/invalid price cannot turn a paid pack into a free one", () => {
  for (const price of [undefined, null, NaN, "invalid"]) {
    const ctx = { signedIn: true, subscriptionActive: false, purchases: [],
      catalog: [row(1, "Premium", { custom_price: price })] };
    assert.equal(access.isPackEntitled(meta("Premium"), ctx), false);
  }
});

function apiFixture(plan = "free", admin = true) {
  return load("src/js/api/cep-market.ts", {
    "./config": { API_BASE: "https://example.test", apiUrl: p => p },
    "@/lib/api/cep-http": { cepHttpRequest: async () => ({ ok: true, text: JSON.stringify(market) }) },
    "@/lib/api/session": { getSessionToken: () => "token", sessionAuthHeaders: () => ({}) },
    "@/lib/utils/bolt": {}, "@/lib/cep/node": {},
    "@/lib/api/preferences": {
      readActiveMotionflowAuth: () => ({ email: admin ? "admin" : "customer" }),
      readPrefSettings: () => ({ adminDevPlan: plan }),
    },
    "@/utils/download-file": {}, "@/utils/user-error": {},
    "@/lib/utils/pack-install": {}, "@/lib/utils/pack-host": hosts,
    "@/lib/utils/pack-fonts": {}, "@/lib/utils/pack-zip": {},
    "@/lib/utils/pack-manifest": {}, "../../shared/shared": {},
    "@brands": brand, "./update": { isReleaseAdminEmail: email => email === "admin" },
    "@/lib/utils/spunkram-plan": plans, "@/lib/utils/pack-entitlement": access,
  });
}
test("disk scans honor Free instead of restoring rights from the real subscription", async () => {
  const api = apiFixture();
  const ctx = await api.resolvePackEntitlementContextForScan({ signedIn: true, purchases: liveStatus.purchases });
  assert.equal(ctx.subscriptionActive, false);
  assert.deepEqual(ctx.purchases, []);
  for (const name of ["Premium", "Owned", "Stories", "Wedding"]) {
    assert.equal(access.isPackEntitled(meta(name), ctx), false, name);
  }
  assert.equal(access.isPackEntitled(meta("Freebie"), ctx), true);
});
test("Live and non-admin scans keep server permissions", async () => {
  for (const api of [apiFixture(""), apiFixture("free", false)]) {
    const ctx = await api.resolvePackEntitlementContextForScan({ signedIn: true, purchases: [] });
    assert.equal(ctx.subscriptionActive, true);
    assert.equal(access.isPackEntitled(meta("Wedding"), ctx), true);
  }
});
test("normalization preserves a missing price for entitlement checks", async () => {
  const api = apiFixture();
  market.Packages.push(row(4, "UnknownPrice", { custom_price: undefined }));
  try {
    const { data } = await api.fetchCepMarket("AE");
    const ctx = { signedIn: true, subscriptionActive: false, purchases: [], catalog: data.Packages };
    assert.equal(access.isPackEntitled(meta("UnknownPrice"), ctx), false);
  } finally { market.Packages.pop(); }
});
test("an open panel rechecks on focus, once a minute and at expiry; cleanup cancels checks", async () => {
  const timers = new Map(), listeners = new Map();
  let nextId = 0, calls = 0, finish;
  const window = {
    setInterval: (callback, delay) => { timers.set(++nextId, { callback, delay, interval: true }); return nextId; },
    setTimeout: (callback, delay) => { timers.set(++nextId, { callback, delay }); return nextId; },
    clearInterval: id => timers.delete(id), clearTimeout: id => timers.delete(id),
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event),
  };
  const { watchSubscriptionChanges } = load("src/js/lib/utils/watch-subscription-changes.ts", {}, { window });
  const stop = watchSubscriptionChanges(() => { calls++; return new Promise(resolve => { finish = resolve; }); },
    new Date(Date.now() + 5000).toISOString());
  const expiry = [...timers.values()].find(t => !t.interval);
  const poll = [...timers.values()].find(t => t.interval);
  assert.equal(poll.delay, 60_000);
  assert.ok(expiry.delay > 4000 && expiry.delay <= 6000);
  listeners.get("focus")();
  poll.callback();
  assert.equal(calls, 1, "overlapping checks are coalesced");
  finish(); await new Promise(setImmediate);
  expiry.callback();
  assert.equal(calls, 2);
  finish(); await new Promise(setImmediate);
  poll.callback();
  assert.equal(calls, 3);
  finish(); await new Promise(setImmediate);
  stop();
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
  poll.callback();
  assert.equal(calls, 3);
});
