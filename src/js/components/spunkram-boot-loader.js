import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import logo from "@/assets/logo.png";
import "./spunkram-boot-loader.scss";
/** Auth-boot splash: header-style logo orb + soft pulse rings. */
export function SpunkramBootLoader() {
    return (_jsxs("div", { className: "spunkram-boot", role: "status", "aria-live": "polite", children: [_jsxs("div", { className: "spunkram-boot__stage", "aria-hidden": true, children: [_jsx("span", { className: "spunkram-boot__ring spunkram-boot__ring--a" }), _jsx("span", { className: "spunkram-boot__ring spunkram-boot__ring--b" }), _jsx("span", { className: "spunkram-boot__ring spunkram-boot__ring--c" }), _jsx("div", { className: "spunkram-boot__logo", children: _jsx("img", { src: logo, alt: "", draggable: false }) })] }), _jsx("span", { className: "spunkram-boot__label", children: "Loading" })] }));
}
