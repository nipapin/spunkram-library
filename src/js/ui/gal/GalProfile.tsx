import { useMemo, useState } from "react";
import { Infinity as InfinityIcon, Loader2, Plus, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  MAX_MOTIONFLOW_ACCOUNTS,
  type PrefSettings,
} from "@/lib/api/preferences";
import { getUserSystemData } from "@/lib/api/usp";
import { parseDeviceFingerprint } from "@/lib/api/market-api";
import {
  GAL_DEV_PLANS,
  galAccountPlanLabel,
  resolveGalAccountPlan,
  type GalAccountPlan,
} from "@/lib/utils/gal-plan";
import { isReleaseAdminEmail } from "@/api/update";
import { currentPackHost } from "@/lib/utils/pack-host";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
import { useGenerationsBalance } from "@/hooks/use-generations-balance";
import "./gal-settings.scss";
import "./gal-account.scss";

export function accountInitial(email?: string | null, name?: string | null): string {
  const source = (name || email || "?").trim();
  return source.charAt(0).toUpperCase() || "?";
}

function realMacHex(raw?: string): string | null {
  const hex = (raw || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  return hex.length === 12 ? hex : null;
}

function uniqueSessionDevices<
  T extends {
    id: string;
    ip: string;
    user_fingerprint: string;
    name?: string;
    current?: boolean;
  },
>(devices: T[], currentMac?: string): Array<T & { revokeIds: string[] }> {
  const parent = devices.map((_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };
  const byKey = new Map<string, number>();
  const addKey = (key: string, index: number) => {
    if (!key) return;
    const existing = byKey.get(key);
    if (existing == null) byKey.set(key, index);
    else union(existing, index);
  };

  devices.forEach((device, index) => {
    const fp = parseDeviceFingerprint(device.user_fingerprint || "");
    const mac = realMacHex(fp.mac);
    const ip = (device.ip || "").trim().toLowerCase();
    const name = (device.name || fp.user || "").trim().toLowerCase();
    if (mac) addKey(`mac:${mac}`, index);
    if (device.current && currentMac) {
      const localMac = realMacHex(currentMac);
      if (localMac) addKey(`mac:${localMac}`, index);
    }
    if (name && ip) addKey(`name-ip:${name}|${ip}`, index);
  });

  const groups = new Map<number, T[]>();
  devices.forEach((device, index) => {
    const root = find(index);
    const list = groups.get(root);
    if (list) list.push(device);
    else groups.set(root, [device]);
  });

  const currentMacHex = realMacHex(currentMac);
  const unique: Array<T & { revokeIds: string[] }> = [];
  for (const list of groups.values()) {
    const preferred =
      list.find((d) => d.current) ||
      list.find(
        (d) =>
          realMacHex(parseDeviceFingerprint(d.user_fingerprint).mac) ===
          currentMacHex,
      ) ||
      list[0];
    unique.push({
      ...preferred,
      current:
        list.some((d) => d.current) ||
        list.some(
          (d) =>
            realMacHex(parseDeviceFingerprint(d.user_fingerprint).mac) ===
            currentMacHex,
        ) ||
        preferred.current,
      revokeIds: [...new Set(list.map((d) => d.id).filter(Boolean))],
    });
  }
  unique.sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)));
  return unique;
}

export function GalProfile() {
  const {
    auth,
    prefs,
    setPrefs,
    subscription,
    revoke,
    savedAccounts,
    addAccount,
    switchAccount,
    removeSavedAccount,
    cancelLogin,
    confirmReplaceDevice,
    loginBusy,
    loginCode,
    loginDeviceLimit,
  } = useAuth();
  const gens = useGenerationsBalance();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const sys = useMemo(() => getUserSystemData(), []);
  const host = currentPackHost();
  const gensLimitLabel =
    gens.monthlyLimit != null ? String(gens.monthlyLimit) : "—";

  const otherAccounts = useMemo(
    () => savedAccounts.filter((a) => a.id !== auth.id),
    [savedAccounts, auth.id],
  );
  const canAddAccount = savedAccounts.length < MAX_MOTIONFLOW_ACCOUNTS;
  const showDeviceLimit = Boolean(loginBusy && loginDeviceLimit);
  const isAdmin = isReleaseAdminEmail(auth.email);

  const galPlan = useMemo(
    () =>
      resolveGalAccountPlan({
        subscribed: subscription.subscribed,
        purchases: subscription.purchases,
        host,
      }),
    [subscription.subscribed, subscription.purchases, host],
  );

  function patch(partial: Partial<PrefSettings>) {
    setPrefs({ ...prefs, ...partial });
  }

  function setAdminDevPlan(plan: GalAccountPlan) {
    patch({ adminDevPlan: plan });
  }

  const sessionDevices = useMemo(
    () => uniqueSessionDevices(subscription.devices, sys.mac),
    [subscription.devices, sys.mac],
  );

  async function handleAddAccount() {
    if (!canAddAccount) {
      setMessage(`You can save up to ${MAX_MOTIONFLOW_ACCOUNTS} accounts.`);
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await addAccount();
    setBusy(false);
    setReplacingId(null);
    if (!result.ok) setMessage(result.message || "Could not add account");
    else setMessage(result.message || "Account added");
  }

  async function handleSwitchAccount(id: string) {
    setBusy(true);
    setMessage(null);
    const result = await switchAccount(id);
    setBusy(false);
    setMessage(
      result.ok
        ? result.message || "Switched account"
        : result.message || "Switch failed",
    );
  }

  async function handleRemoveAccount(id: string) {
    setBusy(true);
    setMessage(null);
    const result = await removeSavedAccount(id);
    setBusy(false);
    setMessage(result.ok ? "Account removed" : result.message || "Remove failed");
  }

  function handleRevokeAndContinue(deviceId: string) {
    setReplacingId(deviceId);
    setMessage("Disconnecting device and finishing sign-in…");
    confirmReplaceDevice(deviceId);
  }

  async function handleRevoke(ids: string[]) {
    setBusy(true);
    setMessage(null);
    let lastError: string | null = null;
    for (const id of ids) {
      const result = await revoke(id);
      if (!result.ok) lastError = result.message || "Revoke failed";
    }
    setBusy(false);
    if (lastError) setMessage(lastError);
  }

  const statusLabel = subscription.error
    ? "Error"
    : galAccountPlanLabel(galPlan);
  const planAccent = !subscription.error && galPlan !== "free";

  return (
    <div className="gal-settings gal-settings--embedded">
      <div className="gal-settings__body">
        <header className="gal-settings__page-head">
          <h1 className="gal-settings__page-title">Profile</h1>
        </header>

        <section className="gal-account__profile">
          <div className="gal-account__avatar-wrap">
            <div className="gal-account__avatar">
              {accountInitial(auth.email, auth.name)}
            </div>
            <span className="gal-account__dot" aria-hidden />
          </div>
          <div className="gal-account__profile-copy">
            <p className="gal-account__email">{auth.email || "Signed in"}</p>
            <p className="gal-account__status">
              Plan{" "}
              <span
                className={
                  planAccent
                    ? "gal-account__status-value"
                    : "gal-account__status-value gal-account__status-value--muted"
                }
              >
                {statusLabel}
              </span>
            </p>
            {isAdmin ? (
              <div className="gal-account__dev-plan">
                <span
                  className="gal-account__plan-switch"
                  role="group"
                  aria-label="Dev plan"
                >
                  {GAL_DEV_PLANS.map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      className={
                        prefs.adminDevPlan === plan
                          ? "gal-account__plan-chip is-active"
                          : "gal-account__plan-chip"
                      }
                      onClick={() => setAdminDevPlan(plan)}
                    >
                      {galAccountPlanLabel(plan)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={
                      !prefs.adminDevPlan
                        ? "gal-account__plan-chip is-active"
                        : "gal-account__plan-chip"
                    }
                    onClick={() => patch({ adminDevPlan: "" })}
                  >
                    Live
                  </button>
                </span>
                <p className="gal-account__dev-hint">Dev test · local only</p>
              </div>
            ) : null}
          </div>
        </section>

        {message ? <p className="gal-account__msg">{message}</p> : null}

        <section className="gal-settings__block gal-account__gens">
          <div className="gal-settings__block-head">
            <h2>
              <Sparkles className="size-3.5" strokeWidth={2.25} />
              AI Generations
            </h2>
            <button
              type="button"
              className="gal-settings__ghost-btn"
              onClick={() => openMotionflowSubscribe()}
            >
              <Plus className="size-3" />
              Get more
            </button>
          </div>
          <div className="gal-account__gens-row">
            <span className="gal-account__gens-total">{gens.totalLeft}</span>
            <div className="gal-account__gens-legend">
              <span>
                {gens.monthly}/{gensLimitLabel}{" "}
                {gens.isFreeUser ? "free plan" : "monthly"}
              </span>
              {!gens.isFreeUser ? (
                <span className="gal-account__gens-extra">
                  <InfinityIcon className="size-3" />
                  {gens.extra} extra
                </span>
              ) : null}
            </div>
          </div>
          {gens.monthlyLimit == null ? (
            <p className="gal-settings__note">
              No Gal generation allotment yet. Credits appear after the server
              grants them to this account.
            </p>
          ) : null}
        </section>

        <section className="gal-settings__block">
          <div className="gal-settings__block-head">
            <h2>Accounts</h2>
            <button
              type="button"
              className="gal-settings__ghost-btn"
              disabled={busy || loginBusy || !canAddAccount}
              title={
                canAddAccount
                  ? "Add another Motionflow account"
                  : `Maximum ${MAX_MOTIONFLOW_ACCOUNTS} accounts`
              }
              onClick={() => void handleAddAccount()}
            >
              {loginBusy && !showDeviceLimit ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
              Add
            </button>
          </div>

          {showDeviceLimit ? (
            <div className="gal-settings__login-panel">
              <p className="gal-settings__note">
                This account is signed in on {loginDeviceLimit!.device_limit}{" "}
                devices. Disconnect one to continue here.
              </p>
              <ul className="gal-settings__devices">
                {loginDeviceLimit!.devices.map((device) => {
                  const fp = parseDeviceFingerprint(device.user_fingerprint || "");
                  const disconnectBusy = replacingId === device.id;
                  return (
                    <li key={device.id}>
                      <div>
                        <strong>{device.name || fp.user || "Device"}</strong>
                        <span>{device.ip || "—"}</span>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(replacingId)}
                        onClick={() => handleRevokeAndContinue(device.id)}
                      >
                        {disconnectBusy ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Disconnect"
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="gal-settings__ghost-btn gal-settings__ghost-btn--block"
                onClick={cancelLogin}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {loginBusy && loginCode && !showDeviceLimit ? (
            <div className="gal-settings__login-panel">
              <p className="gal-settings__note">Confirm this code in the browser</p>
              <p className="gal-settings__login-code">{loginCode}</p>
              <p className="gal-settings__note gal-settings__note--row">
                <Loader2 className="size-3 animate-spin" />
                Waiting for confirmation…
              </p>
              <button
                type="button"
                className="gal-settings__ghost-btn gal-settings__ghost-btn--block"
                onClick={cancelLogin}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {!loginBusy ? (
            otherAccounts.length === 0 ? (
              <p className="gal-settings__note">No other accounts saved</p>
            ) : (
              <ul className="gal-settings__devices">
                {otherAccounts.map((account) => (
                  <li key={account.id}>
                    <div className="gal-settings__account-row">
                      <span className="gal-settings__account-avatar" aria-hidden>
                        {accountInitial(account.email, account.name)}
                      </span>
                      <div>
                        <strong>{account.name || account.email}</strong>
                        <span>{account.email}</span>
                      </div>
                    </div>
                    <div className="gal-settings__account-actions">
                      <button
                        type="button"
                        disabled={busy || loginBusy}
                        onClick={() => void handleSwitchAccount(account.id)}
                      >
                        Switch
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        disabled={busy || loginBusy}
                        onClick={() => void handleRemoveAccount(account.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>

        <section className="gal-settings__block">
          <h2>Active Devices</h2>
          {sessionDevices.length === 0 ? (
            <p className="gal-settings__note">No devices listed</p>
          ) : (
            <ul className="gal-settings__devices">
              {sessionDevices.map((device) => {
                const fp = parseDeviceFingerprint(device.user_fingerprint || "");
                return (
                  <li key={device.id || device.ip}>
                    <div>
                      <strong>{device.name || fp.user || "Device"}</strong>
                      <span>
                        {device.ip}
                        {device.current ? " · This device" : ""}
                      </span>
                    </div>
                    {!device.current ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRevoke(device.revokeIds)}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
