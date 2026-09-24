import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Infinity as InfinityIcon, Loader2, Plus, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MAX_MOTIONFLOW_ACCOUNTS, } from "@/lib/api/preferences";
import { getUserSystemData } from "@/lib/api/usp";
import { parseDeviceFingerprint } from "@/lib/api/market-api";
import { GAL_DEV_PLANS, galAccountPlanLabel, resolveGalAccountPlan, } from "@/lib/utils/gal-plan";
import { isReleaseAdminEmail } from "@/api/update";
import { currentPackHost } from "@/lib/utils/pack-host";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
import { useGenerationsBalance } from "@/hooks/use-generations-balance";
import "./gal-settings.scss";
import "./gal-account.scss";
export function accountInitial(email, name) {
    const source = (name || email || "?").trim();
    return source.charAt(0).toUpperCase() || "?";
}
function realMacHex(raw) {
    const hex = (raw || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
    return hex.length === 12 ? hex : null;
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
        const fp = parseDeviceFingerprint(device.user_fingerprint || "");
        const mac = realMacHex(fp.mac);
        const ip = (device.ip || "").trim().toLowerCase();
        const name = (device.name || fp.user || "").trim().toLowerCase();
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
            list.find((d) => realMacHex(parseDeviceFingerprint(d.user_fingerprint).mac) ===
                currentMacHex) ||
            list[0];
        unique.push({
            ...preferred,
            current: list.some((d) => d.current) ||
                list.some((d) => realMacHex(parseDeviceFingerprint(d.user_fingerprint).mac) ===
                    currentMacHex) ||
                preferred.current,
            revokeIds: [...new Set(list.map((d) => d.id).filter(Boolean))],
        });
    }
    unique.sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)));
    return unique;
}
export function GalProfile() {
    const { auth, prefs, setPrefs, subscription, revoke, savedAccounts, addAccount, switchAccount, removeSavedAccount, cancelLogin, confirmReplaceDevice, loginBusy, loginCode, loginDeviceLimit, } = useAuth();
    const gens = useGenerationsBalance();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(null);
    const [replacingId, setReplacingId] = useState(null);
    const sys = useMemo(() => getUserSystemData(), []);
    const host = currentPackHost();
    const gensLimitLabel = gens.monthlyLimit != null ? String(gens.monthlyLimit) : "—";
    const otherAccounts = useMemo(() => savedAccounts.filter((a) => a.id !== auth.id), [savedAccounts, auth.id]);
    const canAddAccount = savedAccounts.length < MAX_MOTIONFLOW_ACCOUNTS;
    const showDeviceLimit = Boolean(loginBusy && loginDeviceLimit);
    const isAdmin = isReleaseAdminEmail(auth.email);
    const galPlan = useMemo(() => resolveGalAccountPlan({
        subscribed: subscription.subscribed,
        purchases: subscription.purchases,
        host,
    }), [subscription.subscribed, subscription.purchases, host]);
    function patch(partial) {
        setPrefs({ ...prefs, ...partial });
    }
    function setAdminDevPlan(plan) {
        patch({ adminDevPlan: plan });
    }
    const sessionDevices = useMemo(() => uniqueSessionDevices(subscription.devices, sys.mac), [subscription.devices, sys.mac]);
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
        if (!result.ok)
            setMessage(result.message || "Could not add account");
        else
            setMessage(result.message || "Account added");
    }
    async function handleSwitchAccount(id) {
        setBusy(true);
        setMessage(null);
        const result = await switchAccount(id);
        setBusy(false);
        setMessage(result.ok
            ? result.message || "Switched account"
            : result.message || "Switch failed");
    }
    async function handleRemoveAccount(id) {
        setBusy(true);
        setMessage(null);
        const result = await removeSavedAccount(id);
        setBusy(false);
        setMessage(result.ok ? "Account removed" : result.message || "Remove failed");
    }
    function handleRevokeAndContinue(deviceId) {
        setReplacingId(deviceId);
        setMessage("Disconnecting device and finishing sign-in…");
        confirmReplaceDevice(deviceId);
    }
    async function handleRevoke(ids) {
        setBusy(true);
        setMessage(null);
        let lastError = null;
        for (const id of ids) {
            const result = await revoke(id);
            if (!result.ok)
                lastError = result.message || "Revoke failed";
        }
        setBusy(false);
        if (lastError)
            setMessage(lastError);
    }
    const statusLabel = subscription.error
        ? "Error"
        : galAccountPlanLabel(galPlan);
    const planAccent = !subscription.error && galPlan !== "free";
    return (_jsx("div", { className: "gal-settings gal-settings--embedded", children: _jsxs("div", { className: "gal-settings__body", children: [_jsx("header", { className: "gal-settings__page-head", children: _jsx("h1", { className: "gal-settings__page-title", children: "Profile" }) }), _jsxs("section", { className: "gal-account__profile", children: [_jsxs("div", { className: "gal-account__avatar-wrap", children: [_jsx("div", { className: "gal-account__avatar", children: accountInitial(auth.email, auth.name) }), _jsx("span", { className: "gal-account__dot", "aria-hidden": true })] }), _jsxs("div", { className: "gal-account__profile-copy", children: [_jsx("p", { className: "gal-account__email", children: auth.email || "Signed in" }), _jsxs("p", { className: "gal-account__status", children: ["Plan", " ", _jsx("span", { className: planAccent
                                                ? "gal-account__status-value"
                                                : "gal-account__status-value gal-account__status-value--muted", children: statusLabel })] }), isAdmin ? (_jsxs("div", { className: "gal-account__dev-plan", children: [_jsxs("span", { className: "gal-account__plan-switch", role: "group", "aria-label": "Dev plan", children: [GAL_DEV_PLANS.map((plan) => (_jsx("button", { type: "button", className: prefs.adminDevPlan === plan
                                                        ? "gal-account__plan-chip is-active"
                                                        : "gal-account__plan-chip", onClick: () => setAdminDevPlan(plan), children: galAccountPlanLabel(plan) }, plan))), _jsx("button", { type: "button", className: !prefs.adminDevPlan
                                                        ? "gal-account__plan-chip is-active"
                                                        : "gal-account__plan-chip", onClick: () => patch({ adminDevPlan: "" }), children: "Live" })] }), _jsx("p", { className: "gal-account__dev-hint", children: "Dev test \u00B7 local only" })] })) : null] })] }), message ? _jsx("p", { className: "gal-account__msg", children: message }) : null, _jsxs("section", { className: "gal-settings__block gal-account__gens", children: [_jsxs("div", { className: "gal-settings__block-head", children: [_jsxs("h2", { children: [_jsx(Sparkles, { className: "size-3.5", strokeWidth: 2.25 }), "AI Generations"] }), _jsxs("button", { type: "button", className: "gal-settings__ghost-btn", onClick: () => openMotionflowSubscribe(), children: [_jsx(Plus, { className: "size-3" }), "Get more"] })] }), _jsxs("div", { className: "gal-account__gens-row", children: [_jsx("span", { className: "gal-account__gens-total", children: gens.totalLeft }), _jsxs("div", { className: "gal-account__gens-legend", children: [_jsxs("span", { children: [gens.monthly, "/", gensLimitLabel, " ", gens.isFreeUser ? "free plan" : "monthly"] }), !gens.isFreeUser ? (_jsxs("span", { className: "gal-account__gens-extra", children: [_jsx(InfinityIcon, { className: "size-3" }), gens.extra, " extra"] })) : null] })] }), gens.monthlyLimit == null ? (_jsx("p", { className: "gal-settings__note", children: "No Gal generation allotment yet. Credits appear after the server grants them to this account." })) : null] }), _jsxs("section", { className: "gal-settings__block", children: [_jsxs("div", { className: "gal-settings__block-head", children: [_jsx("h2", { children: "Accounts" }), _jsxs("button", { type: "button", className: "gal-settings__ghost-btn", disabled: busy || loginBusy || !canAddAccount, title: canAddAccount
                                        ? "Add another Motionflow account"
                                        : `Maximum ${MAX_MOTIONFLOW_ACCOUNTS} accounts`, onClick: () => void handleAddAccount(), children: [loginBusy && !showDeviceLimit ? (_jsx(Loader2, { className: "size-3 animate-spin" })) : (_jsx(Plus, { className: "size-3" })), "Add"] })] }), showDeviceLimit ? (_jsxs("div", { className: "gal-settings__login-panel", children: [_jsxs("p", { className: "gal-settings__note", children: ["This account is signed in on ", loginDeviceLimit.device_limit, " ", "devices. Disconnect one to continue here."] }), _jsx("ul", { className: "gal-settings__devices", children: loginDeviceLimit.devices.map((device) => {
                                        const fp = parseDeviceFingerprint(device.user_fingerprint || "");
                                        const disconnectBusy = replacingId === device.id;
                                        return (_jsxs("li", { children: [_jsxs("div", { children: [_jsx("strong", { children: device.name || fp.user || "Device" }), _jsx("span", { children: device.ip || "—" })] }), _jsx("button", { type: "button", disabled: Boolean(replacingId), onClick: () => handleRevokeAndContinue(device.id), children: disconnectBusy ? (_jsx(Loader2, { className: "size-3 animate-spin" })) : ("Disconnect") })] }, device.id));
                                    }) }), _jsx("button", { type: "button", className: "gal-settings__ghost-btn gal-settings__ghost-btn--block", onClick: cancelLogin, children: "Cancel" })] })) : null, loginBusy && loginCode && !showDeviceLimit ? (_jsxs("div", { className: "gal-settings__login-panel", children: [_jsx("p", { className: "gal-settings__note", children: "Confirm this code in the browser" }), _jsx("p", { className: "gal-settings__login-code", children: loginCode }), _jsxs("p", { className: "gal-settings__note gal-settings__note--row", children: [_jsx(Loader2, { className: "size-3 animate-spin" }), "Waiting for confirmation\u2026"] }), _jsx("button", { type: "button", className: "gal-settings__ghost-btn gal-settings__ghost-btn--block", onClick: cancelLogin, children: "Cancel" })] })) : null, !loginBusy ? (otherAccounts.length === 0 ? (_jsx("p", { className: "gal-settings__note", children: "No other accounts saved" })) : (_jsx("ul", { className: "gal-settings__devices", children: otherAccounts.map((account) => (_jsxs("li", { children: [_jsxs("div", { className: "gal-settings__account-row", children: [_jsx("span", { className: "gal-settings__account-avatar", "aria-hidden": true, children: accountInitial(account.email, account.name) }), _jsxs("div", { children: [_jsx("strong", { children: account.name || account.email }), _jsx("span", { children: account.email })] })] }), _jsxs("div", { className: "gal-settings__account-actions", children: [_jsx("button", { type: "button", disabled: busy || loginBusy, onClick: () => void handleSwitchAccount(account.id), children: "Switch" }), _jsx("button", { type: "button", className: "is-danger", disabled: busy || loginBusy, onClick: () => void handleRemoveAccount(account.id), children: "Remove" })] })] }, account.id))) }))) : null] }), _jsxs("section", { className: "gal-settings__block", children: [_jsx("h2", { children: "Active Devices" }), sessionDevices.length === 0 ? (_jsx("p", { className: "gal-settings__note", children: "No devices listed" })) : (_jsx("ul", { className: "gal-settings__devices", children: sessionDevices.map((device) => {
                                const fp = parseDeviceFingerprint(device.user_fingerprint || "");
                                return (_jsxs("li", { children: [_jsxs("div", { children: [_jsx("strong", { children: device.name || fp.user || "Device" }), _jsxs("span", { children: [device.ip, device.current ? " · This device" : ""] })] }), !device.current ? (_jsx("button", { type: "button", disabled: busy, onClick: () => void handleRevoke(device.revokeIds), children: "Revoke" })) : null] }, device.id || device.ip));
                            }) }))] })] }) }));
}
