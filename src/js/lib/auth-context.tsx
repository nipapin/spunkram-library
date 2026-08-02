import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authErrorMessage, type AuthDevice } from "@/lib/api/market-api";
import {
  readMotionflowAuth,
  readPrefSettings,
  writeMotionflowAuth,
  writePrefSettings,
  type MotionflowAuth,
  type PrefSettings,
} from "@/lib/api/preferences";
import {
  fetchMe,
  openVerificationUrl,
  pollDeviceAuth,
  revokeMotionflowDevice,
  setSubscriptionUrls,
  startDeviceAuth,
  type MotionflowDevice,
  type MotionflowPurchase,
  type MotionflowSubscription,
} from "@/api/motionflow-auth";
import { fetchCepMarket, type CepMarketPayload } from "@/api/cep-market";
import { clearUserIdentity, setUserIdentity } from "@/api/user";
import { currentHostAppId } from "@/lib/utils/apply-item";
import {
  generationLimitForTier,
  resolveAccessTier,
  type SpunkramAccessTier,
} from "@/lib/config/entitlements";

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
   * From server `/me` (fallback: derived from subscription + purchases).
   * free = no Spunkram sub and no sold-item purchases.
   */
  accessTier: SpunkramAccessTier;
  isFreeUser: boolean;
  /** Monthly AI generation allotment from server entitlements. */
  generationLimit: number;
  market: CepMarketPayload | null;
  marketLoading: boolean;
  marketError: string | null;
  refreshMarket: (force?: boolean) => Promise<void>;
  loginWithMotionflow: () => Promise<{ ok: boolean; message?: string }>;
  cancelLogin: () => void;
  loginBusy: boolean;
  loginCode: string | null;
  logout: () => void;
  recheck: () => Promise<{ ok: boolean; message?: string }>;
  revoke: (deviceId: string) => Promise<{ ok: boolean; message?: string }>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<PrefSettings>(() => readPrefSettings());
  const [auth, setAuth] = useState<MotionflowAuth>(() => readMotionflowAuth());
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
  const loginAbortRef = useRef(false);

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

  const applySession = useCallback((next: MotionflowAuth, status: AuthStatus) => {
    setAuth(next);
    writeMotionflowAuth(next);
    setSubscription(status);
    syncAiIdentity(next);
  }, []);

  const refreshProfile = useCallback(
    async (token: string) => {
      const host = currentHostAppId();
      const hostType =
        host === "AEFT" ? ("AE" as const) : host === "PPRO" ? ("PR" as const) : null;
      const { data, error } = await fetchMe(token, { host: hostType });
      if (!data) {
        if (error === "UNAUTHORIZED") {
          setSubscriptionUrls({});
          applySession(
            {},
            toAuthStatus(undefined, [], [], {
              error: "Session expired — please sign in again",
            }),
          );
          return { ok: false as const, message: "Session expired — please sign in again" };
        }
        setSubscription((prev) => ({ ...prev, error: error || "Unable to refresh profile" }));
        return { ok: false as const, message: error || "Unable to refresh profile" };
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
      return { ok: true as const };
    },
    [applySession],
  );

  const refreshMarket = useCallback(
    async (force = false) => {
      if (marketLoaded && !force && market) return;
      setMarketLoading(true);
      setMarketError(null);
      const { data, error } = await fetchCepMarket(hostPrimaryType());
      if (error || !data) {
        setMarketError(
          error === "UNAUTHORIZED"
            ? "Please sign in again"
            : authErrorMessage(error) || error || "Unable to load market",
        );
        setMarketLoading(false);
        return;
      }
      if (data.subscribe_url) {
        setSubscriptionUrls({ subscribe: data.subscribe_url });
      }
      setMarket(data);
      setMarketLoaded(true);
      setMarketLoading(false);
    },
    [market, marketLoaded],
  );

  const loginWithMotionflow = useCallback(async () => {
    loginAbortRef.current = false;
    setLoginBusy(true);
    setLoginCode(null);

    const started = await startDeviceAuth();
    if ("error" in started) {
      setLoginBusy(false);
      return { ok: false, message: started.error };
    }

    const { code, device_code, verification_url, interval, expires_in, mock } = started.data;
    setLoginCode(code);
    openVerificationUrl(verification_url);

    const deadline = Date.now() + expires_in * 1000;
    const firstDelayMs = mock ? Math.max(1500, interval * 1000) : interval * 1000;

    await new Promise((r) => setTimeout(r, firstDelayMs));

    while (!loginAbortRef.current && Date.now() < deadline) {
      const result = await pollDeviceAuth(code, { mock, device_code });
      if (loginAbortRef.current) break;

      if (result.status === "complete") {
        const nextAuth: MotionflowAuth = {
          token: result.token,
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        };
        writeMotionflowAuth(nextAuth);
        setAuth(nextAuth);
        syncAiIdentity(nextAuth);
        const profile = await refreshProfile(result.token);
        setLoginBusy(false);
        setLoginCode(null);
        await refreshMarket(true);
        return profile.ok
          ? { ok: true, message: "Signed in to Spunkram" }
          : { ok: true, message: profile.message || "Signed in" };
      }

      if (result.status === "expired" || result.status === "denied") {
        setLoginBusy(false);
        setLoginCode(null);
        return { ok: false, message: result.message || `Login ${result.status}` };
      }

      await new Promise((r) => setTimeout(r, interval * 1000));
    }

    setLoginBusy(false);
    setLoginCode(null);
    if (loginAbortRef.current) {
      return { ok: false, message: "Login cancelled" };
    }
    return { ok: false, message: "Login timed out — try again" };
  }, [refreshMarket, refreshProfile]);

  const cancelLogin = useCallback(() => {
    loginAbortRef.current = true;
    setLoginBusy(false);
    setLoginCode(null);
  }, []);

  const logout = useCallback(() => {
    loginAbortRef.current = true;
    setSubscriptionUrls({});
    applySession({}, toAuthStatus());
    setMarket(null);
    setMarketLoaded(false);
  }, [applySession]);

  const recheck = useCallback(async () => {
    const current = readMotionflowAuth();
    if (!current.token) return { ok: false, message: "Not signed in" };
    return refreshProfile(current.token);
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
      const stored = readMotionflowAuth();
      if (stored.token) {
        syncAiIdentity(stored);
        await refreshProfile(stored.token);
      }
      if (!cancelled) setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshProfile]);

  const accessTier = useMemo(
    () =>
      resolveAccessTier({
        tier: subscription.tier,
        subscribed: subscription.subscribed,
        purchaseCount: subscription.purchases.length,
      }),
    [subscription.tier, subscription.subscribed, subscription.purchases.length],
  );
  const isFreeUser = accessTier === "free";
  const generationLimit = generationLimitForTier(
    accessTier,
    subscription.aiGenerationsLimit,
    subscription.plan,
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      prefs,
      setPrefs,
      updatePrefs,
      auth,
      signedIn: Boolean(auth.token && (auth.id || auth.email)),
      authReady,
      subscription,
      accessTier,
      isFreeUser,
      generationLimit,
      market,
      marketLoading,
      marketError,
      refreshMarket,
      loginWithMotionflow,
      cancelLogin,
      loginBusy,
      loginCode,
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
      market,
      marketLoading,
      marketError,
      refreshMarket,
      loginWithMotionflow,
      cancelLogin,
      loginBusy,
      loginCode,
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

export function useApiServerIndex(): number {
  const { prefs } = useAuth();
  return Number(prefs.defaultApiServer) === 1 ? 1 : 0;
}

/** @deprecated AtomX AuthDevice shape — prefer MotionflowDevice */
export type { AuthDevice };
