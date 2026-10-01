import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(file, imports, globals = {}) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8")
    .replaceAll("import.meta.env.DEV", globals.__DEV__ ? "true" : "false");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", ...Object.keys(globals), code)(
    (name) => {
      if (!(name in imports)) throw Error("Unexpected import " + name);
      return imports[name];
    },
    mod.exports,
    mod,
    ...Object.values(globals),
  );
  return mod.exports;
}
const hosts = load("src/js/lib/utils/pack-host.ts", {
  "./bolt": {},
  "@brands": { storageKey: (key) => key },
});
const selection = load("src/js/ui/odin/odin-package-selection.ts", {
  "@/lib/utils/pack-host": hosts,
});
const entitlement = load("src/js/lib/utils/pack-entitlement.ts", {
  "./pack-host": hosts,
  "@brands": { BRAND: { id: "odin" } },
});
const pack = (host, demo) => ({
  id: host + (demo ? "-demo" : "-full"),
  name: "Odin Pro",
  pack_name: "Odin Pro",
  version: demo ? "DEMO" : "1.0",
  primary_type: host,
  image_url: "",
  action: demo ? "get_free" : "buy",
  install_url: "/download/" + host,
});
const catalog = [
  pack("AE", true),
  pack("PR", true),
  pack("AE", false),
  pack("PR", false),
];
test("CEP requests accept the current brand's login token and reject foreign sessions", () => {
  for (const brand of ["odin", "gal", "spunkram"]) {
    let token = "";
    const session = load("src/js/lib/api/session.ts", {
      "@brands": { BRAND: { id: brand } },
      "@/lib/api/preferences": { readActiveMotionflowAuth: () => ({ token }) },
      "@/api/user": {},
      "@/lib/api/shared-auth-session": {},
    });
    const prefix = brand === "odin" ? "odincep_" : "mfcep_";
    token = prefix + "a".repeat(64);
    assert.equal(session.getSessionToken(), token);
    assert.equal(session.requireSessionToken(), token);
    assert.equal(session.sessionAuthHeaders().Authorization, "Bearer " + token);
    token = "  " + token + "  ";
    assert.equal(session.getSessionToken(), token.trim());
    for (token of ["", "legacy-token", (brand === "odin" ? "mfcep_" : "odincep_") + "b".repeat(64)]) {
      assert.equal(session.getSessionToken(), null);
      assert.equal(session.sessionAuthHeaders().Authorization, undefined);
      assert.throws(() => session.requireSessionToken(), /UNAUTHORIZED/);
    }
  }
});
test("Odin hands media to Premiere and applies project drops only outside the panel", () => {
  const listeners = new Map();
  const drag = load("src/js/lib/utils/cep-file-drag.ts", {
    "@brands": { BRAND: { id: "odin" } },
    "../cep/node": { os: { platform: () => "win32" } },
  }, {
    window: {
      innerWidth: 600, innerHeight: 700,
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: type => listeners.delete(type),
    },
    document: { documentElement: { appendChild: () => {} } },
    Image: class { style = {}; },
  });
  assert.equal(drag.cepHostFileDragEnabled, true);
  const data = new Map();
  const transfer = { setData: (type, value) => data.set(type, value), setDragImage: () => {} };
  const start = { dataTransfer: transfer };
  const outside = { dataTransfer: transfer, clientX: 800, clientY: 500 };
  assert.equal(drag.beginHostFileDrag(start, "C:/Odin/Assets/SFX.wav"), true);
  assert.equal(data.get("com.adobe.cep.dnd.file.0"), "C:\\Odin\\Assets\\SFX.wav");
  assert.equal(transfer.effectAllowed, "copy");
  assert.equal(drag.finishHostDrag(outside), null); // Native media must not be inserted twice.
  drag.beginPlaceholderDrag(start, "C:/Temp/Spunkram-Drop.png");
  assert.equal(drag.finishHostDrag(outside), "placeholder");
  assert.equal(listeners.size, 0);
  drag.beginPlaceholderDrag(start, "C:/Temp/Spunkram-Drop.png");
  listeners.get("keydown")({ key: "Escape" });
  assert.equal(drag.finishHostDrag(outside), null);
  drag.beginPlaceholderDrag(start, "C:/Temp/Spunkram-Drop.png");
  listeners.get("drop")();
  assert.equal(drag.finishHostDrag(outside), null);
  drag.beginPlaceholderDrag(start, "C:/Temp/Spunkram-Drop.png");
  assert.equal(drag.finishHostDrag({ ...start, clientX: 100, clientY: 100 }), null);
});
test("reads uploaded Odin JSON trees, including the nested Premiere demo export", () => {
  let raw;
  const parser = load("src/js/lib/utils/pack.ts", {
    "../cep/node": { fs: { existsSync: () => true, readFile: () => {}, readFileSync: () => raw } },
    "../api/preferences": {},
    "./pack-folders": {},
    "./pack-types": { PACKAGE_FILETYPES: ["odin"] },
    "./pack-host": hosts,
  });
  const settings = { main: { name: "Odin Pro", version: "DEMO", software_id: "PR" } };
  const structure = { Transitions: { preview: { "ZOOM BAS 01": { enabled: true } } } };
  for (const key of ["structure", "contents", "content", "settings.contents"]) {
    const body = key === "settings.contents"
      ? { settings: { ...settings, contents: structure } }
      : { settings, [key]: structure };
    raw = Buffer.from("\uFEFF" + JSON.stringify(body));
    const parsed = parser.initPackageSync("demo.odin");
    assert.deepEqual(parsed.structure, structure);
    assert.equal(parsed.settings.main.software_id, "PR");
  }
  for (raw of ["null", "BIN_AX\u0000not-json", JSON.stringify({ settings })]) {
    assert.throws(() => parser.initPackageSync("demo.odin"), /CORRUPTED_PACK/);
  }
});
test("setup fills the panel, exposes progress, and cannot be dismissed with Escape", () => {
  const panel = load("src/js/ui/odin/OdinPackagePanel.tsx", {
    react: { useRef: () => ({ current: null }), useEffect: () => {} },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "lucide-react": { Loader2: "loader-icon", RefreshCw: "retry-icon" },
    "@/assets/odin.webp": "odin.webp",
  }).OdinPackagePanel;
  const model = { hostLabel: "After Effects", isDemo: false, progress: 47, phase: "downloading", busy: true };
  const screen = panel({ model, fullscreen: true });
  assert.equal(screen.props.className, "odin-provision");
  assert.equal(screen.props.role, "dialog");
  assert.equal(screen.props["aria-modal"], true);
  let prevented = false, stopped = false;
  screen.props.onKeyDown({ key: "Escape", preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });
  assert.ok(prevented && stopped);
  const nodes = [];
  function collect(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(collect);
    nodes.push(node);
    collect(node.props?.children);
  }
  collect(screen);
  assert.equal(nodes.find(n => n.type === "progress").props.value, 47);
  assert.equal(nodes.filter(n => n.type === "button").length, 0);
  assert.equal(nodes.some(n => /Cancel|Close|Minimize/.test(n.props?.["aria-label"] || "")), false);
});
test("chooses only the current host and account edition", () => {
  for (const host of ["AE", "PR"])
    for (const subscribed of [false, true])
      assert.equal(
        selection.selectOdinPackage(catalog, host, subscribed).id,
        host + (subscribed ? "-full" : "-demo"),
      );
});
test("missing or ambiguous editions never fall back to a paid or foreign pack", () => {
  assert.equal(
    selection.selectOdinPackage(
      [pack("AE", false), pack("PR", true)],
      "AE",
      false,
    ),
    null,
  );
  assert.equal(
    selection.selectOdinPackage(
      [pack("AE", true), pack("AE", true)],
      "AE",
      false,
    ),
    null,
  );
});
test("Demo and full installations with the same name cannot share entitlement", () => {
  const demo = {
    name: "Odin Pro",
    author: "Premiere Basics",
    path: "demo.odin",
    appID: "AE",
    version: "DEMO",
  };
  const full = { ...demo, path: "full.odin", version: "1.0" };
  const ctx = {
    signedIn: true,
    subscriptionActive: false,
    purchases: [],
    catalog,
  };
  assert.equal(entitlement.isPackEntitled(demo, ctx), true);
  assert.equal(entitlement.isPackEntitled(full, ctx), false);
  assert.equal(selection.matchesOdinInstall(full, pack("AE", true)), false);
  assert.equal(
    selection.matchesOdinInstall({ ...demo, appID: "PR" }, pack("AE", true)),
    false,
  );
});
function fixture(subscribed = false, packages = catalog) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const jobs = [];
  const installed = [];
  const cancellations = [];
  const activations = [];
  const timers = new Map();
  const listeners = new Map();
  let timerId = 0;
  const calls = [];
  const auth = {
    auth: { token: "test-token" },
    authReady: true,
    signedIn: true,
    market: { Packages: packages },
    marketLoading: false,
    marketError: null,
    subscription: { subscribed },
    refreshMarket: async () => {},
    recheck: async () => ({ ok: true }),
  };
  const react = {
    useRef: (value) => {
      const i = cursor++;
      return slots[i] ?? (slots[i] = { current: value });
    },
    useState: (value) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [
        slots[i],
        (next) => {
          slots[i] = next;
        },
      ];
    },
    useEffect: (fn) => effects.push(fn),
  };
  const workspace = {
    activePackMeta: null,
    packFilePath: "",
    packError: null,
    applyPack: (meta) => {
      activations.push(meta);
      workspace.activePackMeta = meta;
      workspace.packFilePath = meta.path;
      workspace.packError = null;
    },
    reloadPackList: () => {},
  };
  const hook = load(
    "src/js/ui/odin/use-odin-package.ts",
    {
      react: react,
      "@/lib/auth-context": { useAuth: () => auth },
      "@/lib/download-manager-context": {
        useDownloadManager: () => ({
          jobs,
          enqueue: (pack) => {
            calls.push(pack);
            jobs.unshift({ id: "job-" + jobs.length, pack, status: "queued" });
          },
          cancel: (id) => {
            cancellations.push(id);
            jobs.find(job => job.id === id).status = "cancelled";
          },
          retry: (id) => { jobs.find(job => job.id === id).status = "queued"; },
        }),
      },
      "@/lib/packages-path-gate": {
        usePackagesPathGate: () => ({ ensurePackagesPath: async () => true }),
      },
      "@/lib/utils/pack": { readInstallablePackages: () => installed },
      "@/lib/utils/host-identity": { getResolvedHostSync: () => "AEFT" },
      "@/lib/utils/pack-host": hosts,
      "./use-odin-host": { useOdinHost: () => "AEFT" },
      "./odin-package-selection": selection,
    },
    { window: {
      cep: {},
      setInterval: (callback, delay) => { timers.set(++timerId, { callback, delay, interval: true }); return timerId; },
      setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
      clearInterval: id => timers.delete(id),
      clearTimeout: id => timers.delete(id),
      addEventListener: (event, callback) => listeners.set(event, callback),
      removeEventListener: event => listeners.delete(event),
    } },
  );
  return {
    calls,
    auth,
    workspace,
    jobs, installed, cancellations, activations, timers, listeners,
    render: () => {
      cursor = 0;
      effects = [];
      const result = hook.useOdinPackage(workspace);
      for (const effect of effects) {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanup();
        effect();
      }
      return result;
    },
  };
}
test("free login starts Demo once, including repeated effects and renders", async () => {
  const f = fixture();
  f.render();
  await new Promise(setImmediate);
  f.render();
  await new Promise(setImmediate);
  assert.deepEqual(
    f.calls.map((p) => p.id),
    ["AE-demo"],
  );
});
test("paid login automatically installs Full once behind the setup screen", async () => {
  const f = fixture(true);
  const model = f.render();
  await new Promise(setImmediate);
  assert.equal(model.blocking, true);
  f.render();
  await new Promise(setImmediate);
  assert.deepEqual(
    f.calls.map((p) => p.id),
    ["AE-full"],
  );
});
test("expiry blocks Full immediately, cancels its download, and installs Demo", async () => {
  const f = fixture(true);
  f.render();
  await new Promise(setImmediate);
  const fullJob = f.jobs[0];
  f.auth.subscription.subscribed = false;
  const switching = f.render();
  assert.equal(switching.blocking, true);
  assert.equal(switching.isDemo, true);
  await new Promise(setImmediate);
  assert.deepEqual(f.calls.map(p => p.id), ["AE-full", "AE-demo"]);
  assert.ok(f.cancellations.includes(fullJob.id));
  // A late Full completion cannot become the active library after expiry.
  fullJob.status = "done";
  fullJob.meta = { name: "Odin Pro", appID: "AE", version: "1.0", marketId: "AE-full", path: "full.odin" };
  f.render();
  assert.equal(f.activations.length, 0);
  const demoJob = f.jobs[0];
  demoJob.status = "done";
  demoJob.meta = { name: "Odin Pro", appID: "AE", version: "DEMO", marketId: "AE-demo", path: "demo.odin" };
  f.render();
  assert.equal(f.render().blocking, false);
  assert.deepEqual(f.activations, [demoJob.meta]);
});
test("upgrading from Demo automatically installs Full and retains the blocking screen", async () => {
  const f = fixture();
  f.workspace.activePackMeta = { name: "Odin Pro", appID: "AE", version: "DEMO", marketId: "AE-demo", path: "demo.odin" };
  f.workspace.packFilePath = "demo.odin";
  assert.equal(f.render().blocking, false);
  f.auth.subscription.subscribed = true;
  assert.equal(f.render().blocking, true);
  await new Promise(setImmediate);
  assert.deepEqual(f.calls.map(p => p.id), ["AE-full"]);
});
test("an installed matching edition is activated without downloading it again", async () => {
  const f = fixture(true);
  f.installed.push({ name: "Odin Pro", appID: "AE", version: "1.0", marketId: "AE-full", path: "full.odin" });
  f.render();
  await new Promise(setImmediate);
  assert.equal(f.render().blocking, false);
  assert.equal(f.calls.length, 0);
});
test("stale installed versions are updated automatically", async () => {
  const f = fixture(true);
  f.workspace.activePackMeta = { name: "Odin Pro", appID: "AE", version: "0.9", marketId: "AE-full", path: "full.odin" };
  f.workspace.packFilePath = "full.odin";
  assert.equal(f.render().blocking, true);
  await new Promise(setImmediate);
  assert.deepEqual(f.calls.map(p => p.id), ["AE-full"]);
});
test("focus, polling and the renewal deadline recheck entitlement without a panel restart", async () => {
  const f = fixture(true);
  f.workspace.activePackMeta = { name: "Odin Pro", appID: "AE", version: "1.0", marketId: "AE-full", path: "full.odin" };
  f.workspace.packFilePath = "full.odin";
  let checks = 0;
  f.auth.recheck = async () => { checks++; f.auth.subscription.subscribed = false; return { ok: true }; };
  f.auth.subscription.renews_at = new Date(Date.now() + 5000).toISOString();
  f.render();
  const expiry = [...f.timers.values()].find(t => !t.interval);
  assert.ok(expiry.delay > 4000 && expiry.delay <= 6000);
  await expiry.callback();
  await new Promise(setImmediate);
  f.render();
  await new Promise(setImmediate);
  assert.deepEqual(f.calls.map(p => p.id), ["AE-demo"]);
  await f.listeners.get("focus")();
  await new Promise(setImmediate);
  await [...f.timers.values()].find(t => t.interval).callback();
  await new Promise(setImmediate);
  assert.equal(checks, 3);
});
test("failed downloads keep setup blocked and retry uses the existing job", async () => {
  const f = fixture(true);
  f.render();
  await new Promise(setImmediate);
  f.jobs[0].status = "error";
  f.jobs[0].error = "Connection interrupted";
  const model = f.render();
  assert.equal(model.blocking, true);
  assert.equal(model.error, "Connection interrupted");
  await model.install();
  assert.equal(f.jobs[0].status, "queued");
  assert.equal(f.calls.length, 1);
});
test("failed account verification never starts an automatic installation", async () => {
  const f = fixture();
  f.auth.subscription.error = "Unable to verify subscription";
  f.render();
  await new Promise(setImmediate);
  assert.equal(f.calls.length, 0);
});

test("Retry setup shows verification progress, ignores double clicks, and reports failed verification", async () => {
  const f = fixture();
  f.auth.market = null;
  f.auth.marketError = "Please sign in again";
  let checks = 0, refreshes = 0, finish;
  f.auth.recheck = () => { checks++; return new Promise(resolve => { finish = resolve; }); };
  f.auth.refreshMarket = async () => { refreshes++; };
  const model = f.render();
  const retry = model.refresh();
  const pending = f.render();
  assert.equal(pending.busy, true);
  assert.equal(pending.loading, true);
  await pending.refresh();
  assert.equal(checks, 1);
  finish({ ok: false, message: "Account service is unavailable" });
  await retry;
  assert.equal(f.render().error, "Account service is unavailable");
  assert.equal(f.render().busy, false);
  assert.equal(refreshes, 0);
  assert.equal(f.calls.length, 0);
});

test("Retry setup refreshes the catalog and resumes automatic installation after verification", async () => {
  const f = fixture();
  f.auth.market = null;
  f.auth.marketError = "Please sign in again";
  f.auth.refreshMarket = async () => { f.auth.market = { Packages: catalog }; f.auth.marketError = null; };
  await f.render().refresh();
  f.render();
  await new Promise(setImmediate);
  assert.deepEqual(f.calls.map(p => p.id), ["AE-demo"]);
});

test("a local test pack prevents all catalog installs on a free account", async () => {
  const f = fixture();
  f.workspace.isTestPack = true;
  f.workspace.packFilePath = "C:/test.odin";
  const model = f.render();
  assert.equal(model.installed, true);
  await model.install();
  await new Promise(setImmediate);
  assert.equal(f.calls.length, 0);
});
