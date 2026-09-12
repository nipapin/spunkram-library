import assert from "node:assert/strict";
import { test } from "node:test";

/** Same as panel `esPath` / host `toPproPath` — no CEP File() in this test. */
const toPproPath = (filePath) => String(filePath || "").replace(/\\/g, "/");

const normalizeMediaPath = (filePath) => {
  let s = toPproPath(filePath);
  s = s.replace(/%20/gi, " ");
  if (s.toLowerCase().indexOf("file:") === 0) {
    s = s.replace(/^file:\/+/i, "");
  }
  return s.toLowerCase();
};

const stemOf = (name) => {
  const n = String(name || "");
  const dot = n.lastIndexOf(".");
  return dot > 0 ? n.substring(0, dot) : n;
};

const namesMatch = (left, right) => {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (a === b) return true;
  return stemOf(a) === stemOf(b);
};

test("toPproPath keeps spaces, converts Windows slashes", () => {
  const win =
    "C:\\Users\\x\\spunkram-packages\\PR\\Spunkram Library - PR\\Previews\\Sound FX\\Notifications\\01\\Notification t1_02.wav";
  assert.equal(
    toPproPath(win),
    "C:/Users/x/spunkram-packages/PR/Spunkram Library - PR/Previews/Sound FX/Notifications/01/Notification t1_02.wav",
  );
});

test("media path compare treats %20 and slashes as the same file", () => {
  const disk =
    "C:\\Users\\x\\Sound FX\\Notification t1_02.wav";
  const premiere =
    "file:///C:/Users/x/Sound%20FX/Notification%20t1_02.wav";
  assert.equal(normalizeMediaPath(disk), normalizeMediaPath(premiere));
});

test("clip name matches with or without .wav", () => {
  assert.equal(namesMatch("Notification t1_02.wav", "Notification t1_02"), true);
  assert.equal(namesMatch("Notification t1_02.WAV", "notification t1_02.wav"), true);
  assert.equal(namesMatch("Notification t1_02.wav", "Notification t1_03.wav"), false);
});
