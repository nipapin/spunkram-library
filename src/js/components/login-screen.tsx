import { useState } from "react";
import { ExternalLink, Loader2, LogIn, Monitor, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { FogBackground } from "@/components/fog-background";
import logo from "@/assets/logo.png";
import { BRAND } from "@brands";
import type { MotionflowAccountSession } from "@/lib/api/preferences";

const ACCENT_PILL = "pill-brand";

function accountInitial(account: MotionflowAccountSession): string {
  const source = (account.name || account.email || "?").trim();
  return source.charAt(0).toUpperCase() || "?";
}

function deviceLabel(name?: string, fingerprint?: string): string {
  if (name?.trim()) return name.trim();
  if (!fingerprint) return "Unknown device";
  try {
    const parsed = JSON.parse(fingerprint) as { user?: string; os?: string };
    const parts = [parsed.user, parsed.os].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  } catch {
    /* ignore */
  }
  return "Unknown device";
}

export function LoginScreen() {
  const {
    loginWithMotionflow,
    switchAccount,
    cancelLogin,
    confirmReplaceDevice,
    loginBusy,
    loginCode,
    loginDeviceLimit,
    savedAccounts,
  } = useAuth();
  const [message, setMessage] = useState<{
    tone: "error" | "info" | "success";
    text: string;
  } | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const showChooser = savedAccounts.length > 0 && !loginBusy;
  const showDeviceLimit = Boolean(loginBusy && loginDeviceLimit);

  async function handleSignIn() {
    setMessage({ tone: "info", text: "Opening browser to sign in…" });
    const result = await loginWithMotionflow();
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message || "Sign in failed" });
      return;
    }
    setMessage({ tone: "success", text: result.message || "Signed in" });
  }

  async function handlePickAccount(account: MotionflowAccountSession) {
    setMessage(null);
    setSwitchingId(account.id);
    const result = await switchAccount(account.id);
    setSwitchingId(null);
    if (!result.ok) {
      setMessage({
        tone: "error",
        text: result.message || "Could not switch account — try signing in again",
      });
    }
  }

  function handleRevokeAndContinue(deviceId: string) {
    setReplacingId(deviceId);
    setMessage({ tone: "info", text: "Disconnecting device and finishing sign-in…" });
    confirmReplaceDevice(deviceId);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-hidden px-6 text-foreground">
      <FogBackground className="pointer-events-none absolute inset-0 z-0" />

      <div className="relative z-10 flex w-full max-w-xs flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-b from-primary to-primary/70 shadow-[0_0_20px_2px] shadow-primary/50 ring-1 ring-inset ring-white/15">
            <img src={logo} alt={BRAND.authorName} width={48} height={48} className="size-11 object-contain" />
          </div>
          <div>
            <h1 className="font-headline text-lg font-semibold tracking-tight drop-shadow-[0_1px_8px_rgba(0,0,0,0.65)]">
              {showDeviceLimit
                ? "Device limit reached"
                : showChooser
                  ? "Choose an account"
                  : `Welcome to ${BRAND.authorName}`}
            </h1>
            <p className="mt-1 max-w-xs text-[11px] text-muted-foreground drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
              {showDeviceLimit
                ? `This account is signed in on ${loginDeviceLimit!.device_limit} devices. Disconnect one to continue here.`
                : showChooser
                  ? "Continue with a saved Motionflow account, or add another."
                  : `Sign in with your Motionflow account to use the ${BRAND.authorName} extension — packs, subscriptions, and AI tools.`}
            </p>
          </div>
        </div>

        {message && !showDeviceLimit && (
          <div
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-[11px] backdrop-blur-md",
              message.tone === "error" &&
                "border-destructive/40 bg-destructive/20 text-destructive",
              message.tone === "success" &&
                "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
              message.tone === "info" &&
                "border-white/10 bg-card/70 text-muted-foreground",
            )}
          >
            {message.text}
          </div>
        )}

        {showDeviceLimit ? (
          <div className="w-full overflow-hidden rounded-xl border border-amber-500/30 bg-card/80 backdrop-blur-md">
            <ul>
              {loginDeviceLimit!.devices.map((device, index) => {
                const busy = replacingId === device.id;
                return (
                  <li
                    key={device.id}
                    className={cn(index > 0 && "border-t border-white/5")}
                  >
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                        <Monitor className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {deviceLabel(device.name, device.user_fingerprint)}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {device.ip || "—"}
                          {device.last_seen_at
                            ? ` · ${new Date(device.last_seen_at).toLocaleDateString()}`
                            : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={Boolean(replacingId)}
                        onClick={() => handleRevokeAndContinue(device.id)}
                        className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[10px] font-medium text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Disconnect"
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {loginBusy && loginCode && !showDeviceLimit && (
          <div className="w-full rounded-xl border border-primary/30 bg-card/70 px-3 py-3 text-center backdrop-blur-md">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Confirm this code in the browser
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-widest text-foreground">
              {loginCode}
            </p>
            <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Waiting for confirmation…
            </p>
          </div>
        )}

        {showChooser && (
          <ul className="w-full overflow-hidden rounded-xl border border-white/10 bg-card/70 backdrop-blur-md">
            {savedAccounts.map((account, index) => {
              const busy = switchingId === account.id;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    disabled={Boolean(switchingId)}
                    onClick={() => void handlePickAccount(account)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                      "hover:bg-white/5 disabled:opacity-60",
                      index > 0 && "border-t border-white/5",
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        accountInitial(account)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {account.name || account.email}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {account.email}
                      </span>
                    </span>
                    <UserRound className="size-3.5 shrink-0 text-muted-foreground/60" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex w-full flex-col gap-2">
          {loginBusy ? (
            <button
              type="button"
              onClick={cancelLogin}
              disabled={Boolean(replacingId)}
              className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-card/70 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-md transition-colors hover:bg-card disabled:opacity-50"
            >
              Cancel
            </button>
          ) : showChooser ? (
            <button
              type="button"
              disabled={Boolean(switchingId)}
              onClick={() => void handleSignIn()}
              className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-card/70 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-md transition-colors hover:bg-card disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              Use another account
              <ExternalLink className="size-3 opacity-70" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignIn()}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium",
                ACCENT_PILL,
              )}
            >
              <LogIn className="size-3.5" />
              Sign in to {BRAND.authorName}
              <ExternalLink className="size-3 opacity-70" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
