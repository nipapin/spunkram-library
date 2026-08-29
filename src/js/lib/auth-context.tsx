import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authErrorMessage } from "@/lib/api/market-api";
import { friendlyErrorMessage } from "@/utils/user-error";
import { onSessionExpired } from "@/lib/api/session";
import { cepWs } from "@/lib/cep-ws";
import {
  listAccountSessions,
  readMotionflowAuth,
  readPrefSettings,
  removeAccountSession,
  setActiveAccount,
  upsertAccountSession,
  writeMotionflowAuth,
  writePrefSettings,
  type MotionflowAccountSession,
  type MotionflowAuth,
  type PrefSettings,
} from "@/lib/api/preferences";
import {
  fetchMe,
  openVerificationUrl,
  pollDeviceAuth,
  replaceDeviceAuth,
  revokeMotionflowDevice,
  setSubscriptionUrls,
  startDeviceAuth,
  type DeviceLimitListItem,
  type MotionflowDevice,
  type MotionflowPurchase,
  type MotionflowSubscription,
} from "@/api/motionflow-auth";
import { fetchCepMarket, type CepMarketPayload } from "@/api/cep-market";
import { clearUserIdentity, setUserIdentity } from "@/api/user";
import { reportSupportError } from "@/api/support";
import { reportClientSession, reportInstalledPacks } from "@/api/telemetry";
import { currentHostAppId } from "@/lib/utils/apply-item";
import {
  resolveAccessTier,
  resolveFreePackSlots,
  resolveGenerationLimit,
  type AccessTier,
} from "@brands";

type AuthStatus = {
  subscribed: boolean;
  plan?: string;
  status?: string;
  renews_at?: string;
  purchases: MotionflowPurchase[];
  devices: MotionflowDevice[];
  tier?: string;
  aiGenerationsLimit?: number;
  freePackSlots?: number;
  error?: string;
};

type AuthActionResult = { ok: boolean; message?: string };

type AuthContextValue = {
  prefs: PrefSettings;
  setPrefs: (next: PrefSettings) => void;
  updatePrefs: (patch: Partial<PrefSettings>) => void;
  auth: MotionflowAuth;
  signedIn: boolean;
  /** True after first auth hydrate attempt finishes. */
  authReady: boolean;
  subscription: AuthStatus;
  /**
   * From server `/me`, mapped through this author's access model in brands.config.
   * `free` = unpaid for this author (no sub; packs only count if the brand allows).
   */
  accessTier: AccessTier;
  isFreeUser: boolean;
  /** Monthly AI generation allotment from server entitlements (`null` until `/api/cep/me`). */
  generationLimit: number | null;
  /** Free pack slots from server entitlements (`null` until `/api/cep/me`). */
  freePackSlots: number | null;
  market: CepMarketPayload | null;
  marketLoading: boolean;
  marketError: string | null;
  refreshMarket: (force?: boolean) => Promise<void>;
  /** Saved accounts (newest lastUsedAt first), for Chrome-style chooser. */
  savedAccounts: MotionflowAccountSession[];
  loginWithMotionflow: () => Promise<AuthActionResult>;
  /** Alias — same device-code flow; upserts into vault. */
  addAccount: () => Promise<AuthActionResult>;
  switchAccount: (id: string) => Promise<AuthActionResult>;
  removeSavedAccount: (id: string) => Promise<AuthActionResult>;
  cancelLogin: () => void;
  /** While device_limit: pick a device to revoke and finish login. */
  confirmReplaceDevice: (deviceId: string) => void;
  loginBusy: boolean;
  loginCode: string | null;
  /** Devices to pick from when at the account device limit. */
  loginDeviceLimit: {
    devices: DeviceLimitListItem[];
    device_limit: number;
  } | null;
  logout: () => Promise<void>;
  recheck: () => Promise<AuthActionResult>;
  revoke: (deviceId: string) => Promise<AuthActionResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function hostPrimaryType(): "AE" | "PR" {
  const host = currentHostAppId();
  if (host === "PPRO") return "PR";
  return "AE";
}

function toAuthStatus(
  sub?: MotionflowSubscription,
  devices: MotionflowDevice[] = [],
  purchases: MotionflowPurchase[] = [],
  extra?: {
    tier?: string;
    aiGenerationsLimit?: number;
    freePackSlots?: number;
    error?: string;
  },
): AuthStatus {
  return {
    subscribed: Boolean(sub?.active),
    plan: sub?.plan || undefined,
    status: sub?.status || undefined,
    renews_at: sub?.renews_at || undefined,
    purchases,
    devices,
    tier: extra?.tier,
    aiGenerationsLimit: extra?.aiGenerationsLimit,
    freePackSlots: extra?.freePackSlots,
    error: extra?.error,
  };
}

function syncAiIdentity(auth: MotionflowAuth): void {
  if (auth.token && (auth.id || auth.email)) {
    setUserIdentity({
      id: auth.id || "",
      email: auth.email,
      name: auth.name || auth.email,
      token: auth.token,
    });
  } else {
    clearUserIdentity();
  }
}

function authFromSession(session: MotionflowAccountSession): MotionflowAuth {
  return {
    token: session.token,
    id: session.id,
    email: session.email,
    name: session.name,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<PrefSettings>(() => readPrefSettings());
  const [auth, setAuth] = useState<MotionflowAuth>(() => {
    const stored = readMotionflowAuth();
    syncAiIdentity(stored);
    return stored;
  });
  const [savedAccounts, setSavedAccounts] = useState<MotionflowAccountSession[]>(() =>
    listAccountSessions(),
  );
  const [subscription, setSubscription] = useState<AuthStatus>({
    subscribed: false,
    purchases: [],
    devices: [],
  });
  const [market, setMarket] = useState<CepMarketPayload | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketLoaded, setMarketLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginCode, setLoginCode] = useState<string | null>(null);
  const [loginDeviceLimit, setLoginDeviceLimit] = useState<{
    devices: DeviceLimitListItem[];
    device_limit: number;
  } | null>(null);
  const loginAbortRef = useRef(false);
  const devicePickResolverRef = useRef<((deviceId: string | null) => void) | null>(
    null,
  );

  const refreshSavedAccounts = useCallback(() => {
    setSavedAccounts(listAccountSessions());
  }, []);

  const setPrefs = useCallback((next: PrefSettings) => {
    setPrefsState(next);
    writePrefSettings(next);
  }, []);

  const updatePrefs = useCallback((patch: Partial<PrefSettings>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      writePrefSettings(next);
      return next;
    });
  }, []);

  const applySession = useCallback(
    (next: MotionflowAuth, status: AuthStatus) => {
      setAuth(next);
      if (next.token && next.id && next.email) {
        upsertAccountSession({
          id: next.id,
          email: next.email,
          name: next.name,
          token: next.token,
        });
      } else {
        writeMotionflowAuth(next);
      }
      setSubscription(status);
      syncAiIdentity(next);
      refreshSavedAccounts();
    },
    [refreshSavedAccounts],
  );

  const clearSessionLocal = useCallback(() => {
    try {
      cepWs.stop();
    } catch {
      /* ignore */
    }
    setSubscriptionUrls({});
    setAuth({});
    writeMotionflowAuth({});
    syncAiIdentity({});
    setSubscription(toAuthStatus());
    setMarket(null);
    setMarketLoaded(false);
    refreshSavedAccounts();
  }, [refreshSavedAccounts]);

  useEffect(() => {
    return onSessionExpired(() => {
      clearSessionLocal();
      refreshSavedAccounts();
    });
  }, [clearSessionLocal, refreshSavedAccounts]);

  const refreshProfile = useCallback(
    async (token: string, opts?: { removeAccountIdOnUnauthorized?: string }) => {
      const host = currentHostAppId();
      const hostType =
        host === "AEFT" ? ("AE" as const) : host === "PPRO" ? ("PR" as const) : null;
      const { data, error } = await fetchMe(token, { host: hostType });
      if (!data) {
        if (error === "UNAUTHORIZED") {
          if (opts?.removeAccountIdOnUnauthorized) {
            const vault = removeAccountSession(opts.removeAccountIdOnUnauthorized);
            refreshSavedAccounts();
            if (vault.activeId) {
              const next = vault.accounts.find((a) => a.id === vault.activeId);
              if (next) {
                const activated = setActiveAccount(next.id);
                if (activated) {
                  syncAiIdentity(authFromSession(activated));
                  setAuth(authFromSession(activated));
                  const recovered = await refreshProfile(activated.token, {
                    removeAccountIdOnUnauthorized: activated.id,
                  });
                  return recovered;
                }
              }
            }
          }
          clearSessionLocal();
          setSubscription(
            toAuthStatus(undefined, [], [], {
              error: "Session expired — please sign in again",
            }),
          );
          return { ok: false as const, message: "Session expired — please sign in again" };
        }
        const msg = error || "Unable to refresh profile";
        setSubscription((prev) => ({ ...prev, error: msg }));
        if (error !== "NO_CONNECTION" && error !== "TIMEOUT" && error !== "NO_SUCCESS_LOAD") {
          reportSupportError("auth.refresh_profile", msg, {
            error_code: error || null,
          });
        }
        return { ok: false as const, message: msg };
      }
      const nextAuth: MotionflowAuth = {
        token,
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
      };
      setSubscriptionUrls({
        subscribe: data.subscribe_url,
        manage: data.manage_subscription_url,
      });
      applySession(
        nextAuth,
        toAuthStatus(data.subscription, data.devices ?? [], data.purchases ?? [], {
          tier: data.tier,
          aiGenerationsLimit: data.entitlements?.ai_generations_limit,
          freePackSlots: data.entitlements?.free_pack_slots,
        }),
      );
      void reportClientSession();
      void reportInstalledPacks();
      return { ok: true as const };
    },
    [applySession, clearSessionLocal, refreshSavedAccounts],
  );

  const refreshMarket = useCallback(
    async (force = false) => {
      if (marketLoaded && !force && market) return;
      setMarketLoading(true);
      setMarketError(null);
      const { data, error } = await fetchCepMarket(hostPrimaryType());
      if (error || !data) {
        const msg =
          error === "UNAUTHORIZED"
            ? "Please sign in again"
            : friendlyErrorMessage(authErrorMessage(error) || error || "Unable to load market");
        setMarketError(msg);
        if (
          error !== "UNAUTHORIZED" &&
          error !== "NO_CONNECTION" &&
          error !== "TIMEOUT" &&
          error !== "NO_SUCCESS_LOAD"
        ) {
          reportSupportError("auth.refresh_market", msg, {
            error_code: error || null,
          });
        }
        setMarketLoading(false);
        return;
      }
      if (data.subscribe_url) {
        setSubscriptionUrls({ subscribe: data.subscribe_url });
      }
      setMarket(data);
      setMarketLoaded(true);
      setMarketLoading(false);
      void reportInstalledPacks();
    },
    [market, marketLoaded],
  );

  const finishDeviceLogin = useCallback(
    async (token: string, user: { id: string; email: string; name?: string }) => {
      const nextAuth: MotionflowAuth = {
        token,
        id: user.id,
        email: user.email,
        name: user.name,
      };
      upsertAccountSession({
        id: nextAuth.id!,
        email: nextAuth.email!,
        name: nextAuth.name,
        token: nextAuth.token!,
      });
      setAuth(nextAuth);
      syncAiIdentity(nextAuth);
      refreshSavedAccounts();
      const profile = await refreshProfile(token);
      setLoginBusy(false);
      setLoginCode(null);
      setLoginDeviceLimit(null);
      await refreshMarket(true);
      return profile.ok
        ? { ok: true as const, message: "Signed in to Motionflow" }
        : { ok: true as const, message: profile.message || "Signed in" };
    },
    [refreshMarket, refreshProfile, refreshSavedAccounts],
  );

  const runDeviceCodeLogin = useCallback(async (): Promise<AuthActionResult> => {
    loginAbortRef.current = false;
    setLoginBusy(true);
    setLoginCode(null);
    setLoginDeviceLimit(null);
    if (devicePickResolverRef.current) {
      devicePickResolverRef.current(null);
      devicePickResolverRef.current = null;
    }

    const started = await startDeviceAuth();
    if ("error" in started) {
      setLoginBusy(false);
      if (
        started.error !== "NO_CONNECTION" &&
        started.error !== "TIMEOUT" &&
        started.error !== "NO_SUCCESS_LOAD" &&
        !/^HTTP\s*4\d\d/i.test(started.error)
      ) {
        reportSupportError("auth.device_start", started.error);
      }
      return { ok: false, message: started.error };
    }

    const { code, device_code, verification_url, interval, expires_in } = started.data;
    setLoginCode(code);
    openVerificationUrl(verification_url);

    const deadline = Date.now() + expires_in * 1000;
    const firstDelayMs = interval * 1000;

    await new Promise((r) => setTimeout(r, firstDelayMs));

    while (!loginAbortRef.current && Date.now() < deadline) {
      const result = await pollDeviceAuth(code, { device_code });
      if (loginAbortRef.current) break;

      if (result.status === "complete") {
        return finishDeviceLogin(result.token, result.user);
      }

      if (result.status === "device_limit") {
        setLoginDeviceLimit({
          devices: result.devices,
          device_limit: result.device_limit,
        });
        const revokeId = await new Promise<string | null>((resolve) => {
          devicePickResolverRef.current = resolve;
        });
        devicePickResolverRef.current = null;
        if (!revokeId || loginAbortRef.current) {
          setLoginBusy(false);
          setLoginCode(null);
          setLoginDeviceLimit(null);
          return { ok: false, message: "Login cancelled" };
        }
        const replaced = await replaceDeviceAuth({
          code,
          device_code,
          revoke_device_id: revokeId,
        });
        if (replaced.status === "complete") {
          return finishDeviceLogin(replaced.token, replaced.user);
        }
        setLoginBusy(false);
        setLoginCode(null);
        setLoginDeviceLimit(null);
        return {
          ok: false,
          message: replaced.message || "Could not revoke device",
        };
      }

      if (result.status === "expired" || result.status === "denied") {
        setLoginBusy(false);
        setLoginCode(null);
        setLoginDeviceLimit(null);
        return { ok: false, message: result.message || `Login ${result.status}` };
      }

      await new Promise((r) => setTimeout(r, interval * 1000));
    }

    setLoginBusy(false);
    setLoginCode(null);
    setLoginDeviceLimit(null);
    if (loginAbortRef.current) {
      return { ok: false, message: "Login cancelled" };
    }
    return { ok: false, message: "Login timed out — try again" };
  }, [finishDeviceLogin]);

  const loginWithMotionflow = runDeviceCodeLogin;
  const addAccount = runDeviceCodeLogin;

  const cancelLogin = useCallback(() => {
    loginAbortRef.current = true;
    if (devicePickResolverRef.current) {
      devicePickResolverRef.current(null);
      devicePickResolverRef.current = null;
    }
    setLoginBusy(false);
    setLoginCode(null);
    setLoginDeviceLimit(null);
  }, []);

  const confirmReplaceDevice = useCallback((deviceId: string) => {
    if (devicePickResolverRef.current) {
      devicePickResolverRef.current(deviceId);
      devicePickResolverRef.current = null;
    }
  }, []);

  const switchAccount = useCallback(
    async (id: string): Promise<AuthActionResult> => {
      const activated = setActiveAccount(id);
      if (!activated) {
        return { ok: false, message: "Account not found" };
      }
      setAuth(authFromSession(activated));
      syncAiIdentity(authFromSession(activated));
      refreshSavedAccounts();
      setMarket(null);
      setMarketLoaded(false);
      const profile = await refreshProfile(activated.token, {
        removeAccountIdOnUnauthorized: activated.id,
      });
      if (!profile.ok) {
        return {
          ok: false,
          message: profile.message || "Session expired — sign in again",
        };
      }
      await refreshMarket(true);
      return { ok: true, message: `Switched to ${activated.email}` };
    },
    [refreshMarket, refreshProfile, refreshSavedAccounts],
  );

  const activateNextOrClear = useCallback(
    async (vaultActiveId: string | null, accounts: MotionflowAccountSession[]) => {
      if (vaultActiveId) {
        const next = accounts.find((a) => a.id === vaultActiveId);
        if (next) {
          const activated = setActiveAccount(next.id) || next;
          setAuth(authFromSession(activated));
          syncAiIdentity(authFromSession(activated));
          refreshSavedAccounts();
          setMarket(null);
          setMarketLoaded(false);
          const profile = await refreshProfile(activated.token, {
            removeAccountIdOnUnauthorized: activated.id,
          });
          if (profile.ok) await refreshMarket(true);
          return;
        }
      }
      clearSessionLocal();
    },
    [clearSessionLocal, refreshMarket, refreshProfile, refreshSavedAccounts],
  );

  const logout = useCallback(async () => {
    loginAbortRef.current = true;
    const current = readMotionflowAuth();
    const currentId = current.id;

    if (current.token) {
      const currentDevice = subscription.devices.find((d) => d.current);
      if (currentDevice?.id) {
        try {
          await revokeMotionflowDevice(current.token, currentDevice.id);
        } catch {
          /* ignore revoke errors on sign-out */
        }
      }
    }

    if (currentId) {
      const vault = removeAccountSession(currentId);
      refreshSavedAccounts();
      await activateNextOrClear(vault.activeId, vault.accounts);
    } else {
      clearSessionLocal();
    }
  }, [
    activateNextOrClear,
    clearSessionLocal,
    refreshSavedAccounts,
    subscription.devices,
  ]);

  const removeSavedAccount = useCallback(
    async (id: string): Promise<AuthActionResult> => {
      const sessions = listAccountSessions();
      const target = sessions.find((a) => a.id === id);
      if (!target) return { ok: false, message: "Account not found" };

      const isActive = auth.id === id;
      if (target.token && isActive) {
        const currentDevice = subscription.devices.find((d) => d.current);
        if (currentDevice?.id) {
          try {
            await revokeMotionflowDevice(target.token, currentDevice.id);
          } catch {
            /* ignore */
          }
        }
      }

      const vault = removeAccountSession(id);
      refreshSavedAccounts();

      if (isActive) {
        await activateNextOrClear(vault.activeId, vault.accounts);
      }

      return { ok: true, message: "Account removed" };
    },
    [activateNextOrClear, auth.id, refreshSavedAccounts, subscription.devices],
  );

  const recheck = useCallback(async () => {
    const current = readMotionflowAuth();
    if (!current.token) return { ok: false, message: "Not signed in" };
    return refreshProfile(current.token, {
      removeAccountIdOnUnauthorized: current.id,
    });
  }, [refreshProfile]);

  const revoke = useCallback(
    async (deviceId: string) => {
      const current = readMotionflowAuth();
      if (!current.token) return { ok: false, message: "Not signed in" };
      const result = await revokeMotionflowDevice(current.token, deviceId);
      if (!result.ok) return { ok: false, message: result.error || "Revoke failed" };
      await refreshProfile(current.token);
      return { ok: true };
    },
    [refreshProfile],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        refreshSavedAccounts();
        const stored = readMotionflowAuth();
        if (stored.token) {
          syncAiIdentity(stored);
          const hydrate = refreshProfile(stored.token, {
            removeAccountIdOnUnauthorized: stored.id,
          });
          const cap = new Promise<void>((resolve) => {
            setTimeout(resolve, 8000);
          });
          await Promise.race([hydrate.then(() => undefined).catch(() => undefined), cap]);
        }
      } catch {
        /* still show UI */
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshProfile, refreshSavedAccounts]);

  const accessTier = useMemo(
    () =>
      resolveAccessTier({
        tier: subscription.tier,
        subscribed: subscription.subscribed,
        purchaseCount: subscription.purchases.length,
      }),
    [subscription.tier, subscription.subscribed, subscription.purchases.length],
  );
  const signedIn = Boolean(auth.token && (auth.id || auth.email));
  const isFreeUser = accessTier === "free";
  const generationLimit = signedIn
    ? resolveGenerationLimit(subscription.aiGenerationsLimit, accessTier)
    : null;
  const freePackSlots = signedIn
    ? resolveFreePackSlots(subscription.freePackSlots)
    : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      prefs,
      setPrefs,
      updatePrefs,
      auth,
      signedIn,
      authReady,
      subscription,
      accessTier,
      isFreeUser,
      generationLimit,
      freePackSlots,
      market,
      marketLoading,
      marketError,
      refreshMarket,
      savedAccounts,
      loginWithMotionflow,
      addAccount,
      switchAccount,
      removeSavedAccount,
      cancelLogin,
      confirmReplaceDevice,
      loginBusy,
      loginCode,
      loginDeviceLimit,
      logout,
      recheck,
      revoke,
    }),
    [
      prefs,
      setPrefs,
      updatePrefs,
      auth,
      authReady,
      subscription,
      accessTier,
      isFreeUser,
      generationLimit,
      freePackSlots,
      market,
      marketLoading,
      marketError,
      refreshMarket,
      savedAccounts,
      loginWithMotionflow,
      addAccount,
      switchAccount,
      removeSavedAccount,
      cancelLogin,
      confirmReplaceDevice,
      loginBusy,
      loginCode,
      loginDeviceLimit,
      logout,
      recheck,
      revoke,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
