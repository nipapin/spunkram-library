#!/usr/bin/env node
/**
 * Spunkram CEP release:
 *  1) optional version bump
 *  2) npm run zxp
 *  3) git commit (if dirty) + push + tag + push tag
 *  4) upload ZXP → R2 (next-app script) → latest.json for /api/cep/update
 *
 * Usage (from CEP repo root):
 *   npm run release
 *   npm run release -- --bump=patch
 *   npm run release -- --bump=minor --message="captions fix"
 *   npm run release -- --dry-run
 *   npm run release -- --no-git          # build + upload only
 *   npm run release -- --no-upload       # git only (rely on GitHub webhook)
 *
 * Env:
 *   NEXT_APP_ROOT  path to next-app (default: ../../next-app relative to this repo)
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PKG_PATH = path.join(ROOT, "package.json");
const CHANGELOG_PATH = path.join(ROOT, "CHANGELOG.md");
const EXT_ID = "com.spunkramlibrary.cep";

function parseArgs(argv) {
  const opts = {
    bump: null, // patch | minor | major
    message: "",
    dryRun: false,
    noGit: false,
    noUpload: false,
    skipBuild: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--no-git") opts.noGit = true;
    else if (arg === "--no-upload") opts.noUpload = true;
    else if (arg === "--skip-build") opts.skipBuild = true;
    else if (arg.startsWith("--bump=")) opts.bump = arg.slice("--bump=".length);
    else if (arg.startsWith("--message=")) opts.message = arg.slice("--message=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/release.mjs [--bump=patch|minor|major] [--message=…] [--dry-run] [--no-git] [--no-upload] [--skip-build]`);
      process.exit(0);
    } else {
      console.warn(`[release] ignoring unknown arg: ${arg}`);
    }
  }
  if (opts.bump && !["patch", "minor", "major"].includes(opts.bump)) {
    throw new Error(`Invalid --bump=${opts.bump} (use patch|minor|major)`);
  }
  return opts;
}

/** Quote args with spaces so cmd.exe keeps them as one token when shell:true. */
function shellQuote(arg) {
  const s = String(arg);
  if (!/[ \t"]/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

function run(cmd, args, opts = {}) {
  const useShell = opts.shell ?? process.platform === "win32";
  const finalArgs = useShell ? args.map(shellQuote) : args;
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, finalArgs, {
    cwd: opts.cwd || ROOT,
    stdio: "inherit",
    shell: useShell,
    env: { ...process.env, ...opts.env },
  });
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(" ")}`);
  }
}

function runCapture(cmd, args) {
  const useShell = process.platform === "win32";
  const finalArgs = useShell ? args.map(shellQuote) : args;
  const res = spawnSync(cmd, finalArgs, {
    cwd: ROOT,
    encoding: "utf8",
    shell: useShell,
  });
  if (res.status !== 0) {
    throw new Error(
      (res.stderr || res.stdout || `Command failed: ${cmd}`).toString().trim(),
    );
  }
  return (res.stdout || "").trim();
}

function bumpSemver(version, kind) {
  const parts = version.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  let [maj, min, pat] = parts;
  if (kind === "major") {
    maj += 1;
    min = 0;
    pat = 0;
  } else if (kind === "minor") {
    min += 1;
    pat = 0;
  } else {
    pat += 1;
  }
  return `${maj}.${min}.${pat}`;
}

function readPkg() {
  return JSON.parse(readFileSync(PKG_PATH, "utf8"));
}

function writePkgVersion(version) {
  const pkg = readPkg();
  pkg.version = version;
  writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function changelogForVersion(version) {
  if (!existsSync(CHANGELOG_PATH)) return "";
  const text = readFileSync(CHANGELOG_PATH, "utf8");
  // Prefer ## [x.y.z] or ## x.y.z section; else Unreleased body
  const escaped = version.replace(/\./g, "\\.");
  const sectionRe = new RegExp(
    `##\\s*\\[?${escaped}\\]?[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i",
  );
  const m = text.match(sectionRe);
  if (m) return m[1].trim();
  const un = text.match(/##\s*\[?Unreleased\]?[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  return un ? un[1].trim() : "";
}

function findZxp() {
  const exact = path.join(ROOT, "dist", "zxp", `${EXT_ID}.zxp`);
  if (existsSync(exact)) return exact;
  const dir = path.join(ROOT, "dist", "zxp");
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".zxp"));
  return hit ? path.join(dir, hit) : null;
}

function resolveNextAppRoot() {
  if (process.env.NEXT_APP_ROOT?.trim()) {
    return path.resolve(process.env.NEXT_APP_ROOT.trim());
  }
  return path.resolve(ROOT, "../../next-app");
}

function main() {
  const opts = parseArgs(process.argv);
  let version = readPkg().version;

  if (opts.bump) {
    const next = bumpSemver(version, opts.bump);
    console.log(`[release] bump ${version} → ${next} (--bump=${opts.bump})`);
    if (!opts.dryRun) writePkgVersion(next);
    version = next;
  }

  console.log(`[release] version=${version}`);

  if (!opts.skipBuild) {
    if (opts.dryRun) {
      console.log("[release] dry-run: skip npm run zxp");
    } else {
      run("npm", ["run", "zxp"]);
    }
  }

  const zxpPath = opts.dryRun && opts.skipBuild ? null : findZxp();
  if (!opts.dryRun && !opts.skipBuild && !zxpPath) {
    throw new Error("ZXP not found under dist/zxp/ after build");
  }
  if (zxpPath) console.log(`[release] zxp=${zxpPath}`);

  if (!opts.noGit) {
    const status = runCapture("git", ["status", "--porcelain"]);
    if (status) {
      const msg =
        opts.message ||
        `release: v${version}`;
      console.log(`[release] committing local changes…`);
      if (opts.dryRun) {
        console.log(`[release] dry-run: would git add/commit: ${msg}`);
      } else {
        run("git", ["add", "-A"]);
        // Allow empty? no — only if something staged
        const staged = runCapture("git", ["diff", "--cached", "--name-only"]);
        if (staged) {
          run("git", ["commit", "-m", msg]);
        } else {
          console.log("[release] nothing to commit after git add");
        }
      }
    } else {
      console.log("[release] working tree clean");
    }

    if (opts.dryRun) {
      console.log(`[release] dry-run: would git push && tag ${version} && push tag`);
    } else {
      run("git", ["push"]);
      // Tag matches CI pattern "*.*.*" (no leading v)
      const existing = spawnSync("git", ["rev-parse", `refs/tags/${version}`], {
        cwd: ROOT,
        encoding: "utf8",
        shell: process.platform === "win32",
      });
      if (existing.status === 0) {
        console.log(`[release] tag ${version} already exists — skipping create`);
      } else {
        run("git", ["tag", version]);
      }
      run("git", ["push", "origin", version]);
    }
  } else {
    console.log("[release] --no-git: skip push/tag");
  }

  if (!opts.noUpload) {
    const nextApp = resolveNextAppRoot();
    const uploadScript = path.join(nextApp, "scripts", "upload-spunkram-zxp.mjs");
    const envFile = path.join(nextApp, ".env");
    if (!existsSync(uploadScript)) {
      throw new Error(`Upload script not found: ${uploadScript} (set NEXT_APP_ROOT)`);
    }
    if (!existsSync(envFile)) {
      throw new Error(`next-app .env not found: ${envFile}`);
    }
    const notes = changelogForVersion(version);
    const uploadArgs = [
      `--env-file=${envFile}`,
      uploadScript,
      `--zxp=${zxpPath || path.join(ROOT, "dist", "zxp", `${EXT_ID}.zxp`)}`,
      `--version=${version}`,
    ];
    if (notes) uploadArgs.push(`--changelog=${notes}`);

    if (opts.dryRun) {
      console.log(`[release] dry-run: would node ${uploadArgs.join(" ")}`);
    } else {
      if (!zxpPath || !existsSync(zxpPath)) {
        throw new Error(`Cannot upload: ZXP missing at ${zxpPath}`);
      }
      console.log(`[release] uploading to R2 via next-app…`);
      run("node", uploadArgs, { cwd: nextApp });
    }
  } else {
    console.log("[release] --no-upload: skip R2 (webhook can publish from GitHub Release)");
  }

  console.log(`[release] done → v${version}`);
  console.log(`  check: https://motionflow.pro/api/cep/update`);
}

try {
  main();
} catch (err) {
  console.error("[release]", err instanceof Error ? err.message : err);
  process.exit(1);
}
