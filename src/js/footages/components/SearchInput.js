import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Search } from "lucide-react";
export default function SearchInput(props) {
    return (_jsxs("div", { className: "relative w-44", children: [_jsx(Search, { className: "pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" }), _jsx("input", { type: "text", placeholder: "Find assets", ...props, className: "w-full rounded-full border border-[rgb(42,36,64)] bg-[rgb(14,12,26)]/50 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-[#7c4dff]/60 focus:outline-none" })] }));
}
