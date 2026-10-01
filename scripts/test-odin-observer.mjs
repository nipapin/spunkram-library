import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { win32 } from "node:path";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/js/ui/odin/observer/cards-model.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(
  require,
  mod,
  mod.exports,
);
const { parseCards, visibleInHost, folderKey, reorderCards } = mod.exports;
const card = (id, appID = "AEFT", isShared = false) => ({
  id,
  title: id,
  folderPath: `C:/Folders/${id}`,
  appID,
  isShared,
});

test("reads original Observer cards and migrates legacy host/sharing fields", () => {
  const [legacy, ae] = parseCards(
    JSON.stringify([
      { id: "old", title: "Old", folderPath: "C:/Old", isGlobal: true },
      card("ae"),
    ]),
  );
  assert.equal(legacy.appID, "PPRO");
  assert.equal(legacy.isShared, true);
  assert.equal(visibleInHost(legacy, "AEFT"), true);
  assert.equal(visibleInHost(ae, "PPRO"), false);
});

test("invalid shortcuts fail before any update can overwrite the stored list", () => {
  assert.throws(() => parseCards("{"));
  assert.throws(() => parseCards("{}"));
  assert.throws(() => parseCards('[{"id":"missing-path"}]'));
  assert.deepEqual(parseCards(null), []);
});

test("reordering visible shortcuts preserves other host and search-hidden slots", () => {
  const all = [
    card("a"),
    card("pr", "PPRO"),
    card("hidden"),
    card("b"),
    card("shared", "PPRO", true),
  ];
  const result = reorderCards(all, "a", "shared", ["a", "b", "shared"]);
  assert.deepEqual(
    result.map((item) => item.id),
    ["b", "pr", "hidden", "shared", "a"],
  );
  assert.equal(result[1], all[1]);
  assert.equal(result[2], all[2]);
  assert.deepEqual(
    all.map((item) => item.id),
    ["a", "pr", "hidden", "b", "shared"],
  );
  assert.deepEqual(reorderCards(all, "missing", "a", ["a"]), all);
});

test("folder deduplication respects Windows separators/case and macOS case", () => {
  assert.equal(folderKey("C:\\Media\\Odin\\"), folderKey("c:/media/odin"));
  assert.notEqual(
    folderKey("/Media/Odin", false),
    folderKey("/Media/odin", false),
  );
});

function storageFixture({ failRename = false } = {}) {
  const files = new Map();
  const legacy = new Map();
  const fakeFs = {
    existsSync: (file) => files.has(file),
    mkdirSync: () => {},
    writeFileSync: (file, data) => files.set(file, data),
    readFileSync: (file) => files.get(file),
    unlinkSync: (file) => files.delete(file),
    renameSync: (from, to) => {
      if (failRename) throw new Error("Disk write failed");
      files.set(to, files.get(from));
      files.delete(from);
    },
  };
  const text = readFileSync(
    new URL(
      "../src/js/ui/odin/observer/cards-file-storage.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const js = ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const result = { exports: {} };
  const fakeRequire = (name) =>
    name === "./cards-model"
      ? mod.exports
      : {
          fs: fakeFs,
          path: win32,
          os: { platform: () => "win32", homedir: () => "C:\\Test" },
        };
  new Function(
    "require",
    "module",
    "exports",
    "window",
    "process",
    "localStorage",
    "console",
    js,
  )(
    fakeRequire,
    result,
    result.exports,
    { cep: {} },
    { env: { APPDATA: "C:\\Test\\Roaming" } },
    {
      getItem: (key) => legacy.get(key),
      removeItem: (key) => legacy.delete(key),
    },
    { error() {}, warn() {} },
  );
  return { api: result.exports, files, legacy };
}

test("saving Observer shortcuts preserves the original when replacing the file fails", () => {
  const { api, files } = storageFixture({ failRename: true });
  const file = api.getOdinCardsFilePath();
  const original = JSON.stringify([card("original")]);
  files.set(file, original);
  assert.equal(api.saveCardsFileRaw(JSON.stringify([card("new")])), false);
  assert.equal(files.get(file), original);
  assert.equal(files.size, 1, "temporary file is cleaned up");
});

test("legacy migration keeps the old data unless a valid file is saved successfully", () => {
  const { api, files, legacy } = storageFixture();
  legacy.set("cards", "broken-json");
  api.migrateLegacyLocalStorageToCardsFile();
  assert.equal(legacy.get("cards"), "broken-json");
  assert.equal(files.size, 0);
  const valid = JSON.stringify([card("kept")]);
  legacy.set("cards", valid);
  api.migrateLegacyLocalStorageToCardsFile();
  assert.equal(legacy.has("cards"), false);
  assert.equal(api.loadCardsFileRaw(), valid);
  assert.match(
    api.getOdinCardsFilePath(),
    /Premiere Basics\\Odin Pro Extension\\cards.json$/,
  );
});
