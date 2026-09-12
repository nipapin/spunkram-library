import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const windowSource = readFileSync(
  new URL("../src/js/lib/utils/footage-grid-window.ts", import.meta.url),
  "utf8",
);

const stubPackTree = `
export function resolvePreviewAspectRatio(group) {
  if (group && group.is_audio) return "1 / 1";
  switch (group && group.custom_preview_res_thumbnail) {
    case "VERTICAL": return "9 / 16";
    case "BOX_MIN":
    case "BOX_MAX": return "1 / 1";
    default: return "16 / 9";
  }
}
`;
const stubUrl = `data:text/javascript;base64,${Buffer.from(stubPackTree).toString("base64")}`;
const { outputText } = ts.transpileModule(windowSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
  fileName: "footage-grid-window.ts",
});
const patched = outputText.replace("./pack-tree", stubUrl);
const {
  layoutGridSections,
  windowGridSections,
  mountedCardCount,
  windowRangeKey,
  GRID_GAP_PX,
  SECTION_GAP_PX,
  WINDOW_BUFFER_PX,
} = await import(
  `data:text/javascript;base64,${Buffer.from(patched).toString("base64")}`
);

function item(id, aspect = "DEFAULT") {
  return {
    id,
    name: id,
    group: { custom_preview_res_thumbnail: aspect },
    pathSegments: ["Backgrounds", id],
    previewKey: id,
  };
}

function section(id, count, aspect = "DEFAULT") {
  return {
    id,
    title: id,
    items: Array.from({ length: count }, (_, i) => item(`${id}-${i}`, aspect)),
  };
}

const metrics = {
  columns: 2,
  width: 320,
  gap: GRID_GAP_PX,
  sectionGap: SECTION_GAP_PX,
  titleHeight: 50,
  gridPadX: 8,
};

test("142 posters across 8 sections never mount more than ~40 cards at the top", () => {
  const sizes = [20, 18, 16, 22, 12, 14, 24, 16];
  assert.equal(sizes.reduce((a, b) => a + b, 0), 142);
  const sections = sizes.map((n, i) => section(`s${i}`, n));
  const layout = layoutGridSections(sections, metrics);
  const windows = windowGridSections(layout, 0, 500, WINDOW_BUFFER_PX);
  const mounted = mountedCardCount(layout, windows);
  assert.ok(mounted > 0, "first screen must show cards");
  assert.ok(
    mounted <= 64,
    `expected <=64 mounted cards, got ${mounted}`,
  );
  assert.ok(layout.totalHeight > 2000);
});

test("scrolling to the last section mounts that section and stays bounded", () => {
  const sections = [section("head", 80), section("tail", 62)];
  const layout = layoutGridSections(sections, metrics);
  const last = layout.sections[1];
  const atStart = windowGridSections(layout, last.top, 500, WINDOW_BUFFER_PX);
  assert.ok(atStart[1].endRow > atStart[1].startRow);
  const atEnd = windowGridSections(
    layout,
    Math.max(0, layout.totalHeight - 500),
    500,
    WINDOW_BUFFER_PX,
  );
  assert.equal(atEnd[1].endRow, last.rows);
  const mounted = mountedCardCount(layout, atEnd);
  assert.ok(mounted <= 64, `got ${mounted}`);
});

test("range key is stable for the same rows and changes when the window slides", () => {
  const sections = [section("only", 142)];
  const layout = layoutGridSections(sections, metrics);
  const stride = layout.sections[0].stride;
  const a = windowRangeKey(windowGridSections(layout, 0, 500));
  const same = windowRangeKey(windowGridSections(layout, 0, 500));
  const c = windowRangeKey(windowGridSections(layout, stride * 8, 500));
  assert.equal(a, same);
  assert.notEqual(a, c);
});

test("empty and title-less sections keep offsets aligned", () => {
  const sections = [
    { id: "empty", title: "Empty", items: [] },
    { id: "plain", title: "", items: [item("a"), item("b")] },
    { id: "named", title: "Named", items: [item("c"), item("d"), item("e")] },
  ];
  const layout = layoutGridSections(sections, metrics);
  assert.equal(layout.sections.length, 2);
  assert.equal(layout.sections[0].id, "plain");
  assert.equal(layout.sections[0].titleHeight, 0);
  assert.equal(layout.sections[1].id, "named");
  assert.ok(layout.sections[1].top > layout.sections[0].height);
});
