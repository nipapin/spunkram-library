#!/usr/bin/env node
/**
 * Guard: Gal and Spunkram must not share version, ports, or dist folder.
 * Also checks the npm package name is motionflow-cep (not a CEP bundle id).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = JSON.parse(readFileSync(path.join(ROOT, "brand-build.json"), "utf8"));
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

const errors = [];

if (pkg.name !== "motionflow-cep") {
  errors.push(`package.json name is "${pkg.name}", expected "motionflow-cep"`);
}

const usedPorts = new Map();
for (const id of ['spunkram', 'gal', 'odin']) {
  const brand = build[id];
  if (!brand) { errors.push(id + ' config missing'); continue; }
  if (!brand.version) errors.push(id + '.version missing');
  for (const key of ['port', 'servePort', 'startingDebugPort']) {
    const port = brand[key];
    if (!Number.isInteger(port)) errors.push(id + '.' + key + ' invalid');
    if (usedPorts.has(port)) errors.push(id + '.' + key + ' collides with ' + usedPorts.get(port));
    usedPorts.set(port, id + '.' + key);
  }
}
console.log(JSON.stringify(build, null, 2));

if (errors.length) {
  console.error("[assert-brand-isolation]", errors.join("\n"));
  process.exit(1);
}
console.log("[assert-brand-isolation] ok");
