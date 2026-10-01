import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Check a JSON pack against an inventory using the actual CEP path resolver.
// No Adobe process, network, environment variables, or credentials are needed.
const [definition, manifestFile, reportFile] = process.argv.slice(2);
if (!definition || !manifestFile || !reportFile) throw new Error("Usage: node scripts/audit-odin-pack.mjs <definition.odin> <manifest.json> <report.json>");
const pack = JSON.parse(fs.readFileSync(definition, "utf8").replace(/^\uFEFF/, ""));
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
if (!Array.isArray(manifest)) throw new Error("Expected array manifest");
const virtualRoot = path.resolve(".odin-audit-virtual");
const paths = new Set();
for (const entry of manifest) {
  if (!entry.path || entry.path.split(/[\\/]/).includes("..")) throw new Error("Invalid manifest path");
  let target = path.join(virtualRoot, entry.path);
  paths.add(target);
  while (target !== virtualRoot) { target = path.dirname(target); paths.add(target); }
}
const root = fileURLToPath(new URL("../src/js/lib/utils/", import.meta.url));
const cache = new Map();
function load(name) {
  if (name === "../cep/node") return { fs: { existsSync: p => paths.has(p) }, path };
  if (name === "@brands") return { BRAND: { id: "odin" }, PACKAGE_FILE_EXTENSIONS: ["odin"] };
  if (cache.has(name)) return cache.get(name);
  const source = fs.readFileSync(path.join(root, name + ".ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  cache.set(name, module.exports);
  new Function("require", "module", "exports", code)(load, module, module.exports);
  return module.exports;
}
const tree = load("./pack-tree");
const resolver = load("./pack-apply-paths");
const host = pack.settings?.main?.software_id;
if (!["AE", "PR"].includes(host)) throw new Error("Unknown pack host");
const items = tree.flattenPackGroups(tree.buildPackTree(pack.structure ?? pack.contents ?? pack.content)).flatMap(g => g.items);
const missing = [];
const unsupported = [];
const uniqueSources = new Set();
for (const item of items) {
  const source = resolver.resolveItemSourceFile(item, path.join(virtualRoot, "pack.odin"), host === "AE" ? "AEFT" : "PPRO", pack.settings);
  if (!source || source.ctype === "UNSUPPORTED") { unsupported.push(item.id); continue; }
  const rel = path.relative(virtualRoot, source.file).replaceAll("\\", "/");
  uniqueSources.add(rel);
  if (!paths.has(source.file)) missing.push({ id: item.id, type: source.ctype, expected: rel });
}
const report = { host, name: pack.settings.main.name, version: pack.settings.main.version, itemCount: items.length, uniqueSources: uniqueSources.size,
  missingCount: missing.length, unsupportedCount: unsupported.length, missing, unsupported };
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, missing: missing.slice(0, 5), unsupported: unsupported.slice(0, 5) }));
process.exitCode = missing.length || unsupported.length ? 2 : 0;
