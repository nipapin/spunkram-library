import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from "react";
import { authErrorMessage } from "@/lib/api/market-api";
import { friendlyErrorMessage } from "@/utils/user-error";
import { handleUnauthorized, onSessionExpired, onSessionReload } from "@/lib/api/session";
import { cepWs } from "@/lib/cep-ws";
import { listAccountSessions, onSharedAuthFileChange, readActiveMotionflowAuth, readMotionflowAuth, readPrefSettings, removeAccountSession, setActiveAccount, sharedAuthFingerprint, upsertAccountSession, writeMotionflowAuth, writePrefSettings, } from "@/lib/api/preferences";
import { fetchMe, openVerificationUrl, pollDeviceAuth, replaceDeviceAuth, revokeMotionflowDevice, setSubscriptionUrls, startDeviceAuth, } from "@/api/motionflow-auth";
import { fetchCepMarket } from "@/api/cep-market";
import { clearUserIdentity, setUserIdentity } from "@/api/user";
import { reportSupportError } from "@/api/support";
import { reportClientSession, reportInstalledPacks } from "@/api/telemetry";
import { currentHostAppId } from "@/lib/utils/apply-item";
import { applyAdminDevPlan } from "@/lib/utils/gal-plan";
import { applySpunkramAdminDevPlan } from "@/lib/utils/spunkram-plan";
import { currentPackHost } from "@/lib/utils/pack-host";
import { waitForNextAuthPoll } from "@/lib/wait-for-auth-poll";
import { getUserSystemData } from "@/lib/api/usp";
import { partitionLoginDevices, thisMachineDeviceIds, } from "@/lib/utils/device-session";
import { isReleaseAdminEmail } from "@/api/update";
import { BRAND, resolveAccessTier, resolveFreePackSlots, resolveGenerationLimit, } from "@brands";
/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const AUTH_CONTEXT_KEY = "__spunkram_auth_context__";
const AuthContext = globalThis[AUTH_CONTEXT_KEY] ??
    createContext(null);
globalThis[AUTH_CONTEXT_KEY] = AuthContext;
function hostPrimaryType() {
    const host = currentHostAppId();
    if (host === "PPRO")
        return "PR";
    return "AE";
}
function toAuthStatus(sub, devices = [], purchases = [], extra) {
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
function syncAiIdentity(auth) {
    if (auth.token && (auth.id || auth.email)) {
        setUserIdentity({
            id: auth.id || "",
            email: auth.email,
            name: auth.name || auth.email,
            token: auth.token,
        });
    }
    else {
        clearUserIdentity();
    }
}
function authFromSession(session) {
    return {
        token: session.token,
        id: session.id,
        email: session.email,
        name: session.name,
    };
}
function persistedDeviceIdsForAccount(accountId) {
    if (!accountId)
        return [];
    return listAccountSessions().find((a) => a.id === accountId)?.deviceIds ?? [];
}
async function releaseLocalDeviceSlots(opts) {
    const local = getUserSystemData();
    const ids = new Set([
        ...thisMachineDeviceIds(opts.devices, local),
        ...persistedDeviceIdsForAccount(opts.accountId),
    ]);
    if (ids.size === 0) {
        const { data } = await fetchMe(opts.token);
        for (const id of thisMachineDeviceIds(data?.devices ?? [], local)) {
            ids.add(id);
        }
    }
    if (ids.size === 0)
        return;
    await Promise.all([...ids].map((id) => revokeMotionflowDevice(opts.token, id).catch(() => ({ ok: false }))));
}
export function AuthProvider({ children }) {
    const [prefs, setPrefsState] = useState(() => readPrefSettings());
    const [auth, setAuth] = useState(() => {
        const stored = readActiveMotionflowAuth();
        syncAiIdentity(stored);
        return stored;
    });
    const [savedAccounts, setSavedAccounts] = useState(() => listAccountSessions());
    const [subscription, setSubscription] = useState({
        subscribed: false,
        purchases: [],
        devices: [],
    });
    const [market, setMarket] = useState(null);
    const [marketLoading, setMarketLoading] = useState(false);
    const [marketError, setMarketError] = useState(null);
    const [marketLoaded, setMarketLoaded] = useState(false);
    const [authReady, setAuthReady] = useState(false);
    const [loginBusy, setLoginBusy] = useState(false);
    const [loginCode, setLoginCode] = useState(null);
    const [loginDeviceLimit, setLoginDeviceLimit] = useState(null);
    const loginAbortRef = useRef(false);
    const devicePickResolverRef = useRef(null);
    const sharedAuthFpRef = useRef(sharedAuthFingerprint());
    const refreshSavedAccounts = useCallback(() => {
        setSavedAccounts(listAccountSessions());
    }, []);
    const setPrefs = useCallback((next) => {
        setPrefsState(next);
        writePrefSettings(next);
    }, []);
    const updatePrefs = useCallback((patch) => {
        setPrefsState((prev) => {
            const next = { ...prev, ...patch };
            writePrefSettings(next);
            return next;
        });
    }, []);
    const applySession = useCallback((next, status) => {
        setAuth(next);
        if (next.token && next.id && next.email) {
            const deviceIds = thisMachineDeviceIds(status.devices, getUserSystemData());
            upsertAccountSession({
                id: next.id,
                email: next.email,
                name: next.name,
                token: next.token,
                ...(deviceIds.length ? { deviceIds } : {}),
            });
        }
        else {
            writeMotionflowAuth(next);
        }
        setSubscription(status);
        syncAiIdentity(next);
        refreshSavedAccounts();
        sharedAuthFpRef.current = sharedAuthFingerprint();
    }, [refreshSavedAccounts]);
    const forgetSessionInMemory = useCallback(() => {
        try {
            cepWs.stop();
        }
        catch {
            /* ignore */
        }
        setSubscriptionUrls({});
        setAuth({});
        syncAiIdentity({});
        setSubscription(toAuthStatus());
        setMarket(null);
        setMarketLoaded(false);
        refreshSavedAccounts();
        sharedAuthFpRef.current = sharedAuthFingerprint();
    }, [refreshSavedAccounts]);
    const clearSessionLocal = useCallback(() => {
        forgetSessionInMemory();
        writeMotionflowAuth({});
    }, [forgetSessionInMemory]);
    const refreshProfile = useCallback(async (token, _opts) => {
        const host = currentHostAppId();
        const hostType = host === "AEFT" ? "AE" : host === "PPRO" ? "PR" : null;
        const { data, error } = await fetchMe(token, { host: hostType });
        if (!data) {
            if (error === "UNAUTHORIZED") {
                const disk = readActiveMotionflowAuth();
                if (disk.token && disk.token !== token) {
                    return refreshProfile(disk.token, {
                        removeAccountIdOnUnauthorized: disk.id,
                    });
                }
                handleUnauthorized("UNAUTHORIZED", token);
                const after = readActiveMotionflowAuth();
                if (after.token && after.token !== token) {
                    return refreshProfile(after.token, {
                        removeAccountIdOnUnauthorized: after.id,
                    });
                }
                if (after.token) {
                    return {
                        ok: false,
                        message: "Session expired — please sign in again",
                    };
                }
                forgetSessionInMemory();
                setSubscription(toAuthStatus(undefined, [], [], {
                    error: "Session expired — please sign in again",
                }));
                return { ok: false, message: "Session expired — please sign in again" };
            }
            const msg = error || "Unable to refresh profile";
            setSubscription((prev) => ({ ...prev, error: msg }));
            if (error !== "NO_CONNECTION" && error !== "TIMEOUT" && error !== "NO_SUCCESS_LOAD") {
                reportSupportError("auth.refresh_profile", msg, {
                    error_code: error || null,
                });
            }
            return { ok: false, message: msg };
        }
        const nextAuth = {
            token,
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
        };
        setSubscriptionUrls({
            subscribe: data.subscribe_url,
            manage: data.manage_subscription_url,
        });
        applySession(nextAuth, toAuthStatus(data.subscription, data.devices ?? [], data.purchases ?? [], {
            tier: data.tier,
            aiGenerationsLimit: data.entitlements?.ai_generations_limit,
            freePackSlots: data.entitlements?.free_pack_slots,
        }));
        void reportClientSession();
        void reportInstalledPacks();
        return { ok: true };
    }, [applySession, forgetSessionInMemory]);
    const refreshMarket = useCallback(async (force = false) => {
        if (marketLoaded && !force && market)
            return;
        setMarketLoading(true);
        setMarketError(null);
        const { data, error } = await fetchCepMarket(hostPrimaryType());
        if (error || !data) {
            const msg = error === "UNAUTHORIZED"
                ? "Please sign in again"
                : friendlyErrorMessage(authErrorMessage(error) || error || "Unable to load market");
            setMarketError(msg);
            if (error !== "UNAUTHORIZED" &&
                error !== "NO_CONNECTION" &&
                error !== "TIMEOUT" &&
                error !== "NO_SUCCESS_LOAD") {
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
    }, [market, marketLoaded]);
    const adoptSharedAuthFromDisk = useCallback(() => {
        const fp = sharedAuthFingerprint();
        if (fp === sharedAuthFpRef.current)
            return;
        sharedAuthFpRef.current = fp;
        refreshSavedAccounts();
        const stored = readActiveMotionflowAuth();
        if (stored.token) {
            syncAiIdentity(stored);
            setAuth(stored);
            void refreshProfile(stored.token, {
                removeAccountIdOnUnauthorized: stored.id,
            }).then((result) => {
                if (result.ok)
                    void refreshMarket(true);
            });
            return;
        }
        forgetSessionInMemory();
    }, [forgetSessionInMemory, refreshMarket, refreshProfile, refreshSavedAccounts]);
    useEffect(() => onSessionReload(adoptSharedAuthFromDisk), [adoptSharedAuthFromDisk]);
    useEffect(() => onSharedAuthFileChange(adoptSharedAuthFromDisk), [adoptSharedAuthFromDisk]);
    useEffect(() => {
        return onSessionExpired(() => {
            const stored = readActiveMotionflowAuth();
            if (stored.token) {
                adoptSharedAuthFromDisk();
                return;
            }
            forgetSessionInMemory();
        });
    }, [adoptSharedAuthFromDisk, forgetSessionInMemory]);
    const finishDeviceLogin = useCallback(async (token, user) => {
        const nextAuth = {
            token,
            id: user.id,
            email: user.email,
            name: user.name,
        };
        upsertAccountSession({
            id: nextAuth.id,
            email: nextAuth.email,
            name: nextAuth.name,
            token: nextAuth.token,
        });
        sharedAuthFpRef.current = sharedAuthFingerprint();
        setAuth(nextAuth);
        syncAiIdentity(nextAuth);
        refreshSavedAccounts();
        const profile = await refreshProfile(token);
        setLoginBusy(false);
        setLoginCode(null);
        setLoginDeviceLimit(null);
        await refreshMarket(true);
        return profile.ok
            ? { ok: true, message: "Signed in to Motionflow" }
            : { ok: true, message: profile.message || "Signed in" };
    }, [refreshMarket, refreshProfile, refreshSavedAccounts]);
    const runDeviceCodeLogin = useCallback(async () => {
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
            if (started.error !== "NO_CONNECTION" &&
                started.error !== "TIMEOUT" &&
                started.error !== "NO_SUCCESS_LOAD" &&
                !/UNKNOWN_CLIENT|unknown client/i.test(started.error) &&
                !/^HTTP\s*4\d\d/i.test(started.error)) {
                reportSupportError("auth.device_start", started.error);
            }
            return { ok: false, message: friendlyErrorMessage(started.error) };
        }
        const { code, device_code, verification_url, interval, expires_in } = started.data;
        setLoginCode(code);
        openVerificationUrl(verification_url);
        const deadline = Date.now() + expires_in * 1000;
        const pollDelayMs = interval * 1000;
        await waitForNextAuthPoll(pollDelayMs);
        while (!loginAbortRef.current && Date.now() < deadline) {
            const result = await pollDeviceAuth(code, { device_code });
            if (loginAbortRef.current)
                break;
            if (result.status === "complete") {
                return finishDeviceLogin(result.token, result.user);
            }
            if (result.status === "device_limit") {
                const { thisMachine, others } = partitionLoginDevices(result.devices, getUserSystemData());
                if (thisMachine[0]?.id) {
                    const reused = await replaceDeviceAuth({
                        code,
                        device_code,
                        revoke_device_id: thisMachine[0].id,
                    });
                    if (reused.status === "complete") {
                        return finishDeviceLogin(reused.token, reused.user);
                    }
                }
                setLoginDeviceLimit({
                    devices: others.length > 0 ? others : result.devices,
                    device_limit: result.device_limit,
                });
                const revokeId = await new Promise((resolve) => {
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
                    message: ("message" in replaced && replaced.message) || "Could not revoke device",
                };
            }
            if (result.status === "expired" || result.status === "denied") {
                setLoginBusy(false);
                setLoginCode(null);
                setLoginDeviceLimit(null);
                return { ok: false, message: result.message || `Login ${result.status}` };
            }
            await waitForNextAuthPoll(pollDelayMs);
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
    const confirmReplaceDevice = useCallback((deviceId) => {
        if (devicePickResolverRef.current) {
            devicePickResolverRef.current(deviceId);
            devicePickResolverRef.current = null;
        }
    }, []);
    const switchAccount = useCallback(async (id) => {
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
    }, [refreshMarket, refreshProfile, refreshSavedAccounts]);
    const activateNextOrClear = useCallback(async (vaultActiveId, accounts) => {
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
                if (profile.ok)
                    await refreshMarket(true);
                return;
            }
        }
        clearSessionLocal();
    }, [clearSessionLocal, refreshMarket, refreshProfile, refreshSavedAccounts]);
    const logout = useCallback(async () => {
        loginAbortRef.current = true;
        const current = readMotionflowAuth();
        const currentId = current.id;
        try {
            cepWs.stop();
        }
        catch {
            /* ignore */
        }
        if (current.token) {
            try {
                await releaseLocalDeviceSlots({
                    token: current.token,
                    accountId: currentId,
                    devices: subscription.devices,
                });
            }
            catch {
                /* ignore revoke errors on sign-out */
            }
        }
        if (currentId) {
            const vault = removeAccountSession(currentId);
            refreshSavedAccounts();
            await activateNextOrClear(vault.activeId, vault.accounts);
        }
        else {
            clearSessionLocal();
        }
    }, [
        activateNextOrClear,
        clearSessionLocal,
        refreshSavedAccounts,
        subscription.devices,
    ]);
    const removeSavedAccount = useCallback(async (id) => {
        const sessions = listAccountSessions();
        const target = sessions.find((a) => a.id === id);
        if (!target)
            return { ok: false, message: "Account not found" };
        const isActive = auth.id === id;
        if (target.token) {
            try {
                await releaseLocalDeviceSlots({
                    token: target.token,
                    accountId: target.id,
                    devices: isActive ? subscription.devices : [],
                });
            }
            catch {
                /* ignore */
            }
        }
        const vault = removeAccountSession(id);
        refreshSavedAccounts();
        if (isActive) {
            await activateNextOrClear(vault.activeId, vault.accounts);
        }
        return { ok: true, message: "Account removed" };
    }, [activateNextOrClear, auth.id, refreshSavedAccounts, subscription.devices]);
    const recheck = useCallback(async () => {
        const current = readActiveMotionflowAuth();
        if (!current.token)
            return { ok: false, message: "Not signed in" };
        return refreshProfile(current.token, {
            removeAccountIdOnUnauthorized: current.id,
        });
    }, [refreshProfile]);
    const revoke = useCallback(async (deviceId) => {
        const current = readMotionflowAuth();
        if (!current.token)
            return { ok: false, message: "Not signed in" };
        const result = await revokeMotionflowDevice(current.token, deviceId);
        if (!result.ok)
            return { ok: false, message: result.error || "Revoke failed" };
        await refreshProfile(current.token);
        return { ok: true };
    }, [refreshProfile]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                refreshSavedAccounts();
                const stored = readActiveMotionflowAuth();
                sharedAuthFpRef.current = sharedAuthFingerprint();
                if (stored.token) {
                    syncAiIdentity(stored);
                    const hydrate = refreshProfile(stored.token, {
                        removeAccountIdOnUnauthorized: stored.id,
                    });
                    const cap = new Promise((resolve) => {
                        setTimeout(resolve, 8000);
                    });
                    await Promise.race([hydrate.then(() => undefined).catch(() => undefined), cap]);
                }
            }
            catch {
                /* still show UI */
            }
            finally {
                if (!cancelled)
                    setAuthReady(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refreshProfile, refreshSavedAccounts]);
    const effectiveSubscription = useMemo(() => {
        if (!isReleaseAdminEmail(auth.email))
            return subscription;
        if (BRAND.id === "spunkram") {
            return applySpunkramAdminDevPlan(subscription, prefs.adminDevPlan);
        }
        return applyAdminDevPlan(subscription, prefs.adminDevPlan, currentPackHost());
    }, [auth.email, prefs.adminDevPlan, subscription]);
    const accessTier = useMemo(() => resolveAccessTier({
        tier: effectiveSubscription.tier,
        subscribed: effectiveSubscription.subscribed,
        purchaseCount: effectiveSubscription.purchases.length,
    }), [
        effectiveSubscription.tier,
        effectiveSubscription.subscribed,
        effectiveSubscription.purchases.length,
    ]);
    const signedIn = Boolean(auth.token && (auth.id || auth.email));
    const isFreeUser = accessTier === "free";
    const generationLimit = signedIn
        ? resolveGenerationLimit(effectiveSubscription.aiGenerationsLimit, accessTier)
        : null;
    const freePackSlots = signedIn
        ? resolveFreePackSlots(effectiveSubscription.freePackSlots)
        : null;
    const value = useMemo(() => ({
        prefs,
        setPrefs,
        updatePrefs,
        auth,
        signedIn,
        authReady,
        subscription: effectiveSubscription,
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
    }), [
        prefs,
        setPrefs,
        updatePrefs,
        auth,
        authReady,
        effectiveSubscription,
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
    ]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
