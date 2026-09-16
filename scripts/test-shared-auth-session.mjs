import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeAuthFromParts,
  authVaultFingerprint,
  brandAuthVaultsAreIsolated,
  brandSharedAuthVaultRelPath,
  resolveUnauthorizedAction,
  shouldKeepSharedSession,
  shouldWipeSharedVault,
} from "../src/js/lib/api/shared-auth-session.ts";

/** Keep in sync with `brands.config.ts` — tests cannot import that file (JSON assert). */
const CEP_BRANDS = [
  {
    id: "gal",
    apiClient: "gal-cep",
    prefsCompany: "Premiere Gal",
    prefsProduct: "Gal Toolkit MAX",
  },
  {
    id: "spunkram",
    apiClient: "spunkram-cep",
    prefsCompany: "Spunkram",
    prefsProduct: "Spunkram Library",
  },
];

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
  assert.equal(
    shouldWipeSharedVault({
      failedToken: "mfcep_old",
      diskToken: "mfcep_new",
    }),
    false,
  );
});

test("unknown 401 does not wipe a live shared vault", () => {
  assert.equal(
    shouldKeepSharedSession({
      failedToken: "",
      diskToken: "mfcep_live",
    }),
    true,
  );
  assert.equal(resolveUnauthorizedAction({ diskToken: "mfcep_live" }), "reload");
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
  assert.equal(
    resolveUnauthorizedAction({
      failedToken: "mfcep_dead",
      diskToken: "mfcep_dead",
    }),
    "wipe",
  );
});

test("sibling write after revoke event switches from wipe to reload", () => {
  assert.equal(
    resolveUnauthorizedAction({
      failedToken: "mfcep_old",
      diskToken: "mfcep_old",
    }),
    "wipe",
  );
  assert.equal(
    resolveUnauthorizedAction({
      failedToken: "mfcep_old",
      diskToken: "mfcep_new",
    }),
    "reload",
  );
});

test("recovers session from vault if motionflowAuth was cleared", () => {
  const recovered = activeAuthFromParts(
    {},
    {
      activeId: "user_1",
      accounts: [
        {
          id: "user_1",
          token: "mfcep_live",
          email: "a@b.c",
          name: "A",
        },
      ],
    },
  );
  assert.equal(recovered.token, "mfcep_live");
  assert.equal(recovered.id, "user_1");
  assert.equal(recovered.email, "a@b.c");
});

test("every brand has its own AE/Premiere vault and CEP client", () => {
  assert.ok(CEP_BRANDS.length >= 2);
  assert.equal(brandAuthVaultsAreIsolated(CEP_BRANDS), true);
  const gal = CEP_BRANDS.find((brand) => brand.id === "gal");
  const spunkram = CEP_BRANDS.find((brand) => brand.id === "spunkram");
  assert.ok(gal && spunkram);
  assert.notEqual(brandSharedAuthVaultRelPath(gal), brandSharedAuthVaultRelPath(spunkram));
  assert.notEqual(gal.apiClient, spunkram.apiClient);
});

test("keep-or-wipe rules are the same for Gal and Spunkram tokens", () => {
  for (const brand of CEP_BRANDS) {
    const oldToken = `mfcep_${brand.id}_old`;
    const newToken = `mfcep_${brand.id}_new`;
    assert.equal(
      resolveUnauthorizedAction({
        failedToken: oldToken,
        diskToken: newToken,
      }),
      "reload",
      brand.id,
    );
    assert.equal(
      resolveUnauthorizedAction({
        failedToken: oldToken,
        diskToken: oldToken,
      }),
      "wipe",
      brand.id,
    );
  }
});
