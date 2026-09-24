import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import "./ConfirmDialog.scss";
export const ConfirmDialog = ({ open, title, message, confirmLabel = "OK", cancelLabel = "Cancel", onConfirm, onCancel, }) => {
    if (!open)
        return null;
    return (_jsx("div", { className: "confirm-dialog-overlay", role: "dialog", "aria-modal": "true", "aria-labelledby": "confirm-dialog-title", children: _jsxs("div", { className: "confirm-dialog", children: [_jsx("p", { id: "confirm-dialog-title", className: "confirm-dialog__title", children: title }), _jsx("p", { className: "confirm-dialog__message", children: message }), _jsxs("div", { className: "confirm-dialog__actions", children: [_jsx("button", { type: "button", className: "btn btn--ghost", onClick: onCancel, children: cancelLabel }), _jsx("button", { type: "button", className: "btn btn--primary", onClick: onConfirm, children: confirmLabel })] })] }) }));
};
