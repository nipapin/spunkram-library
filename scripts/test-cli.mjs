import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import { parseArgs, completeOptions, executionPlan, runPlan, Cancelled, select } from "./cli.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ["scripts/cli.mjs", ...args], { cwd: root, encoding: "utf8" });

test("wizard asks release type before author; dev/build only ask author", async () => {
  for (const command of ["dev", "build", "release"]) {
    const questions = [];
    const result = await completeOptions(parseArgs([command]), async (title, choices) => {
      questions.push(title);
      return choices[0].value;
    });
    assert.deepEqual(questions, command === "release" ? ["Тип релиза", "Автор"] : ["Автор"]);
    assert.equal(result.author, "spunkram");
  }
});

test("explicit flags bypass prompts, including beta and legacy flag aliases", async () => {
  const options = parseArgs(["release", "--brand=gal", "--bump", "minor", "--message=release & literal $(text)"]);
  const result = await completeOptions(options, () => assert.fail("Unexpected prompt"));
  const [step] = executionPlan(result);
  assert.ok(step.args.includes("--bump=minor"));
  assert.ok(step.args.includes("--message=release & literal $(text)"));
  await completeOptions(parseArgs(["release", "--author=gal", "--beta"]), () => assert.fail("Unexpected prompt"));
});

test("invalid or misplaced options fail before execution", () => {
  for (const args of [["dev", "--author=nope"], ["release", "--type=nope"], ["build", "--format=exe"], ["dev", "--no-git"], ["release", "--type=patch", "--beta"], ["build", "--unknown"], ["build", "--author"]]) {
    assert.throws(() => parseArgs(args));
  }
});

test("Odin cannot publish accidentally, but local releases are available", async () => {
  await assert.rejects(completeOptions(parseArgs(["release", "--author=odin", "--type=patch"])), /не настроена/);
  const local = await completeOptions(parseArgs(["release", "--author=odin", "--type=patch", "--no-upload"]));
  assert.ok(executionPlan(local)[0].args.includes("--no-upload"));
});

test("build preserves dependency/clean/typecheck/Vite order and isolates environment", () => {
  const steps = executionPlan(parseArgs(["build", "--author=odin", "--format=zxp"]));
  assert.equal(steps.length, 4);
  assert.match(steps[0].file, /build-deps\.mjs$/);
  assert.match(steps[1].file, /clean-dist\.mjs$/);
  assert.match(steps[2].file, /typescript[/\\]bin[/\\]tsc$/);
  assert.equal(steps[3].env.ZXP_PACKAGE, "true");
  assert.equal(steps[3].env.ZIP_PACKAGE, "");
  assert.ok(steps.every(step => step.env.APP_BRAND === "odin" && step.env.CLEAN_DIST_ALL === ""));
  const dev = executionPlan(parseArgs(["dev", "--author=gal"]));
  assert.equal(dev.length, 2);
  assert.equal(dev[1].env.ZXP_PACKAGE, "");
  const zip = executionPlan(parseArgs(["build", "--author=gal", "--format=zip"]));
  assert.equal(zip.at(-1).env.ZIP_PACKAGE, "true");
});

test("child failure stops subsequent steps; processes use argument arrays without a shell", () => {
  let calls = 0;
  assert.throws(() => runPlan(executionPlan(parseArgs(["build", "--author=gal"])), { spawn(command, args, opts) {
    calls++;
    assert.equal(command, process.execPath);
    assert.equal(opts.shell, false);
    return { status: 7 };
  } }), error => error.exitCode === 7);
  assert.equal(calls, 1);
  runPlan(executionPlan(parseArgs(["dev", "--author=gal"])), { dryRun: true, spawn() { assert.fail("Dry-run spawned a process"); } });
});

test("cancellation and missing headless choices do not start work", async () => {
  await assert.rejects(completeOptions(parseArgs(["build"]), () => { throw new Cancelled(); }), Cancelled);
  assert.throws(() => select("Автор", [], { input: { isTTY: false }, output: {} }), /интерактивный/);
  const result = cli("build");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--author/);
});

test("terminal selection and cancellation restore raw mode and pause stdin", async () => {
  for (const cancel of [false, true]) {
    const input = new PassThrough();
    input.isTTY = true;
    input.isRaw = false;
    input.setRawMode = raw => { input.isRaw = raw; };
    input.resume();
    let rendered = "";
    const pending = select("Автор", [{ value: "odin", label: "Odin" }], {
      input, output: { isTTY: true, write: text => { rendered += text; } },
    });
    input.emit("keypress", "", { name: cancel ? "escape" : "return" });
    if (cancel) await assert.rejects(pending, Cancelled);
    else assert.equal(await pending, "odin");
    assert.equal(input.isRaw, false);
    assert.equal(input.isPaused(), true);
    assert.equal(input.listenerCount("keypress"), 0);
    assert.ok(rendered.includes("\x1b[?25h"));
    input.destroy();
  }
});

test("release dry-run leaves version file untouched, including Odin local release", () => {
  const buildFile = new URL("../brand-build.json", import.meta.url);
  const before = readFileSync(buildFile, "utf8");
  for (const author of ["gal", "odin"]) {
    const result = cli("release", `--author=${author}`, "--type=patch", "--dry-run", "--no-git", "--no-upload");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`would build --author=${author} --format=zxp`));
    assert.equal(readFileSync(buildFile, "utf8"), before);
  }
});
