import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ArrowLeft, LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BRAND } from "@brands";
import { version as EXTENSION_VERSION } from "../../../shared/shared";
import { GalProfile } from "./GalProfile";
import { GalSettings } from "./GalSettings";
import "./gal-account-zone.scss";
export function GalAccountZone({ tab, onTabChange, onClose, onPackReady, }) {
    const { logout } = useAuth();
    const [logoutBusy, setLogoutBusy] = useState(false);
    async function handleLogout() {
        setLogoutBusy(true);
        await logout();
        setLogoutBusy(false);
    }
    return (_jsxs("div", { className: "gal-account-zone", children: [_jsxs("aside", { className: "gal-account-zone__rail", children: [_jsxs("div", { className: "gal-account-zone__rail-top", children: [_jsx("button", { type: "button", className: "gal-account-zone__back", onClick: onClose, "aria-label": "Back", children: _jsx(ArrowLeft, { className: "size-3.5" }) }), _jsx("p", { className: "gal-account-zone__brand", title: BRAND.panelDisplayName, children: BRAND.panelDisplayName })] }), _jsxs("nav", { className: "gal-account-zone__nav", "aria-label": "Account", children: [_jsxs("button", { type: "button", className: tab === "profile"
                                    ? "gal-account-zone__nav-item is-active"
                                    : "gal-account-zone__nav-item", "aria-current": tab === "profile" ? "page" : undefined, onClick: () => onTabChange("profile"), children: [_jsx(User, { className: "size-3.5", "aria-hidden": true }), "Profile"] }), _jsxs("button", { type: "button", className: tab === "settings"
                                    ? "gal-account-zone__nav-item is-active"
                                    : "gal-account-zone__nav-item", "aria-current": tab === "settings" ? "page" : undefined, onClick: () => onTabChange("settings"), children: [_jsx(Settings, { className: "size-3.5", "aria-hidden": true }), "Settings"] })] }), _jsxs("div", { className: "gal-account-zone__rail-foot", children: [_jsxs("button", { type: "button", className: "gal-account-zone__logout", disabled: logoutBusy, onClick: () => void handleLogout(), children: [_jsx(LogOut, { className: "size-3.5", "aria-hidden": true }), "Log Out"] }), _jsxs("span", { className: "gal-account-zone__version", children: ["v", EXTENSION_VERSION] })] })] }), _jsx("div", { className: "gal-account-zone__main", children: tab === "profile" ? (_jsx(GalProfile, {})) : (_jsx(GalSettings, { onPackReady: onPackReady })) })] }));
}
