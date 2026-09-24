import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ExternalLink, Loader2, LogIn, Monitor, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { FogBackground } from "@/components/fog-background";
import logo from "@/assets/logo.png";
import galLogo from "@/ui/gal/assets/logo-mark.png";
import { BRAND } from "@brands";
import { friendlyErrorMessage } from "@/utils/user-error";
const ACCENT_PILL = "pill-brand";
function accountInitial(account) {
    const source = (account.name || account.email || "?").trim();
    return source.charAt(0).toUpperCase() || "?";
}
function deviceLabel(name, fingerprint) {
    if (name?.trim())
        return name.trim();
    if (!fingerprint)
        return "Unknown device";
    try {
        const parsed = JSON.parse(fingerprint);
        const parts = [parsed.user, parsed.os].filter(Boolean);
        if (parts.length)
            return parts.join(" · ");
    }
    catch {
        /* ignore */
    }
    return "Unknown device";
}
export function LoginScreen() {
    const { loginWithMotionflow, switchAccount, cancelLogin, confirmReplaceDevice, loginBusy, loginCode, loginDeviceLimit, savedAccounts, } = useAuth();
    const [message, setMessage] = useState(null);
    const [switchingId, setSwitchingId] = useState(null);
    const [replacingId, setReplacingId] = useState(null);
    const showChooser = savedAccounts.length > 0 && !loginBusy;
    const showDeviceLimit = Boolean(loginBusy && loginDeviceLimit);
    const isGal = BRAND.id === "gal";
    const brandLogo = isGal ? galLogo : logo;
    async function handleSignIn() {
        setMessage({ tone: "info", text: "Opening browser to sign in…" });
        const result = await loginWithMotionflow();
        if (!result.ok) {
            setMessage({
                tone: "error",
                text: friendlyErrorMessage(result.message || "Sign in failed"),
            });
            return;
        }
        setMessage({ tone: "success", text: result.message || "Signed in" });
    }
    async function handlePickAccount(account) {
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
    function handleRevokeAndContinue(deviceId) {
        setReplacingId(deviceId);
        setMessage({ tone: "info", text: "Disconnecting device and finishing sign-in…" });
        confirmReplaceDevice(deviceId);
    }
    return (_jsxs("div", { className: cn("relative flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-hidden px-6 text-foreground", isGal && "gal-login"), children: [isGal ? null : (_jsx(FogBackground, { className: "pointer-events-none absolute inset-0 z-0" })), _jsxs("div", { className: "relative z-10 flex w-full max-w-xs flex-col items-center gap-4", children: [_jsxs("div", { className: "flex flex-col items-center gap-3 text-center", children: [_jsx("div", { className: cn("flex size-16 items-center justify-center", isGal
                                    ? "gal-login__mark"
                                    : "rounded-full bg-gradient-to-b from-primary to-primary/70 shadow-[0_0_20px_2px] shadow-primary/50 ring-1 ring-inset ring-white/15"), children: _jsx("img", { src: brandLogo, alt: BRAND.authorName, width: 48, height: 48, className: cn("object-contain", isGal ? "size-12" : "size-11"), draggable: false }) }), _jsxs("div", { children: [_jsx("h1", { className: "font-headline text-lg font-semibold tracking-tight drop-shadow-[0_1px_8px_rgba(0,0,0,0.65)]", children: showDeviceLimit
                                            ? "Device limit reached"
                                            : showChooser
                                                ? "Choose an account"
                                                : `Welcome to ${BRAND.authorName}` }), _jsx("p", { className: "mt-1 max-w-xs text-[11px] text-muted-foreground drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]", children: showDeviceLimit
                                            ? `This account is signed in on ${loginDeviceLimit.device_limit} devices. Disconnect one to continue here.`
                                            : showChooser
                                                ? "Continue with a saved Motionflow account, or add another."
                                                : `Sign in with your Motionflow account to use the ${BRAND.authorName} extension — packs, subscriptions, and AI tools.` })] })] }), message && !showDeviceLimit && (_jsx("div", { className: cn("w-full rounded-lg border px-3 py-2 text-[11px] backdrop-blur-md", message.tone === "error" &&
                            "border-destructive/40 bg-destructive/20 text-destructive", message.tone === "success" &&
                            "border-emerald-500/30 bg-emerald-500/15 text-emerald-300", message.tone === "info" &&
                            "border-white/10 bg-card/70 text-muted-foreground"), children: message.text })), showDeviceLimit ? (_jsxs("div", { className: "w-full overflow-hidden rounded-xl border border-amber-500/30 bg-card/80 backdrop-blur-md", children: [loginDeviceLimit.devices.length === 0 ? (_jsx("p", { className: "px-3 py-3 text-center text-[11px] text-muted-foreground", children: "Couldn't load the device list. Cancel and sign in again, or disconnect a device at motionflow.pro." })) : null, _jsx("ul", { children: loginDeviceLimit.devices.map((device, index) => {
                                    const busy = replacingId === device.id;
                                    return (_jsx("li", { className: cn(index > 0 && "border-t border-white/5"), children: _jsxs("div", { className: "flex items-center gap-2.5 px-3 py-2.5", children: [_jsx("span", { className: "flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400", children: _jsx(Monitor, { className: "size-3.5" }) }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block truncate text-xs font-medium text-foreground", children: deviceLabel(device.name, device.user_fingerprint) }), _jsxs("span", { className: "block truncate text-[10px] text-muted-foreground", children: [device.ip || "—", device.last_seen_at
                                                                    ? ` · ${new Date(device.last_seen_at).toLocaleDateString()}`
                                                                    : ""] })] }), _jsx("button", { type: "button", disabled: Boolean(replacingId), onClick: () => handleRevokeAndContinue(device.id), className: "shrink-0 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[10px] font-medium text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-50", children: busy ? (_jsx(Loader2, { className: "size-3 animate-spin" })) : ("Disconnect") })] }) }, device.id));
                                }) })] })) : null, loginBusy && loginCode && !showDeviceLimit && (_jsxs("div", { className: "w-full rounded-xl border border-primary/30 bg-card/70 px-3 py-3 text-center backdrop-blur-md", children: [_jsx("p", { className: "text-[10px] uppercase tracking-wide text-muted-foreground", children: "Confirm this code in the browser" }), _jsx("p", { className: "mt-1 font-mono text-lg font-semibold tracking-widest text-foreground", children: loginCode }), _jsxs("p", { className: "mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground", children: [_jsx(Loader2, { className: "size-3 animate-spin" }), "Waiting for confirmation\u2026"] }), _jsx("p", { className: "mt-1 text-[10px] text-muted-foreground/80", children: "After confirming in the browser, click this panel if it stays here." })] })), showChooser && (_jsx("ul", { className: "w-full overflow-hidden rounded-xl border border-white/10 bg-card/70 backdrop-blur-md", children: savedAccounts.map((account, index) => {
                            const busy = switchingId === account.id;
                            return (_jsx("li", { children: _jsxs("button", { type: "button", disabled: Boolean(switchingId), onClick: () => void handlePickAccount(account), className: cn("flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors", "hover:bg-white/5 disabled:opacity-60", index > 0 && "border-t border-white/5"), children: [_jsx("span", { className: "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary", children: busy ? (_jsx(Loader2, { className: "size-3.5 animate-spin" })) : (accountInitial(account)) }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block truncate text-xs font-medium text-foreground", children: account.name || account.email }), _jsx("span", { className: "block truncate text-[10px] text-muted-foreground", children: account.email })] }), _jsx(UserRound, { className: "size-3.5 shrink-0 text-muted-foreground/60" })] }) }, account.id));
                        }) })), _jsx("div", { className: "flex w-full flex-col gap-2", children: loginBusy ? (_jsx("button", { type: "button", onClick: cancelLogin, disabled: Boolean(replacingId), className: "flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-card/70 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-md transition-colors hover:bg-card disabled:opacity-50", children: "Cancel" })) : showChooser ? (_jsxs("button", { type: "button", disabled: Boolean(switchingId), onClick: () => void handleSignIn(), className: "flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-card/70 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-md transition-colors hover:bg-card disabled:opacity-50", children: [_jsx(Plus, { className: "size-3.5" }), "Use another account", _jsx(ExternalLink, { className: "size-3 opacity-70" })] })) : (_jsxs("button", { type: "button", onClick: () => void handleSignIn(), className: cn("flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium", ACCENT_PILL), children: [_jsx(LogIn, { className: "size-3.5" }), "Sign in to ", BRAND.authorName, _jsx(ExternalLink, { className: "size-3 opacity-70" })] })) })] })] }));
}
