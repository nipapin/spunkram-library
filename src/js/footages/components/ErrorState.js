import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CircleAlert } from "lucide-react";
export default function ErrorState({ message = "Failed to load media", onRetry, }) {
    return (_jsxs("div", { className: "flex flex-1 flex-col items-center justify-center gap-4 py-12 text-muted-foreground", children: [_jsx(CircleAlert, { className: "size-10 opacity-60", strokeWidth: 1.5 }), _jsx("p", { className: "text-sm", children: message }), onRetry && (_jsx("button", { type: "button", onClick: onRetry, className: "rounded-full border border-white/10 bg-secondary/60 px-3 py-1 text-xs text-foreground hover:bg-secondary", children: "Retry" }))] }));
}
