import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretDeviceAuthTokenResponse } from "../src/js/api/interpret-device-auth-poll.ts";

const devices = [
  {
    id: "dev_1",
    ip: "1.1.1.1",
    user_fingerprint: "{}",
    name: "Office PC",
  },
];

test("200 status:device_limit shows the picker even without error code", () => {
  const result = interpretDeviceAuthTokenResponse({
    httpStatus: 200,
    data: {
      status: "device_limit",
      devices,
      device_limit: 3,
      message: "Device limit reached. Revoke another device to continue signing in.",
    },
  });
  assert.equal(result.status, "device_limit");
  if (result.status === "device_limit") {
    assert.equal(result.devices.length, 1);
    assert.equal(result.device_limit, 3);
  }
});

test("4xx DEVICE_LIMIT body is not treated as still-pending", () => {
  const result = interpretDeviceAuthTokenResponse({
    httpStatus: 409,
    data: {
      error: "DEVICE_LIMIT",
      message: "Device limit reached",
      devices,
      device_limit: 3,
    },
    error: "Device limit reached",
  });
  assert.equal(result.status, "device_limit");
});

test("message-only device limit is not left on Waiting for confirmation", () => {
  const result = interpretDeviceAuthTokenResponse({
    httpStatus: 409,
    data: { message: "Device limit reached" },
    error: "Device limit reached",
  });
  assert.equal(result.status, "device_limit");
  if (result.status === "device_limit") {
    assert.deepEqual(result.devices, []);
    assert.equal(result.device_limit, 3);
  }
});

test("rate-limited pending stays pending", () => {
  const result = interpretDeviceAuthTokenResponse({
    httpStatus: 429,
    data: {
      status: "pending",
      error: "RATE_LIMITED",
      message: "Too many polls. Slow down.",
    },
    error: "Too many polls. Slow down.",
  });
  assert.equal(result.status, "pending");
});

test("complete token still signs in", () => {
  const result = interpretDeviceAuthTokenResponse({
    httpStatus: 200,
    data: {
      status: "complete",
      token: "mfcep_abc",
      user: { id: "user_1", email: "a@b.c" },
    },
  });
  assert.equal(result.status, "complete");
});
