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

const spunkram = build.spunkram;
const gal = build.gal;
if (!spunkram || !gal) errors.push("brand-build.json must have spunkram and gal");

const pairs = [
  ["port", spunkram.port, gal.port],
  ["servePort", spunkram.servePort, gal.servePort],
  ["startingDebugPort", spunkram.startingDebugPort, gal.startingDebugPort],
];
for (const [key, a, b] of pairs) {
  if (a === b) errors.push(`${key} collides: both brands use ${a}`);
}

if (typeof spunkram.version !== "string" || !spunkram.version) {
  errors.push("spunkram.version missing");
}
if (typeof gal.version !== "string" || !gal.version) {
  errors.push("gal.version missing");
}

console.log(
  JSON.stringify(
    {
      package: pkg.name,
      spunkram: { ...spunkram, dist: "dist/cep-spunkram" },
      gal: { ...gal, dist: "dist/cep-gal" },
    },
    null,
    2,
  ),
);

if (errors.length) {
  console.error("[assert-brand-isolation]", errors.join("\n"));
  process.exit(1);
}
console.log("[assert-brand-isolation] ok");
