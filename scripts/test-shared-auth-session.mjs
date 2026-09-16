import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authVaultFingerprint,
  shouldKeepSharedSession,
} from "../src/js/lib/api/shared-auth-session.ts";

test("same vault fingerprint for AE and Premiere reading the same file", () => {
  const snapshot = {
    token: "mfcep_aaa",
    id: "user_1",
    activeId: "user_1",
    accounts: [{ id: "user_1", token: "mfcep_aaa" }],
  };
  assert.equal(authVaultFingerprint(snapshot), authVaultFingerprint({ ...snapshot }));
});

test("token rotation on one host changes the shared fingerprint", () => {
  const before = authVaultFingerprint({
    token: "mfcep_old",
    id: "user_1",
    activeId: "user_1",
  });
  const after = authVaultFingerprint({
    token: "mfcep_new",
    id: "user_1",
    activeId: "user_1",
  });
  assert.notEqual(before, after);
});

test("stale WS token does not wipe a newer shared disk token", () => {
  assert.equal(
    shouldKeepSharedSession({
      failedToken: "mfcep_old",
      diskToken: "mfcep_new",
    }),
    true,
  );
});

test("real revoke still signs out when disk still has the failed token", () => {
  assert.equal(
    shouldKeepSharedSession({
      failedToken: "mfcep_dead",
      diskToken: "mfcep_dead",
    }),
    false,
  );
  assert.equal(
    shouldKeepSharedSession({
      failedToken: "mfcep_dead",
      diskToken: "",
    }),
    false,
  );
});
