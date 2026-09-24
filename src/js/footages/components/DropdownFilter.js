import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import GlassMenu, { GlassMenuItem } from "./GlassMenu";
export default function DropdownFilter({ icon, title, options, onChange, }) {
    const [selected, setSelected] = useState(options[0]);
    const [anchorEl, setAnchorEl] = useState(null);
    const open = Boolean(anchorEl);
    const handleOpen = (e) => {
        e.preventDefault();
        setAnchorEl(e.currentTarget);
    };
    const handleSelect = (item) => () => {
        setSelected(item);
        onChange(item);
        setAnchorEl(null);
    };
    return (_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { title: title, className: "inline-flex items-center text-muted-foreground", children: icon }), _jsxs("button", { type: "button", onClick: handleOpen, className: cn("inline-flex items-center gap-1 rounded-md border border-white/10 bg-secondary/60 px-2 py-1", "text-[11px] capitalize text-foreground hover:bg-secondary"), children: [selected.label, _jsx(ChevronDown, { className: "size-3.5 text-muted-foreground", strokeWidth: 2 })] }, selected.value), _jsx(GlassMenu, { open: open, anchorEl: anchorEl, onClose: () => setAnchorEl(null), children: options.map((item) => (_jsx(GlassMenuItem, { onClick: handleSelect(item), children: item.label }, item.label))) })] }));
}
