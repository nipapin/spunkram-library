import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canPreviewFamily, cssFontFamily, getFontCatalog, subscribeFontCatalog, pickFaceForFamily, resolveFontFace, } from "../lib/utils/system-fonts";
import "./FontPicker.scss";
const FontMenu = ({ open, anchor, width, onClose, children, }) => {
    const menuRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0, width });
    useEffect(() => {
        if (!open || !anchor)
            return;
        const place = () => {
            const rect = anchor.getBoundingClientRect();
            const menuHeight = menuRef.current?.offsetHeight || 280;
            let top = rect.bottom + 4;
            if (top + menuHeight > window.innerHeight - 8) {
                top = Math.max(8, rect.top - menuHeight - 4);
            }
            const next = { top, left: rect.left, width: Math.max(width, rect.width) };
            setPos((prev) => prev.top === next.top && prev.left === next.left && prev.width === next.width ? prev : next);
        };
        place();
        const frame = requestAnimationFrame(place);
        return () => cancelAnimationFrame(frame);
    }, [open, anchor, width]);
    useEffect(() => {
        if (!open)
            return;
        const onPointer = (e) => {
            const target = e.target;
            if (menuRef.current?.contains(target) || anchor?.contains(target))
                return;
            onClose();
        };
        const onKey = (e) => {
            if (e.key === "Escape")
                onClose();
        };
        document.addEventListener("mousedown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open, anchor, onClose]);
    if (!open)
        return null;
    return createPortal(_jsx("div", { ref: menuRef, className: "font-picker__menu", style: { top: pos.top, left: pos.left, width: pos.width }, role: "listbox", children: children }), document.body);
};
export const FontPicker = ({ value, onChange, }) => {
    const [catalog, setCatalog] = useState(null);
    const [loadingFonts, setLoadingFonts] = useState(false);
    const [open, setOpen] = useState(null);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const familyWrap = useRef(null);
    const familyInput = useRef(null);
    const styleBtn = useRef(null);
    const listRef = useRef(null);
    useEffect(() => {
        if (!open)
            return;
        let cancelled = false;
        setLoadingFonts(true);
        const unsub = subscribeFontCatalog((next) => {
            if (cancelled)
                return;
            setCatalog(next);
            setLoadingFonts(false);
        });
        getFontCatalog()
            .then((next) => {
            if (cancelled)
                return;
            setCatalog(next);
            setLoadingFonts(false);
        })
            .catch(() => {
            if (!cancelled)
                setLoadingFonts(false);
        });
        return () => {
            cancelled = true;
            unsub();
        };
    }, [open]);
    useEffect(() => {
        if (open !== "family")
            return;
        setQuery("");
        setActiveIndex(0);
        requestAnimationFrame(() => {
            familyInput.current?.focus();
            familyInput.current?.select();
        });
    }, [open]);
    const current = useMemo(() => resolveFontFace(catalog, value), [catalog, value]);
    const families = useMemo(() => {
        const names = catalog ? catalog.families.map((f) => f.name) : [];
        if (current.family && !names.includes(current.family))
            names.push(current.family);
        return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    }, [catalog, current.family]);
    const filteredFamilies = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q)
            return families;
        return families.filter((name) => name.toLowerCase().includes(q));
    }, [families, query]);
    useEffect(() => {
        setActiveIndex(0);
    }, [query]);
    useEffect(() => {
        if (open !== "family")
            return;
        const el = listRef.current?.querySelector("[data-active='true']");
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open, filteredFamilies]);
    const styleOptions = useMemo(() => {
        if (!catalog) {
            return current.id ? [{ id: current.id, family: current.family, style: current.style || "Regular" }] : [];
        }
        const group = catalog.families.find((f) => f.name === current.family);
        const faces = group?.faces ?? [];
        if (current.id && !faces.some((f) => f.id === current.id)) {
            return [{ id: current.id, family: current.family, style: current.style || current.id }, ...faces];
        }
        return faces;
    }, [catalog, current.family, current.id, current.style]);
    const onFamilyChange = (family) => {
        if (!catalog)
            return;
        const group = catalog.families.find((f) => f.name === family);
        const next = pickFaceForFamily(group, current.style);
        if (next)
            onChange(next.id);
        setQuery("");
        setOpen(null);
    };
    const onStyleChange = (face) => {
        if (face.id)
            onChange(face.id);
        setOpen(null);
    };
    const familyOpen = open === "family";
    const inputValue = familyOpen ? query : current.family;
    const previewFamily = !familyOpen && canPreviewFamily(current.family) ? current.family : "";
    const onFamilyKeyDown = (e) => {
        if (!familyOpen) {
            if (e.key === "ArrowDown" || e.key === "Enter") {
                e.preventDefault();
                setOpen("family");
            }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(filteredFamilies.length - 1, i + 1));
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
        }
        else if (e.key === "Enter") {
            e.preventDefault();
            const pick = filteredFamilies[activeIndex] ?? filteredFamilies[0];
            if (pick)
                onFamilyChange(pick);
        }
        else if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
            setOpen(null);
        }
    };
    return (_jsxs("div", { className: "font-picker", children: [_jsxs("div", { ref: familyWrap, className: `font-picker__field ${familyOpen ? "font-picker__field--open" : ""}`, children: [_jsx(Search, { size: 12, className: "font-picker__search-icon" }), _jsx("input", { ref: familyInput, className: "font-picker__input", value: inputValue, placeholder: current.family || "Search fonts", "aria-label": "Font family", "aria-autocomplete": "list", "aria-expanded": familyOpen, "aria-haspopup": "listbox", role: "combobox", style: previewFamily ? { fontFamily: cssFontFamily(previewFamily) } : undefined, onChange: (e) => {
                            setQuery(e.target.value);
                            if (open !== "family")
                                setOpen("family");
                        }, onFocus: () => setOpen("family"), onKeyDown: onFamilyKeyDown }), _jsx("button", { type: "button", className: "font-picker__chevron", tabIndex: -1, "aria-label": "Toggle font list", onMouseDown: (e) => e.preventDefault(), onClick: () => setOpen((v) => (v === "family" ? null : "family")), children: _jsx(ChevronDown, { size: 12 }) })] }), _jsxs("button", { ref: styleBtn, type: "button", className: `font-picker__btn font-picker__btn--style ${open === "style" ? "font-picker__btn--open" : ""}`, disabled: !styleOptions.length, "aria-haspopup": "listbox", "aria-expanded": open === "style", "aria-label": "Font style", onClick: () => setOpen((v) => (v === "style" ? null : "style")), children: [_jsx("span", { className: "font-picker__label", children: current.style || "Regular" }), _jsx(ChevronDown, { size: 12 })] }), _jsx(FontMenu, { open: familyOpen, anchor: familyWrap.current, width: 240, onClose: () => setOpen(null), children: _jsx("div", { ref: listRef, className: "font-picker__list", children: loadingFonts && !catalog ? (_jsx("div", { className: "font-picker__empty", children: "Loading fonts\u2026" })) : filteredFamilies.length ? (filteredFamilies.map((family, i) => (_jsx("button", { type: "button", role: "option", "data-active": i === activeIndex, "aria-selected": family === current.family, className: `font-picker__option ${family === current.family ? "font-picker__option--selected" : ""} ${i === activeIndex ? "font-picker__option--active" : ""}`, style: canPreviewFamily(family) ? { fontFamily: cssFontFamily(family) } : undefined, onMouseDown: (e) => e.preventDefault(), onMouseEnter: () => setActiveIndex(i), onClick: () => onFamilyChange(family), children: family }, family)))) : (_jsx("div", { className: "font-picker__empty", children: "No fonts match" })) }) }), _jsx(FontMenu, { open: open === "style", anchor: styleBtn.current, width: 140, onClose: () => setOpen(null), children: _jsx("div", { className: "font-picker__list", children: styleOptions.map((face) => (_jsx("button", { type: "button", role: "option", "aria-selected": face.id === current.id, className: `font-picker__option ${face.id === current.id ? "font-picker__option--selected font-picker__option--active" : ""}`, style: canPreviewFamily(current.family)
                            ? { fontFamily: cssFontFamily(current.family) }
                            : undefined, onClick: () => onStyleChange(face), children: face.style }, face.id))) }) })] }));
};
