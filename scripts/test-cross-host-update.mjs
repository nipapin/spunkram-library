import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeExtensionVersion,
  parseAppliedVersionStamp,
  shouldReloadExtensionForAppliedUpdate,
} from "../src/js/utils/cross-host-update.ts";

test("normalizeExtensionVersion strips v prefix", () => {
  assert.equal(normalizeExtensionVersion("v0.9.22"), "0.9.22");
  assert.equal(normalizeExtensionVersion(" 0.9.22 "), "0.9.22");
  assert.equal(normalizeExtensionVersion(null), "");
});

test("parseAppliedVersionStamp reads version from handshake json", () => {
  assert.equal(parseAppliedVersionStamp({ version: "0.9.22" }), "0.9.22");
  assert.equal(parseAppliedVersionStamp({ version: "v0.9.22" }), "0.9.22");
  assert.equal(parseAppliedVersionStamp({}), null);
  assert.equal(parseAppliedVersionStamp(null), null);
});

test("reload panel when roaming stamp matches banner target and running JS is old", () => {
  assert.equal(
    shouldReloadExtensionForAppliedUpdate({
      runningVersion: "0.9.21",
      appliedVersion: "0.9.22",
      targetVersion: "0.9.22",
    }),
    true,
  );
});

test("do not reload host-app path: skip while this panel is applying", () => {
  assert.equal(
    shouldReloadExtensionForAppliedUpdate({
      runningVersion: "0.9.21",
      appliedVersion: "0.9.22",
      targetVersion: "0.9.22",
      applying: true,
    }),
    false,
  );
});

test("do not reload when already running the applied version", () => {
  assert.equal(
    shouldReloadExtensionForAppliedUpdate({
      runningVersion: "0.9.22",
      appliedVersion: "0.9.22",
      targetVersion: "0.9.22",
    }),
    false,
  );
});

test("do not reload when stamp does not match the banner target", () => {
  assert.equal(
    shouldReloadExtensionForAppliedUpdate({
      runningVersion: "0.9.21",
      appliedVersion: "0.9.21",
      targetVersion: "0.9.22",
    }),
    false,
  );
});

test("without a banner, reload when another host applied a newer version", () => {
  assert.equal(
    shouldReloadExtensionForAppliedUpdate({
      runningVersion: "0.9.21",
      appliedVersion: "0.9.22",
    }),
    true,
  );
});
