import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, Loader2, LogOut, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { openMotionflowBuyExtra, openMotionflowContact, openMotionflowSubscribe, } from "@/api/motionflow-auth";
import { fetchGenerationsStatus } from "@/api/credits";
import { getUserSystemData } from "@/lib/api/usp";
import { parseDeviceFingerprint } from "@/lib/api/market-api";
import { isReleaseAdminEmail } from "@/api/update";
import { BRAND } from "@brands";
import { SPUNKRAM_DEV_PLANS, isSpunkramDevPlan, spunkramDevPlanLabel, } from "@/lib/utils/spunkram-plan";
import "./account-panel.scss";
function formatDate(iso) {
    if (!iso)
        return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return null;
    return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
function accountInitial(account) {
    const source = (account.name || account.email || "?").trim();
    return source.charAt(0).toUpperCase() || "?";
}
/** Server plan titles include the product name (`Spunkram Library Editor`). */
function planTitle(plan) {
    const raw = (plan || "").trim();
    if (!raw)
        return "Editor";
    const brand = BRAND.displayName.trim();
    if (!brand)
        return raw;
    const pattern = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    const rest = raw
        .replace(pattern, " ")
        .replace(/\s+/g, " ")
        .replace(/^[\s:—–\-|]+|[\s:—–\-|]+$/g, "")
        .trim();
    return rest || "Editor";
}
function Sheen() {
    return _jsx("span", { className: "account-spunkram__sheen", "aria-hidden": true });
}
function parseFingerprint(raw) {
    return parseDeviceFingerprint(raw || "");
}
/** 6-byte MAC as 12 hex chars. Hashed fingerprints (32+ hex) are not MACs. */
function realMacHex(raw) {
    const hex = (raw || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
    return hex.length === 12 ? hex : null;
}
function sessionName(device) {
    const fp = parseFingerprint(device.user_fingerprint);
    return (device.name || fp.user || "").trim().toLowerCase();
}
function uniqueSessionDevices(devices, currentMac) {
    const parent = devices.map((_, i) => i);
    const find = (i) => {
        if (parent[i] !== i)
            parent[i] = find(parent[i]);
        return parent[i];
    };
    const union = (a, b) => {
        const pa = find(a);
        const pb = find(b);
        if (pa !== pb)
            parent[pa] = pb;
    };
    const byKey = new Map();
    const addKey = (key, index) => {
        if (!key)
            return;
        const existing = byKey.get(key);
        if (existing == null)
            byKey.set(key, index);
        else
            union(existing, index);
    };
    devices.forEach((device, index) => {
        const fp = parseFingerprint(device.user_fingerprint);
        const mac = realMacHex(fp.mac);
        const ip = (device.ip || "").trim().toLowerCase();
        const name = sessionName(device);
        if (mac)
            addKey(`mac:${mac}`, index);
        if (device.current && currentMac) {
            const localMac = realMacHex(currentMac);
            if (localMac)
                addKey(`mac:${localMac}`, index);
        }
        if (name && ip)
            addKey(`name-ip:${name}|${ip}`, index);
    });
    const groups = new Map();
    devices.forEach((device, index) => {
        const root = find(index);
        const list = groups.get(root);
        if (list)
            list.push(device);
        else
            groups.set(root, [device]);
    });
    const currentMacHex = realMacHex(currentMac);
    const unique = [];
    for (const list of groups.values()) {
        const preferred = list.find((d) => d.current) ||
            list.find((d) => realMacHex(parseFingerprint(d.user_fingerprint).mac) === currentMacHex) ||
            list.find((d) => realMacHex(parseFingerprint(d.user_fingerprint).mac)) ||
            list[0];
        unique.push({
            ...preferred,
            current: list.some((d) => d.current) ||
                list.some((d) => realMacHex(parseFingerprint(d.user_fingerprint).mac) === currentMacHex) ||
                preferred.current,
            revokeIds: [...new Set(list.map((d) => d.id).filter(Boolean))],
        });
    }
    unique.sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)));
    return unique;
}
function creditsFromStatus(status, generationLimit, subscribed) {
    if (!subscribed)
        return { monthlyLeft: 0, extraLeft: 0, used: 0 };
    const monthlyLeft = typeof status.subscription_generations_left === "number"
        ? status.subscription_generations_left
        : typeof status.remaining === "number"
            ? status.remaining
            : generationLimit ?? 0;
    const extraLeft = typeof status.extra_generations_left === "number" ? status.extra_generations_left : 0;
    const used = typeof status.used === "number"
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
function Kicker({ children }) {
    return _jsx("p", { className: "account-spunkram__kicker", children: children });
}
export function AccountPanel({ onBack }) {
    const { auth, prefs, updatePrefs, subscription, isFreeUser, generationLimit, logout, recheck, revoke, savedAccounts, switchAccount, addAccount, removeSavedAccount, loginBusy, loginCode, loginDeviceLimit, cancelLogin, confirmReplaceDevice, } = useAuth();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const [replacingId, setReplacingId] = useState(null);
    const [credits, setCredits] = useState(null);
    const sys = useMemo(() => getUserSystemData(), []);
    const currentMac = sys.mac;
    const otherAccounts = useMemo(() => savedAccounts.filter((a) => a.id !== auth.id), [savedAccounts, auth.id]);
    const sessionDevices = useMemo(() => uniqueSessionDevices(subscription.devices, currentMac), [subscription.devices, currentMac]);
    useEffect(() => {
        let cancelled = false;
        if (!subscription.subscribed) {
            setCredits({ monthlyLeft: 0, extraLeft: 0, used: 0 });
            return;
        }
        fetchGenerationsStatus().then((status) => {
            if (cancelled || !status)
                return;
            setCredits(creditsFromStatus(status, generationLimit, true));
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
        if (status)
            setCredits(creditsFromStatus(status, generationLimit, subscription.subscribed));
        setBusy(false);
        if (!result.ok)
            setMessage(result.message || "Recheck failed");
    }
    async function handleRevoke(deviceIds) {
        setBusy(true);
        setMessage(null);
        let lastError = null;
        for (const id of deviceIds) {
            if (!id)
                continue;
            const result = await revoke(id);
            if (!result.ok)
                lastError = result.message || "Revoke failed";
        }
        setBusy(false);
        if (lastError)
            setMessage(lastError);
    }
    async function handleSwitch(id) {
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
        setReplacingId(null);
        if (!result.ok)
            setMessage(result.message || "Could not add account");
        else
            setMessage(result.message || "Account added");
    }
    function handleRevokeAndContinue(deviceId) {
        setReplacingId(deviceId);
        setMessage("Disconnecting device and finishing sign-in…");
        confirmReplaceDevice(deviceId);
    }
    async function handleRemove(id) {
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
            ? planTitle(subscription.plan)
            : "Free";
    const planStatus = subscription.error
        ? "Error"
        : subscription.subscribed
            ? "Active"
            : isFreeUser
                ? "Free"
                : "Inactive";
    const displayName = auth.name || auth.email || `${BRAND.authorName} user`;
    const isAdmin = isReleaseAdminEmail(auth.email);
    const devPlan = isSpunkramDevPlan(prefs.adminDevPlan) ? prefs.adminDevPlan : "";
    const isCancelled = (subscription.status || "").toLowerCase().includes("cancel");
    const monthlyLeft = credits?.monthlyLeft ?? 0;
    const extraLeft = credits?.extraLeft ?? 0;
    const usedCount = credits?.used ?? 0;
    const limitLabel = generationLimit != null ? String(generationLimit) : "—";
    const showExtra = !isFreeUser;
    const totalLeft = monthlyLeft + extraLeft;
    const monthlyCap = Math.max(0, generationLimit ?? 0);
    const monthlyPct = monthlyCap > 0 ? Math.min(100, (Math.max(monthlyLeft, 0) / monthlyCap) * 100) : 0;
    return (_jsxs("div", { className: "account-spunkram", children: [_jsx("div", { className: "account-spunkram__mesh" }), _jsx("div", { className: "account-spunkram__grid" }), _jsx("div", { className: "account-spunkram__body", children: _jsx("div", { className: "account-spunkram__scroll", children: _jsxs("div", { className: "account-spunkram__stack", children: [_jsxs("section", { className: "account-spunkram__card account-spunkram__card--profile", children: [_jsx(Sheen, {}), _jsxs("div", { className: "account-spunkram__inner account-spunkram__profile", children: [_jsx("div", { className: "account-spunkram__avatar", children: accountInitial({ name: auth.name, email: auth.email || "" }) }), _jsxs("div", { className: "account-spunkram__profile-copy", children: [_jsx("h2", { className: "account-spunkram__name", children: displayName }), auth.email && _jsx("p", { className: "account-spunkram__email", children: auth.email })] }), _jsxs("div", { className: "account-spunkram__profile-actions", children: [_jsx("button", { type: "button", className: "account-btn account-btn--ghost account-btn--circle", title: "Refresh status", "aria-label": "Refresh subscription", disabled: busy, onClick: () => void handleRecheck(), children: busy ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : _jsx(RefreshCw, { className: "size-3.5" }) }), _jsx("button", { type: "button", className: "account-btn account-btn--ghost account-btn--circle", title: "Sign out", "aria-label": "Sign out", disabled: busy || loginBusy, onClick: () => void handleLogout(), children: _jsx(LogOut, { className: "size-3.5" }) })] })] })] }), message && _jsx("p", { className: "account-spunkram__msg", children: message }), loginBusy && loginDeviceLimit ? (_jsxs("section", { className: "account-spunkram__card account-spunkram__card--compact", children: [_jsx(Sheen, {}), _jsxs("div", { className: "account-spunkram__inner", children: [_jsx(Kicker, { children: "Device limit reached" }), _jsxs("p", { className: "account-spunkram__empty", children: ["This account is signed in on ", loginDeviceLimit.device_limit, " devices. Disconnect one to continue here."] }), loginDeviceLimit.devices.map((device) => {
                                                const fp = parseDeviceFingerprint(device.user_fingerprint || "");
                                                const disconnectBusy = replacingId === device.id;
                                                return (_jsxs("div", { className: "account-spunkram__device", children: [_jsxs("div", { className: "account-spunkram__grow", children: [_jsx("p", { className: "account-spunkram__device-name", children: device.name || fp.user || "Device" }), _jsx("p", { className: "account-spunkram__device-meta", children: (device.ip || "—") +
                                                                        (device.last_seen_at
                                                                            ? ` · ${new Date(device.last_seen_at).toLocaleDateString()}`
                                                                            : "") })] }), _jsx("button", { type: "button", className: "account-btn account-btn--ghost account-btn--tiny account-btn--danger", disabled: Boolean(replacingId), onClick: () => handleRevokeAndContinue(device.id), children: disconnectBusy ? (_jsx(Loader2, { className: "size-3 animate-spin" })) : ("Disconnect") })] }, device.id));
                                            }), _jsx("button", { type: "button", className: "account-btn account-btn--ghost account-btn--tiny", disabled: Boolean(replacingId), onClick: cancelLogin, children: "Cancel" })] })] })) : loginBusy && loginCode ? (_jsxs("section", { className: "account-spunkram__card account-spunkram__card--compact", children: [_jsx(Sheen, {}), _jsxs("div", { className: "account-spunkram__inner account-spunkram__inner--center", children: [_jsx(Kicker, { children: "Confirm in browser" }), _jsx("p", { className: "account-spunkram__code", children: loginCode }), _jsx("button", { type: "button", className: "account-btn account-btn--ghost account-btn--tiny", onClick: cancelLogin, children: "Cancel" })] })] })) : null, _jsxs("div", { className: "account-spunkram__pair", children: [_jsxs("section", { className: "account-spunkram__card account-spunkram__card--tile", children: [_jsx(Sheen, {}), _jsxs("div", { className: "account-spunkram__inner account-spunkram__tile", children: [_jsxs("div", { className: "account-spunkram__tile-head", children: [_jsx(Kicker, { children: "Plan" }), subscription.subscribed ? (_jsxs("span", { className: isCancelled
                                                                    ? "account-spunkram__badge account-spunkram__badge--amber"
                                                                    : "account-spunkram__badge", children: [_jsx(Check, { className: "size-3", strokeWidth: 3 }), isCancelled ? "Cancelled" : "Active"] })) : null] }), _jsxs("div", { className: "account-spunkram__tile-foot", children: [_jsx("p", { className: "account-spunkram__tile-title", children: planName }), subscription.error ? (_jsx("p", { className: "account-spunkram__sub", children: subscription.error })) : renewLabel ? (_jsxs("p", { className: "account-spunkram__sub", children: ["until ", renewLabel] })) : planStatus !== "Active" ? (_jsx("p", { className: "account-spunkram__sub", children: planStatus })) : null, isAdmin ? (_jsxs("div", { className: "account-spunkram__dev-plan", children: [_jsxs("div", { className: "account-spunkram__plan-switch", role: "group", "aria-label": "Dev plan", children: [SPUNKRAM_DEV_PLANS.map((plan) => (_jsx("button", { type: "button", className: devPlan === plan
                                                                                    ? "account-spunkram__plan-chip is-active"
                                                                                    : "account-spunkram__plan-chip", onClick: () => updatePrefs({ adminDevPlan: plan }), children: spunkramDevPlanLabel(plan) }, plan))), _jsx("button", { type: "button", className: devPlan
                                                                                    ? "account-spunkram__plan-chip"
                                                                                    : "account-spunkram__plan-chip is-active", onClick: () => updatePrefs({ adminDevPlan: "" }), children: "Live" })] }), _jsx("p", { className: "account-spunkram__dev-hint", children: "Dev test \u00B7 local only" })] })) : null] })] })] }), _jsxs("section", { className: "account-spunkram__card account-spunkram__card--tile", children: [_jsx(Sheen, {}), _jsxs("div", { className: "account-spunkram__inner account-spunkram__tile", children: [_jsxs("div", { className: "account-spunkram__tile-head", children: [_jsx(Kicker, { children: "Generations" }), _jsxs("button", { type: "button", className: "account-btn account-btn--primary account-btn--tiny", onClick: openMotionflowBuyExtra, children: [_jsx(Plus, { className: "size-3", strokeWidth: 2.5 }), "Add extra"] })] }), _jsxs("div", { children: [_jsx("p", { className: "account-spunkram__price", children: totalLeft }), _jsxs("p", { className: "account-spunkram__sub", children: [_jsxs("span", { className: "account-spunkram__legend-item", children: [_jsx("span", { className: "account-spunkram__dot account-spunkram__dot--monthly", "aria-hidden": true }), monthlyLeft, "/", limitLabel, " monthly"] }), showExtra && extraLeft > 0 ? (_jsxs("span", { className: "account-spunkram__legend-item", children: [_jsx("span", { className: "account-spunkram__dot account-spunkram__dot--extra", "aria-hidden": true }), extraLeft, " extra"] })) : null] }), _jsx("div", { className: "account-spunkram__track", children: monthlyPct > 0 ? (_jsx("div", { className: "account-spunkram__fill account-spunkram__fill--monthly", style: { width: `${monthlyPct}%` } })) : null }), _jsx("div", { className: "account-spunkram__usage", children: _jsxs("span", { children: [usedCount, " used of ", limitLabel, " monthly", showExtra && extraLeft > 0 ? ` · ${extraLeft} extra left` : ""] }) })] })] })] })] }), !subscription.subscribed && (_jsxs("button", { type: "button", className: "account-btn account-btn--primary account-btn--block", onClick: openMotionflowSubscribe, children: ["Subscribe from $9.9/mo", _jsx(ArrowUpRight, { className: "size-3.5" })] })), _jsxs("section", { className: "account-spunkram__card account-spunkram__card--compact", children: [_jsx(Sheen, {}), _jsxs("div", { className: "account-spunkram__inner", children: [_jsxs("div", { className: "account-spunkram__tile-head", children: [_jsx(Kicker, { children: "Accounts" }), _jsxs("button", { type: "button", className: "account-btn account-btn--ghost account-btn--tiny", disabled: busy || loginBusy, onClick: () => void handleAddAccount(), children: [loginBusy ? _jsx(Loader2, { className: "size-3 animate-spin" }) : _jsx(Plus, { className: "size-3" }), "Add"] })] }), otherAccounts.length === 0 ? (_jsx("p", { className: "account-spunkram__empty", children: "No other accounts saved" })) : (otherAccounts.map((account) => (_jsxs("div", { className: "account-spunkram__account", children: [_jsx("span", { className: "account-spunkram__mini", children: accountInitial(account) }), _jsxs("div", { className: "account-spunkram__grow", children: [_jsx("p", { className: "account-spunkram__device-name", children: account.name || account.email }), _jsx("p", { className: "account-spunkram__device-meta", children: account.email })] }), _jsx("button", { type: "button", className: "account-btn account-btn--ghost account-btn--tiny", disabled: busy || loginBusy, onClick: () => void handleSwitch(account.id), children: "Switch" }), _jsx("button", { type: "button", className: "account-btn account-btn--ghost account-btn--tiny account-btn--danger", disabled: busy || loginBusy, onClick: () => void handleRemove(account.id), children: "Remove" })] }, account.id))))] })] }), _jsxs("section", { className: "account-spunkram__card account-spunkram__card--compact", children: [_jsx(Sheen, {}), _jsxs("div", { className: "account-spunkram__inner", children: [_jsx(Kicker, { children: "Sessions" }), sessionDevices.length === 0 ? (_jsx("p", { className: "account-spunkram__empty", children: "No devices listed" })) : (sessionDevices.map((device) => {
                                                const fp = parseDeviceFingerprint(device.user_fingerprint || "");
                                                const isCurrent = device.current || (fp.mac && fp.mac === currentMac);
                                                const osHint = (fp.os || "").toLowerCase().includes("win")
                                                    ? "Windows"
                                                    : fp.os
                                                        ? "macOS"
                                                        : sys.os || "Device";
                                                return (_jsxs("div", { className: "account-spunkram__device", children: [_jsxs("div", { className: "account-spunkram__grow", children: [_jsxs("p", { className: "account-spunkram__device-name", children: [device.name || fp.user || "Device", _jsx("span", { className: "account-spunkram__os", children: osHint })] }), _jsx("p", { className: "account-spunkram__device-meta", children: (fp.mac || "—") + " · " + (device.ip || "—") })] }), isCurrent ? (_jsx("span", { className: "account-spunkram__current", children: "This device" })) : (_jsx("button", { type: "button", className: "account-btn account-btn--ghost account-btn--tiny account-btn--danger", disabled: busy, onClick: () => void handleRevoke(device.revokeIds), children: "Revoke" }))] }, device.revokeIds.join("-") || device.id || `${device.ip}-${device.user_fingerprint}`));
                                            }))] })] }), _jsxs("section", { className: "account-spunkram__card account-spunkram__card--compact", children: [_jsx(Sheen, {}), _jsxs("div", { className: "account-spunkram__inner", children: [_jsxs("div", { className: "account-spunkram__tile-head", children: [_jsx("p", { className: "account-spunkram__tile-title", children: "Need any help?" }), _jsxs("button", { type: "button", className: "account-btn account-btn--ghost account-btn--tiny", onClick: openMotionflowContact, children: ["Contact", _jsx(ArrowUpRight, { className: "size-3.5" })] })] }), _jsx("p", { className: "account-spunkram__sub", children: "If you have a question or run into an issue, get in touch \u2014 we\u2019ll help you resolve it." })] })] })] }) }) })] }));
}
