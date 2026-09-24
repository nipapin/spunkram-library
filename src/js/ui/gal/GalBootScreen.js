import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { BRAND } from "@brands";
import logo from "./assets/logo.png";
export function GalBootScreen({ percent, error, onRetry, }) {
    const pct = Math.max(0, Math.min(100, Math.round(percent)));
    const isError = Boolean(error);
    return (_jsx("div", { className: "gal-shell gal-shell--boot", role: "status", "aria-live": "polite", "aria-busy": !isError, "aria-label": isError
            ? "Couldn’t finish loading"
            : `${BRAND.panelDisplayName} loading`, children: _jsxs("div", { className: "gal-boot", children: [_jsxs("div", { className: "gal-boot__mark", children: [_jsx("span", { className: "gal-boot__glow" }), _jsx("img", { className: "gal-boot__logo", src: logo, alt: "", draggable: false })] }), isError ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "gal-boot__error", children: error }), onRetry ? (_jsx("button", { type: "button", className: "gal-boot__retry", onClick: onRetry, children: "Try again" })) : null] })) : (_jsx("div", { className: "gal-boot__track", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct, children: _jsx("div", { className: "gal-boot__fill", style: { width: `${pct}%` } }) }))] }) }));
}
