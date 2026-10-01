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
    applyPack: () => {},
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
            jobs.push({ id: "job", pack, status: "queued" });
          },
          cancel: () => {},
          retry: () => {},
        }),
      },
      "@/lib/packages-path-gate": {
        usePackagesPathGate: () => ({ ensurePackagesPath: async () => true }),
      },
      "@/lib/utils/pack": { readInstallablePackages: () => [] },
      "@/lib/utils/host-identity": { getResolvedHostSync: () => "AEFT" },
      "@/lib/utils/pack-host": hosts,
      "./use-odin-host": { useOdinHost: () => "AEFT" },
      "./odin-package-selection": selection,
    },
    { window: { cep: {} } },
  );
  return {
    calls,
    auth,
    workspace,
    render: () => {
      cursor = 0;
      effects = [];
      const result = hook.useOdinPackage(workspace);
      for (const effect of effects) {
        effect();
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
test("paid login waits for Download Pack", async () => {
  const f = fixture(true);
  const model = f.render();
  await new Promise(setImmediate);
  assert.equal(f.calls.length, 0);
  await model.install();
  assert.deepEqual(
    f.calls.map((p) => p.id),
    ["AE-full"],
  );
});
test("failed account verification never starts an automatic installation", async () => {
  const f = fixture();
  f.auth.subscription.error = "Unable to verify subscription";
  f.render();
  await new Promise(setImmediate);
  assert.equal(f.calls.length, 0);
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

function devLoader(dev, content) {
  return load("src/js/ui/odin/odin-dev-pack.ts", {
    "@brands": { BRAND: { id: "odin", devPack: { host: "PR", path: "C:/test.odin" } } },
    "@/lib/utils/pack": {},
  }, {
    __DEV__: dev,
    window: {},
    fetch: async () => ({ ok: true, json: async () => content }),
  }).loadOdinDevPack;
}
test("development loader opens plain JSON without renaming it to Demo", async () => {
  const content = { settings: { main: { name: "Odin Pro", version: "1.2.0", software_id: "PR" } }, structure: {} };
  const loaded = await devLoader(true, content)();
  assert.equal(loaded.meta.version, "1.2.0");
  assert.equal(loaded.meta.path, "C:/test.odin");
  assert.equal(loaded.pack.method, "JSON");
});
test("development loader refuses another Adobe host", async () => {
  await assert.rejects(devLoader(true, { settings: { main: { software_id: "AE" } }, structure: {} }), /host does not match/);
});
test("release build refuses a local test pack even with configured path", async () => {
  await assert.rejects(devLoader(false, {}), /No local development pack configured/);
});
