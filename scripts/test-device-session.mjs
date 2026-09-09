import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isThisMachineDevice,
  partitionLoginDevices,
  thisMachineDeviceIds,
} from "../src/js/lib/utils/device-session.ts";

const local = {
  mac: "AA:BB:CC:DD:EE:FF",
  user: "nipap",
  os: "Windows 11",
};

const self = {
  id: "dev_self",
  user_fingerprint: JSON.stringify({
    mac: "aa-bb-cc-dd-ee-ff",
    user: "nipap",
    os: "Windows 11",
  }),
};

const other = {
  id: "dev_other",
  user_fingerprint: JSON.stringify({
    mac: "11:22:33:44:55:66",
    user: "studio",
    os: "Windows 11",
  }),
};

test("logout ids include this machine even when current is omitted", () => {
  const ids = thisMachineDeviceIds(
    [
      { ...self, current: false },
      { ...other, current: false },
    ],
    local,
  );
  assert.deepEqual(ids, ["dev_self"]);
});

test("logout ids include current even when MAC is hashed", () => {
  const ids = thisMachineDeviceIds(
    [
      { id: "dev_cur", user_fingerprint: "abc123hashed", current: true },
      other,
    ],
    local,
  );
  assert.deepEqual(ids, ["dev_cur"]);
});

test("device_limit picker can drop this machine so login reuses the slot", () => {
  const { thisMachine, others } = partitionLoginDevices(
    [
      { ...self, current: false },
      { ...other, current: false },
    ],
    local,
  );
  assert.equal(thisMachine[0]?.id, "dev_self");
  assert.deepEqual(
    others.map((d) => d.id),
    ["dev_other"],
  );
});

test("unknown MAC is not treated as this machine", () => {
  assert.equal(isThisMachineDevice(self, { mac: "unknown" }), false);
  assert.deepEqual(thisMachineDeviceIds([self], { mac: "unknown" }), []);
});
