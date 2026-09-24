import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const ActionCard = ({ icon, title, subtitle, comingSoon = false, onClick, }) => {
    const disabled = comingSoon;
    return (_jsxs("button", { type: "button", className: `action-card${disabled ? " action-card--disabled" : ""}`, disabled: disabled, onClick: onClick, "aria-disabled": disabled, children: [_jsx("span", { className: "action-card__icon", "aria-hidden": true, children: icon }), _jsxs("span", { className: "action-card__content", children: [_jsxs("span", { className: "action-card__title-row", children: [_jsx("span", { className: "action-card__title", children: title }), comingSoon && (_jsx("span", { className: "action-card__badge", children: "Coming Soon" }))] }), _jsx("span", { className: "action-card__subtitle", children: subtitle })] })] }));
};
