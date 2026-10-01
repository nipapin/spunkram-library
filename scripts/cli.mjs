#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { emitKeypressEvents } from "node:readline";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTHORS, RELEASE_TYPES } from "./cli-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const COMMANDS = ["dev", "build", "release", "watch", "zxp", "zip", "serve", "symlink", "delsymlink"];
const RELEASE_FLAGS = ["--beta", "--no-git", "--no-upload", "--skip-build"];

export function parseArgs(argv) {
  const [command, ...args] = argv;
  const options = { command, author: null, type: null, format: "panel", dryRun: false, help: false, releaseArgs: [] };
  if (command === "--help" || command === "-h") return { ...options, help: true };
  if (!COMMANDS.includes(command)) throw new Error("Укажите команду: dev, build или release. Справка: node scripts/cli.mjs --help");
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const [key, ...tail] = arg.split("=");
    if (["--author", "--brand", "--type", "--bump", "--format", "--message"].includes(key)) {
      const value = tail.length ? tail.join("=") : args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Нет значения для ${key}`);
      if (["--author", "--brand"].includes(key)) options.author = value;
      else if (["--type", "--bump"].includes(key)) options.type = value;
      else if (key === "--format") options.format = value;
      else options.releaseArgs.push(`--message=${value}`);
    } else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (RELEASE_FLAGS.includes(arg)) options.releaseArgs.push(arg);
    else throw new Error(`Неизвестный параметр: ${arg}`);
  }
  if (options.help) return options;
  if (options.author && !AUTHORS.some(a => a.id === options.author) && !(command === "release" && options.author === "all")) throw new Error(`Неизвестный автор: ${options.author}`);
  if (options.type && !RELEASE_TYPES.includes(options.type)) throw new Error("Тип релиза: patch, minor или major");
  if (!["panel", "zxp", "zip"].includes(options.format)) throw new Error("Формат сборки: panel, zxp или zip");
  if (command !== "release" && (options.type || options.releaseArgs.length)) throw new Error("Параметры релиза доступны только для release");
  if (command !== "build" && options.format !== "panel") throw new Error("--format доступен только для build");
  if (options.type && options.releaseArgs.includes("--beta")) throw new Error("Выберите --type или --beta, не оба параметра");
  return options;
}

export class Cancelled extends Error {}

/** Small native terminal menu: arrows or digits, Enter to select, Esc/Ctrl+C to exit. */
export function select(title, choices, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Для мастера нужен интерактивный терминал. Укажите --author, а для release также --type (см. --help).");
  }
  return new Promise((resolve, reject) => {
    let index = 0;
    const wasRaw = input.isRaw;
    const lines = choices.length + 2;
    const render = (again = false) => {
      if (again) output.write(`\x1b[${lines}A`);
      output.write(`\x1b[2K${title}\n`);
      choices.forEach((choice, i) => output.write(`\x1b[2K${i === index ? "›" : " "} ${i + 1}. ${choice.label}\n`));
      output.write("\x1b[2K↑/↓ или цифра · Enter — выбрать · Esc — отмена\n");
    };
    const finish = (cancelled) => {
      input.removeListener("keypress", onKey);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      output.write("\x1b[?25h");
      if (cancelled) reject(new Cancelled("Отменено."));
      else { output.write(`${title}: ${choices[index].label}\n\n`); resolve(choices[index].value); }
    };
    const onKey = (_text, key = {}) => {
      if ((key.ctrl && key.name === "c") || key.name === "escape") return finish(true);
      if (key.name === "return" || key.name === "enter") return finish(false);
      if (key.name === "up") index = (index + choices.length - 1) % choices.length;
      else if (key.name === "down") index = (index + 1) % choices.length;
      else if (/^[1-9]$/.test(_text || "") && Number(_text) <= choices.length) index = Number(_text) - 1;
      else return;
      render(true);
    };
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKey);
    output.write("\x1b[?25l");
    render();
  });
}

export async function completeOptions(options, choose = select) {
  const result = { ...options };
  if (result.command === "release" && !result.type && !result.releaseArgs.includes("--beta")) {
    result.type = await choose("Тип релиза", RELEASE_TYPES.map(value => ({ value, label: value })));
  }
  const release = result.command === "release";
  const canSkipUpload = result.releaseArgs.includes("--no-upload");
  const available = AUTHORS.filter(a => !release || canSkipUpload || a.product);
  if (!result.author) {
    result.author = await choose("Автор", available.map(a => ({ value: a.id, label: a.label })));
  }
  if (result.author !== "all" && !available.some(a => a.id === result.author)) {
    throw new Error(`Публикация ${result.author} не настроена. Используйте build --format=zxp или release --no-upload.`);
  }
  return result;
}

/** All steps use Node entry points, avoiding npm.cmd/shell quoting and recursive wizards. */
export function executionPlan(options) {
  const env = { APP_BRAND: options.author, ZXP_PACKAGE: "", ZIP_PACKAGE: "", BOLT_ACTION: "", SERVE_PANEL: "", CLEAN_DIST_ALL: "" };
  const step = (file, args = [], extra = {}) => ({ file, args, env: { ...env, ...extra } });
  const vite = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
  const tsc = require.resolve("typescript/bin/tsc");
  if (options.command === "release") return [step(path.join(ROOT, "scripts/release.mjs"), [
    `--brand=${options.author}`, ...(options.type ? [`--bump=${options.type}`] : []),
    ...options.releaseArgs, ...(options.dryRun ? ["--dry-run"] : []),
  ])];
  if (options.command === "serve") return [step(vite, ["preview"], { SERVE_PANEL: "true" })];
  if (["symlink", "delsymlink"].includes(options.command)) return [step(vite, [], { BOLT_ACTION: options.command })];
  const deps = step(path.join(ROOT, "scripts/build-deps.mjs"));
  if (options.command === "dev") return [deps, step(vite)];
  const format = ["zxp", "zip"].includes(options.command) ? options.command : options.format;
  const packaging = format === "zxp" ? { ZXP_PACKAGE: "true" } : format === "zip" ? { ZIP_PACKAGE: "true" } : {};
  const watch = options.command === "watch";
  return [deps,
    ...(!watch ? [step(path.join(ROOT, "scripts/clean-dist.mjs"))] : []),
    step(tsc, ["-p", "tsconfig-build.json"]),
    step(vite, ["build", "--watch", String(watch)], packaging),
  ];
}

export function runPlan(steps, { dryRun = false, spawn = spawnSync } = {}) {
  for (const step of steps) {
    console.log(`$ node ${[path.relative(ROOT, step.file), ...step.args].map(v => JSON.stringify(v)).join(" ")}`);
    if (dryRun) continue;
    const child = spawn(process.execPath, [step.file, ...step.args], {
      cwd: ROOT, stdio: "inherit", shell: false, env: { ...process.env, ...step.env },
    });
    if (child.error) throw child.error;
    if (child.signal === "SIGINT") throw new Cancelled("Отменено.");
    if (child.status !== 0) throw Object.assign(new Error(`Команда завершилась с кодом ${child.status ?? child.signal}`), { exitCode: child.status || 1 });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`CEP wizard
  npm run dev                         → автор
  npm run build                       → автор
  npm run release                     → patch/minor/major → автор

Без вопросов:
  npm run dev -- --author=odin
  npm run build -- --author=gal --format=zxp
  npm run release -- --type=patch --author=spunkram --dry-run
  npm run release -- --type=patch --author=odin

Авторы: ${AUTHORS.map(a => a.id).join(", ")}
build: --format=panel|zxp|zip (по умолчанию panel)
release: --type=patch|minor|major, --beta, --no-git, --no-upload,
         --skip-build, --message="...", --author=all (Spunkram + Gal + Odin)
--brand / --bump — алиасы --author / --type. --dry-run — без изменений.
Релиз выполняет сборку ZXP, commit/push/tag и загрузку в R2.

Дополнительно: node scripts/cli.mjs watch|zxp|zip|serve|symlink|delsymlink --author=…`);
    return;
  }
  const resolved = await completeOptions(options);
  console.log(`[cep] ${resolved.command} · ${resolved.author}${resolved.type ? ` · ${resolved.type}` : ""}\n`);
  runPlan(executionPlan(resolved), { dryRun: resolved.dryRun && resolved.command !== "release" });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Cancelled ? "Отменено." : `[cep] ${error.message}`);
    process.exitCode = error instanceof Cancelled ? 130 : error.exitCode || 1;
  });
}
