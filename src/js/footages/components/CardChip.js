import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "@/lib/utils";
export default function CardChip({ children, className, onClick, }) {
    return (_jsx("div", { className: cn("absolute rounded-lg border border-white/10 bg-card/90 text-card-foreground", className), onClick: onClick, children: children }));
}
