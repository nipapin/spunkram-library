import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogOut,
  Monitor,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  openMotionflowManageSubscription,
  openMotionflowSubscribe,
} from "@/api/motionflow-auth";
import { getUserSystemData } from "@/lib/api/usp";
import { parseDeviceFingerprint } from "@/lib/api/market-api";
import type { MotionflowAccountSession } from "@/lib/api/preferences";

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

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
  const currentMac = useMemo(() => getUserSystemData().mac, []);

  const otherAccounts = useMemo(
    () => savedAccounts.filter((a) => a.id !== auth.id),
    [savedAccounts, auth.id],
  );

  async function handleRecheck() {
    setBusy(true);
    setMessage(null);
    const result = await recheck();
    setBusy(false);
    setMessage(result.ok ? "Subscription status updated" : result.message || "Recheck failed");
  }

  async function handleRevoke(deviceId: string) {
    setBusy(true);
    setMessage(null);
    const result = await revoke(deviceId);
    setBusy(false);
    if (!result.ok) setMessage(result.message || "Revoke failed");
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-2.5 py-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <h2 className="text-xs font-semibold text-foreground">Account</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {message && (
          <div className="mb-3 rounded-lg border border-white/10 bg-secondary/50 px-2.5 py-2 text-[11px] text-muted-foreground">
            {message}
          </div>
        )}

        {loginBusy && loginCode && (
          <div className="mb-3 rounded-xl border border-primary/30 bg-card/60 px-3 py-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Confirm this code in the browser
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-widest text-foreground">
              {loginCode}
            </p>
            <button
              type="button"
              onClick={cancelLogin}
              className="mt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}

        <section className="mb-3 rounded-xl border border-white/10 bg-card/60 p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Profile
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {accountInitial({ name: auth.name, email: auth.email || "" })}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium text-foreground">
                {auth.name || auth.email || "Spunkram user"}
              </p>
              {auth.email && (
                <p className="truncate text-[11px] text-muted-foreground">{auth.email}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="Log out"
              title="Log out"
              disabled={busy || loginBusy}
              onClick={() => void handleLogout()}
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-secondary/70 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </section>

        <section className="mb-3 rounded-xl border border-white/10 bg-card/60 p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Saved accounts
          </h3>
          <ul className="mb-2 space-y-1">
            {otherAccounts.length === 0 ? (
              <li className="rounded-lg border border-white/5 bg-background/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                No other accounts saved yet
              </li>
            ) : (
              otherAccounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center gap-2 rounded-lg border border-white/5 bg-background/30 px-2.5 py-2"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-foreground">
                    {accountInitial(account)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-foreground">
                      {account.name || account.email}
                    </div>
                    <div className="truncate text-[9px] text-muted-foreground">{account.email}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || loginBusy}
                    onClick={() => void handleSwitch(account.id)}
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50"
                  >
                    Switch
                  </button>
                  <button
                    type="button"
                    disabled={busy || loginBusy}
                    aria-label={`Remove ${account.email}`}
                    title="Remove"
                    onClick={() => void handleRemove(account.id)}
                    className="flex size-6 items-center justify-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            disabled={busy || loginBusy}
            onClick={() => void handleAddAccount()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50"
          >
            {loginBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Add account
            <ExternalLink className="size-3 opacity-70" />
          </button>
        </section>

        <section className="mb-3 rounded-xl border border-white/10 bg-card/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Spunkram subscription
            </h3>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRecheck()}
              className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Refresh
            </button>
          </div>

          {subscription.error ? (
            <p className="text-xs font-medium text-destructive">{subscription.error}</p>
          ) : subscription.subscribed ? (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs text-foreground">
                <CheckCircle2 className="size-3.5 text-emerald-400" />
                <strong>{subscription.plan || "Pro"}</strong>
                <span className="text-muted-foreground">· active</span>
              </p>
              {renewLabel && (
                <p className="text-[11px] text-muted-foreground">
                  Renews {renewLabel}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {generationLimit} AI generations / month
              </p>
              <button
                type="button"
                onClick={openMotionflowManageSubscription}
                className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Manage subscription
                <ExternalLink className="size-3" />
              </button>
            </div>
          ) : isFreeUser ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs text-foreground">
                <strong>Free plan</strong>
                <span className="text-muted-foreground">· Spunkram</span>
              </p>
              <button
                type="button"
                onClick={openMotionflowSubscribe}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                  ACCENT_PILL,
                )}
              >
                Subscribe to Spunkram from $9.9/mo
                <ExternalLink className="size-3" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">No active subscription</p>
              <p className="text-[11px] text-muted-foreground">
                {generationLimit} AI generations (upgrade for full monthly quota)
              </p>
              <button
                type="button"
                onClick={openMotionflowSubscribe}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                  ACCENT_PILL,
                )}
              >
                Subscribe from $9.9/mo
                <ExternalLink className="size-3" />
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/10 bg-card/60 p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Connected devices
          </h3>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {subscription.devices.length === 0 ? (
              <li className="rounded-lg border border-white/5 bg-background/30 px-2.5 py-2 text-center text-[11px] text-muted-foreground">
                No devices listed
              </li>
            ) : (
              subscription.devices.map((device) => {
                const fp = parseDeviceFingerprint(device.user_fingerprint || "");
                const isCurrent =
                  device.current || (fp.mac && fp.mac === currentMac);
                const osHint = (fp.os || "").toLowerCase().includes("win")
                  ? "Win"
                  : fp.os
                    ? "Mac"
                    : "Device";
                return (
                  <li
                    key={device.id || `${device.ip}-${device.user_fingerprint}`}
                    className="flex items-center gap-2 rounded-lg border border-white/5 bg-background/30 px-2.5 py-2"
                  >
                    <Monitor className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-foreground">
                        {device.name || fp.user || "Device"} · {osHint}
                      </div>
                      <div className="truncate text-[9px] text-muted-foreground">
                        {(fp.mac || "—") + " · " + (device.ip || "—")}
                      </div>
                    </div>
                    {isCurrent ? (
                      <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-semibold text-primary">
                        Current
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRevoke(device.id)}
                        className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
