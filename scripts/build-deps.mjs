#!/usr/bin/env node
/**
 * Rebuild local `file:` dependencies before building / serving the extension.
 *
 * `motionflow-sdk` is consumed as a bundle (`dist/index.js`), so panel code keeps
 * using the previous API until that bundle is rebuilt. `motionflow-host` is
 * compiled straight from `src/index.ts` by vite.es.config — its own `dist` is
 * never loaded here, and building it would bake in default (unbranded) bin
 * names, so it is deliberately skipped.
 *
 * Set SKIP_DEPS_BUILD=1 to bypass (e.g. offline or CI with prebuilt packages).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Node 20+ refuses to spawn `npm.cmd` without a shell (CVE-2024-27980), so run
 * npm's own JS entry point with the current Node when npm exposes it.
 */
function npmCommand(args) {
  const execPath = process.env.npm_execpath;
  if (execPath && execPath.endsWith(".js")) {
    return { command: process.execPath, args: [execPath, ...args], shell: false };
  }
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return { command: npm, args, shell: process.platform === "win32" };
}

/** Linked packages whose built output the panel actually imports. */
const BUNDLED_DEPS = ["motionflow-sdk"];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveLinkedDir(name, spec) {
  if (typeof spec !== "string" || !spec.startsWith("file:")) return null;
  return path.resolve(ROOT, spec.slice("file:".length));
}

function runNpm(args, cwd) {
  const { command, args: argv, shell } = npmCommand(args);
  const res = spawnSync(command, argv, { cwd, stdio: "inherit", shell });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed in ${cwd} (exit ${res.status})`);
  }
}

if (process.env.SKIP_DEPS_BUILD === "1") {
  console.log("[build-deps] SKIP_DEPS_BUILD=1 — using the existing dependency builds");
  process.exit(0);
}

const pkg = readJson(path.join(ROOT, "package.json"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

for (const name of BUNDLED_DEPS) {
  const dir = resolveLinkedDir(name, deps[name]);
  if (!dir) {
    console.log(`[build-deps] ${name} is not a local file: dependency — skipping`);
    continue;
  }
  const manifest = path.join(dir, "package.json");
  if (!fs.existsSync(manifest)) {
    throw new Error(`[build-deps] ${name} not found at ${dir}`);
  }
  const depPkg = readJson(manifest);
  if (!depPkg.scripts?.build) {
    console.log(`[build-deps] ${name} has no build script — skipping`);
    continue;
  }
  if (!fs.existsSync(path.join(dir, "node_modules"))) {
    console.log(`[build-deps] installing ${name} dependencies`);
    runNpm(["install"], dir);
  }
  console.log(`[build-deps] building ${name} (${dir})`);
  runNpm(["run", "build"], dir);
}
