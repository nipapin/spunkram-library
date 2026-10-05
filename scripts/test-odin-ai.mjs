import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(file, imports, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL("../" + file, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    name => { if (!(name in imports)) throw Error("Unexpected import " + name); return imports[name]; },
    mod, mod.exports, ...Object.values(globals),
  );
  return mod.exports;
}
const brands = load("brands.config.ts", { "./brand-build.json": {
  default: JSON.parse(readFileSync(new URL("../brand-build.json", import.meta.url), "utf8")),
} });

test("Odin subscription grants 100 generations, free accounts have none", () => {
  const odin = brands.BRANDS.odin;
  assert.equal(odin.features.aiTools, true);
  assert.equal(brands.resolveGenerationLimit(undefined, "subscribed", odin), 100);
  assert.equal(brands.resolveGenerationLimit(0, "subscribed", odin), 100);
  assert.equal(brands.resolveGenerationLimit(100, "free", odin), 0);
  assert.equal(brands.resolveGenerationLimit(100, "purchased", odin), 0);
  assert.equal(brands.resolveGenerationLimit(undefined, "subscribed", brands.BRANDS.spunkram), 100);
  assert.equal(brands.resolveGenerationLimit(undefined, "subscribed", brands.BRANDS.gal), null);
});

test("Odin AI routes use Motionflow while login, packages and account stay on Odin", () => {
  const config = load("src/js/api/config.ts", { "@brands": { BRAND: brands.BRANDS.odin } });
  for (const route of ["/api/cep/generations", "/api/generations/captions", "/api/generations/chapters", "/api/captions?brand=odin", "/api/captions/fonts?brand=odin&pack=Base"]) {
    assert.equal(config.apiUrl(route), "https://motionflow.pro" + route);
  }
  for (const route of ["/api/cep/auth/device", "/api/cep/me?client=odin-cep", "/api/cep/market?host=AE", "/api/cep/market/download?pack_id=283"]) {
    assert.equal(config.apiUrl(route), "https://odin-pro.com" + route);
  }
  assert.equal(config.apiUrl("https://cdn.motionflow.pro/asset.mp4"), "https://cdn.motionflow.pro/asset.mp4");
  let runtime;
  load("src/js/ai/cep-ai.ts", {
    "motionflow-ai": { createAiTools: value => { runtime = value; return {}; } },
    "../api/config": config, "../lib/cep/node": {},
    "../api/user": { getUserIdentity: () => ({ id: "account-id", token: "odincep_token" }) },
    "../utils/captionsJsx": {},
  });
  assert.equal(runtime.apiBase, config.AI_API_BASE);
  assert.equal(runtime.getIdentity().token, "odincep_token");
});

test("other brands keep their existing API routing", () => {
  for (const id of ["gal", "spunkram"]) {
    const config = load("src/js/api/config.ts", { "@brands": { BRAND: brands.BRANDS[id] } });
    assert.equal(config.apiUrl("/api/cep/me"), "https://motionflow.pro/api/cep/me");
    assert.equal(config.apiUrl("/api/generations/captions"), "https://motionflow.pro/api/generations/captions");
  }
});
