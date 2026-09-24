import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { galAccountPlanLabel, resolveGalAccountPlan, } from "@/lib/utils/gal-plan";
import { currentPackHost } from "@/lib/utils/pack-host";
import { accountInitial } from "./GalProfile";
import "./gal-account.scss";
export function GalProfileMenu({ onOpenProfile, onOpenSettings, }) {
    const { auth, subscription, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const rootRef = useRef(null);
    const host = currentPackHost();
    const galPlan = useMemo(() => resolveGalAccountPlan({
        subscribed: subscription.subscribed,
        purchases: subscription.purchases,
        host,
    }), [subscription.subscribed, subscription.purchases, host]);
    const statusLabel = subscription.error
        ? "Error"
        : galAccountPlanLabel(galPlan);
    const planAccent = !subscription.error && galPlan !== "free";
    const initial = accountInitial(auth.email, auth.name);
    useEffect(() => {
        if (!open)
            return;
        const onPointerDown = (e) => {
            if (!rootRef.current?.contains(e.target))
                setOpen(false);
        };
        const onKeyDown = (e) => {
            if (e.key === "Escape")
                setOpen(false);
        };
        window.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);
    async function handleLogout() {
        setBusy(true);
        setOpen(false);
        await logout();
        setBusy(false);
    }
    return (_jsxs("div", { className: "gal-profile-menu", ref: rootRef, children: [_jsx("button", { type: "button", className: "gal-profile-menu__trigger", "aria-label": "Account menu", "aria-haspopup": "menu", "aria-expanded": open, onClick: () => setOpen((v) => !v), children: _jsx("span", { className: "gal-profile-menu__avatar", "aria-hidden": true, children: initial }) }), open ? (_jsxs("div", { className: "gal-profile-menu__dropdown", role: "menu", children: [_jsxs("div", { className: "gal-profile-menu__card", children: [_jsx("div", { className: "gal-profile-menu__card-avatar", "aria-hidden": true, children: initial }), _jsxs("div", { className: "gal-profile-menu__card-copy", children: [_jsx("p", { className: "gal-profile-menu__email", children: auth.email || "Signed in" }), _jsxs("p", { className: "gal-profile-menu__plan", children: ["Plan", " ", _jsx("span", { className: planAccent
                                                    ? "gal-profile-menu__plan-value"
                                                    : "gal-profile-menu__plan-value is-muted", children: statusLabel })] })] })] }), _jsxs("button", { type: "button", role: "menuitem", className: "gal-profile-menu__item", onClick: () => {
                            setOpen(false);
                            onOpenProfile();
                        }, children: [_jsx(User, { className: "size-3.5", "aria-hidden": true }), "Profile"] }), _jsxs("button", { type: "button", role: "menuitem", className: "gal-profile-menu__item", onClick: () => {
                            setOpen(false);
                            onOpenSettings();
                        }, children: [_jsx(Settings, { className: "size-3.5", "aria-hidden": true }), "Settings"] }), _jsx("div", { className: "gal-profile-menu__divider", role: "separator" }), _jsxs("button", { type: "button", role: "menuitem", className: "gal-profile-menu__item gal-profile-menu__item--danger", disabled: busy, onClick: () => void handleLogout(), children: [_jsx(LogOut, { className: "size-3.5", "aria-hidden": true }), "Log out"] })] })) : null] }));
}
