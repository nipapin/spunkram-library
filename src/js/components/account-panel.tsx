import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, Loader2, LogOut, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  openMotionflowContact,
  openMotionflowSubscribe,
} from "@/api/motionflow-auth";
import { fetchGenerationsStatus } from "@/api/credits";
import { getUserSystemData } from "@/lib/api/usp";
import { parseDeviceFingerprint } from "@/lib/api/market-api";
import type { MotionflowAccountSession } from "@/lib/api/preferences";
import { BRAND } from "@brands";
import "./account-panel.scss";

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function accountInitial(account: Pick<MotionflowAccountSession, "name" | "email">): string {
  const source = (account.name || account.email || "?").trim();
  return source.charAt(0).toUpperCase() || "?";
}

function Sheen() {
  return <span className="account-spunkram__sheen" aria-hidden />;
}

function parseFingerprint(raw: string): { mac?: string; user?: string; os?: string } {
  return parseDeviceFingerprint(raw || "");
}

/** 6-byte MAC as 12 hex chars. Hashed fingerprints (32+ hex) are not MACs. */
function realMacHex(raw?: string): string | null {
  const hex = (raw || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  return hex.length === 12 ? hex : null;
}

function sessionName(device: {
  name?: string;
  user_fingerprint: string;
}): string {
  const fp = parseFingerprint(device.user_fingerprint);
  return (device.name || fp.user || "").trim().toLowerCase();
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
    const fp = parseFingerprint(device.user_fingerprint);
    const mac = realMacHex(fp.mac);
    const ip = (device.ip || "").trim().toLowerCase();
    const name = sessionName(device);
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
      list.find((d) => realMacHex(parseFingerprint(d.user_fingerprint).mac) === currentMacHex) ||
      list.find((d) => realMacHex(parseFingerprint(d.user_fingerprint).mac)) ||
      list[0];
    unique.push({
      ...preferred,
      current:
        list.some((d) => d.current) ||
        list.some((d) => realMacHex(parseFingerprint(d.user_fingerprint).mac) === currentMacHex) ||
        preferred.current,
      revokeIds: [...new Set(list.map((d) => d.id).filter(Boolean))],
    });
  }

  unique.sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)));
  return unique;
}

function creditsFromStatus(
  status: {
    used?: number;
    remaining?: number;
    subscription_generations_left?: number;
    extra_generations_left?: number;
  },
  generationLimit: number | null,
): { monthlyLeft: number; extraLeft: number; used: number } {
  const monthlyLeft =
    typeof status.subscription_generations_left === "number"
      ? status.subscription_generations_left
      : typeof status.remaining === "number"
        ? status.remaining
        : generationLimit ?? 0;
  const extraLeft =
    typeof status.extra_generations_left === "number" ? status.extra_generations_left : 0;
  const used =
    typeof status.used === "number"
      ? status.used
      : generationLimit != null
        ? Math.max(0, generationLimit - monthlyLeft)
        : 0;
  return {
    monthlyLeft: Math.max(0, monthlyLeft),
    extraLeft: Math.max(0, extraLeft),
    used: Math.max(0, used),
  };
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="account-spunkram__kicker">{children}</p>;
}

export function AccountPanel({ onBack }: { onBack: () => void }) {
  const {
    auth,
    subscription,
    isFreeUser,
    generationLimit,
    logout,
    recheck,
    revoke,
    savedAccounts,
    switchAccount,
    addAccount,
    removeSavedAccount,
    loginBusy,
    loginCode,
    cancelLogin,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [credits, setCredits] = useState<{
    monthlyLeft: number;
    extraLeft: number;
    used: number;
  } | null>(null);
  const sys = useMemo(() => getUserSystemData(), []);
  const currentMac = sys.mac;

  const otherAccounts = useMemo(
    () => savedAccounts.filter((a) => a.id !== auth.id),
    [savedAccounts, auth.id],
  );
  const sessionDevices = useMemo(
    () => uniqueSessionDevices(subscription.devices, currentMac),
    [subscription.devices, currentMac],
  );

  useEffect(() => {
    let cancelled = false;
    fetchGenerationsStatus().then((status) => {
      if (cancelled || !status) return;
      setCredits(creditsFromStatus(status, generationLimit));
    });
    return () => {
      cancelled = true;
    };
  }, [generationLimit, subscription.subscribed]);

  async function handleRecheck() {
    setBusy(true);
    setMessage(null);
    const result = await recheck();
    const status = await fetchGenerationsStatus();
    if (status) setCredits(creditsFromStatus(status, generationLimit));
    setBusy(false);
    if (!result.ok) setMessage(result.message || "Recheck failed");
  }

  async function handleRevoke(deviceIds: string[]) {
    setBusy(true);
    setMessage(null);
    let lastError: string | null = null;
    for (const id of deviceIds) {
      if (!id) continue;
      const result = await revoke(id);
      if (!result.ok) lastError = result.message || "Revoke failed";
    }
    setBusy(false);
    if (lastError) setMessage(lastError);
  }

  async function handleSwitch(id: string) {
    setBusy(true);
    setMessage(null);
    const result = await switchAccount(id);
    setBusy(false);
    setMessage(result.ok ? result.message || "Switched account" : result.message || "Switch failed");
  }

  async function handleAddAccount() {
    setBusy(true);
    setMessage(null);
    const result = await addAccount();
    setBusy(false);
    if (!result.ok) setMessage(result.message || "Could not add account");
    else setMessage(result.message || "Account added");
  }

  async function handleRemove(id: string) {
    setBusy(true);
    setMessage(null);
    const result = await removeSavedAccount(id);
    setBusy(false);
    setMessage(result.ok ? "Account removed" : result.message || "Remove failed");
  }

  async function handleLogout() {
    setBusy(true);
    await logout();
    setBusy(false);
    onBack();
  }

  const renewLabel = formatDate(subscription.renews_at);
  const planName = subscription.error
    ? "Unavailable"
    : subscription.subscribed
      ? subscription.plan || "Editor"
      : "Free";
  const planStatus = subscription.error
    ? "Error"
    : subscription.subscribed
      ? "Active"
      : isFreeUser
        ? "Free"
        : "Inactive";
  const displayName = auth.name || auth.email || `${BRAND.authorName} user`;
  const isCancelled = (subscription.status || "").toLowerCase().includes("cancel");
  const monthlyLeft = credits?.monthlyLeft ?? 0;
  const extraLeft = credits?.extraLeft ?? 0;
  const usedCount = credits?.used ?? 0;
  const limitLabel = generationLimit != null ? String(generationLimit) : "—";
  const showExtra = !isFreeUser;
  const totalLeft = monthlyLeft + extraLeft;
  const monthlyCap = Math.max(0, generationLimit ?? 0);
  const monthlyPct =
    monthlyCap > 0 ? Math.min(100, (Math.max(monthlyLeft, 0) / monthlyCap) * 100) : 0;

  return (
    <div className="account-spunkram">
      <div className="account-spunkram__mesh" />
      <div className="account-spunkram__grid" />

      <div className="account-spunkram__body">
        <div className="account-spunkram__scroll">
          <div className="account-spunkram__stack">
            <section className="account-spunkram__card account-spunkram__card--profile">
              <Sheen />
              <div className="account-spunkram__inner account-spunkram__profile">
                <div className="account-spunkram__avatar">
                  {accountInitial({ name: auth.name, email: auth.email || "" })}
                </div>
                <div className="account-spunkram__profile-copy">
                  <h2 className="account-spunkram__name">{displayName}</h2>
                  {auth.email && <p className="account-spunkram__email">{auth.email}</p>}
                </div>
                <div className="account-spunkram__profile-actions">
                  <button
                    type="button"
                    className="account-btn account-btn--ghost account-btn--circle"
                    title="Refresh status"
                    aria-label="Refresh subscription"
                    disabled={busy}
                    onClick={() => void handleRecheck()}
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    className="account-btn account-btn--ghost account-btn--circle"
                    title="Sign out"
                    aria-label="Sign out"
                    disabled={busy || loginBusy}
                    onClick={() => void handleLogout()}
                  >
                    <LogOut className="size-3.5" />
                  </button>
                </div>
              </div>
            </section>

            {message && <p className="account-spunkram__msg">{message}</p>}

            {loginBusy && loginCode && (
              <section className="account-spunkram__card account-spunkram__card--compact">
                <Sheen />
                <div className="account-spunkram__inner account-spunkram__inner--center">
                  <Kicker>Confirm in browser</Kicker>
                  <p className="account-spunkram__code">{loginCode}</p>
                  <button type="button" className="account-btn account-btn--ghost account-btn--tiny" onClick={cancelLogin}>
                    Cancel
                  </button>
                </div>
              </section>
            )}

            <div className="account-spunkram__pair">
              <section className="account-spunkram__card account-spunkram__card--tile">
                <Sheen />
                <div className="account-spunkram__inner account-spunkram__tile">
                  <div className="account-spunkram__tile-head">
                    <Kicker>Plan</Kicker>
                    {subscription.subscribed ? (
                      <span
                        className={
                          isCancelled
                            ? "account-spunkram__badge account-spunkram__badge--amber"
                            : "account-spunkram__badge"
                        }
                      >
                        <Check className="size-3" strokeWidth={3} />
                        {isCancelled ? "Cancelled" : "Active"}
                      </span>
                    ) : null}
                  </div>
                  <div className="account-spunkram__tile-foot">
                    <p className="account-spunkram__tile-title">{planName}</p>
                    {subscription.error ? (
                      <p className="account-spunkram__sub">{subscription.error}</p>
                    ) : renewLabel ? (
                      <p className="account-spunkram__sub">until {renewLabel}</p>
                    ) : planStatus !== "Active" ? (
                      <p className="account-spunkram__sub">{planStatus}</p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="account-spunkram__card account-spunkram__card--tile">
                <Sheen />
                <div className="account-spunkram__inner account-spunkram__tile">
                  <div className="account-spunkram__tile-head">
                    <Kicker>Generations</Kicker>
                    <button
                      type="button"
                      className="account-btn account-btn--primary account-btn--tiny"
                      onClick={openMotionflowSubscribe}
                    >
                      <Plus className="size-3" strokeWidth={2.5} />
                      Add extra
                    </button>
                  </div>
                  <div>
                    <p className="account-spunkram__price">{totalLeft}</p>
                    <p className="account-spunkram__sub">
                      <span className="account-spunkram__legend-item">
                        <span className="account-spunkram__dot account-spunkram__dot--monthly" aria-hidden />
                        {monthlyLeft}/{limitLabel} monthly
                      </span>
                      {showExtra && extraLeft > 0 ? (
                        <span className="account-spunkram__legend-item">
                          <span className="account-spunkram__dot account-spunkram__dot--extra" aria-hidden />
                          {extraLeft} extra
                        </span>
                      ) : null}
                    </p>
                    <div className="account-spunkram__track">
                      {monthlyPct > 0 ? (
                        <div className="account-spunkram__fill account-spunkram__fill--monthly" style={{ width: `${monthlyPct}%` }} />
                      ) : null}
                    </div>
                    <div className="account-spunkram__usage">
                      <span>
                        {usedCount} used of {limitLabel} monthly
                        {showExtra && extraLeft > 0 ? ` · ${extraLeft} extra left` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {!subscription.subscribed && (
              <button type="button" className="account-btn account-btn--primary account-btn--block" onClick={openMotionflowSubscribe}>
                Subscribe from $9.9/mo
                <ArrowUpRight className="size-3.5" />
              </button>
            )}

            <section className="account-spunkram__card account-spunkram__card--compact">
              <Sheen />
              <div className="account-spunkram__inner">
                <div className="account-spunkram__tile-head">
                  <Kicker>Accounts</Kicker>
                  <button
                    type="button"
                    className="account-btn account-btn--ghost account-btn--tiny"
                    disabled={busy || loginBusy}
                    onClick={() => void handleAddAccount()}
                  >
                    {loginBusy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                    Add
                  </button>
                </div>
                {otherAccounts.length === 0 ? (
                  <p className="account-spunkram__empty">No other accounts saved</p>
                ) : (
                  otherAccounts.map((account) => (
                    <div key={account.id} className="account-spunkram__account">
                      <span className="account-spunkram__mini">{accountInitial(account)}</span>
                      <div className="account-spunkram__grow">
                        <p className="account-spunkram__device-name">{account.name || account.email}</p>
                        <p className="account-spunkram__device-meta">{account.email}</p>
                      </div>
                      <button
                        type="button"
                        className="account-btn account-btn--ghost account-btn--tiny"
                        disabled={busy || loginBusy}
                        onClick={() => void handleSwitch(account.id)}
                      >
                        Switch
                      </button>
                      <button
                        type="button"
                        className="account-btn account-btn--ghost account-btn--tiny account-btn--danger"
                        disabled={busy || loginBusy}
                        onClick={() => void handleRemove(account.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="account-spunkram__card account-spunkram__card--compact">
              <Sheen />
              <div className="account-spunkram__inner">
                <Kicker>Sessions</Kicker>
                {sessionDevices.length === 0 ? (
                  <p className="account-spunkram__empty">No devices listed</p>
                ) : (
                  sessionDevices.map((device) => {
                    const fp = parseDeviceFingerprint(device.user_fingerprint || "");
                    const isCurrent = device.current || (fp.mac && fp.mac === currentMac);
                    const osHint = (fp.os || "").toLowerCase().includes("win")
                      ? "Windows"
                      : fp.os
                        ? "macOS"
                        : sys.os || "Device";
                    return (
                      <div
                        key={device.revokeIds.join("-") || device.id || `${device.ip}-${device.user_fingerprint}`}
                        className="account-spunkram__device"
                      >
                        <div className="account-spunkram__grow">
                          <p className="account-spunkram__device-name">
                            {device.name || fp.user || "Device"}
                            <span className="account-spunkram__os">{osHint}</span>
                          </p>
                          <p className="account-spunkram__device-meta">
                            {(fp.mac || "—") + " · " + (device.ip || "—")}
                          </p>
                        </div>
                        {isCurrent ? (
                          <span className="account-spunkram__current">This device</span>
                        ) : (
                          <button
                            type="button"
                            className="account-btn account-btn--ghost account-btn--tiny account-btn--danger"
                            disabled={busy}
                            onClick={() => void handleRevoke(device.revokeIds)}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="account-spunkram__card account-spunkram__card--compact">
              <Sheen />
              <div className="account-spunkram__inner">
                <div className="account-spunkram__tile-head">
                  <p className="account-spunkram__tile-title">Need any help?</p>
                  <button
                    type="button"
                    className="account-btn account-btn--ghost account-btn--tiny"
                    onClick={openMotionflowContact}
                  >
                    Contact
                    <ArrowUpRight className="size-3.5" />
                  </button>
                </div>
                <p className="account-spunkram__sub">
                  If you have a question or run into an issue, get in touch — we’ll help you resolve it.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
