import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./StyledSelect.scss";
const Menu = ({ open, anchor, onClose, children, }) => {
    const menuRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 160 });
    useEffect(() => {
        if (!open || !anchor)
            return;
        const rect = anchor.getBoundingClientRect();
        const menuHeight = menuRef.current?.offsetHeight ?? 260;
        let top = rect.bottom + 4;
        if (top + menuHeight > window.innerHeight - 8) {
            top = Math.max(8, rect.top - menuHeight - 4);
        }
        setPos({ top, left: rect.left, width: Math.max(rect.width, 140) });
    }, [open, anchor]);
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
    return createPortal(_jsx("div", { ref: menuRef, className: "styled-select__menu", style: { top: pos.top, left: pos.left, width: pos.width }, role: "listbox", children: children }), document.body);
};
export const StyledSelect = ({ value, options, onChange, ariaLabel, accent = false, className, disabled = false, placeholder, }) => {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const btnRef = useRef(null);
    const listRef = useRef(null);
    const listId = useId();
    const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
    const displayLabel = selected?.label ?? placeholder ?? value;
    useEffect(() => {
        if (!open)
            return;
        const idx = Math.max(0, options.findIndex((o) => o.value === value));
        setActiveIndex(idx);
    }, [open, options, value]);
    useEffect(() => {
        if (!open)
            return;
        const el = listRef.current?.querySelector("[data-active='true']");
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open]);
    useEffect(() => {
        if (disabled)
            setOpen(false);
    }, [disabled]);
    const pick = (next) => {
        onChange(next);
        setOpen(false);
    };
    const onKeyDown = (e) => {
        if (disabled)
            return;
        if (!open) {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen(true);
            }
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
        }
        else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const opt = options[activeIndex] ?? options[0];
            if (opt)
                pick(opt.value);
        }
        else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
        }
    };
    return (_jsxs("div", { className: `styled-select ${className ?? ""}`.trim(), children: [_jsxs("button", { ref: btnRef, type: "button", className: `styled-select__btn ${open ? "styled-select__btn--open" : ""} ${accent ? "styled-select__btn--accent" : ""} ${!selected && placeholder ? "styled-select__btn--placeholder" : ""}`, "aria-haspopup": "listbox", "aria-expanded": open, "aria-controls": listId, "aria-label": ariaLabel, disabled: disabled, onClick: () => {
                    if (disabled)
                        return;
                    setOpen((v) => !v);
                }, onKeyDown: onKeyDown, children: [_jsx("span", { className: "styled-select__label", children: displayLabel }), _jsx(ChevronDown, { size: 12 })] }), _jsx(Menu, { open: open && !disabled, anchor: btnRef.current, onClose: () => setOpen(false), children: _jsx("div", { ref: listRef, id: listId, className: "styled-select__list", children: options.map((opt, i) => (_jsx("button", { type: "button", role: "option", "data-active": i === activeIndex, "aria-selected": opt.value === value, className: `styled-select__option ${opt.value === value ? "styled-select__option--selected" : ""} ${i === activeIndex ? "styled-select__option--active" : ""}`, onMouseDown: (e) => e.preventDefault(), onMouseEnter: () => setActiveIndex(i), onClick: () => pick(opt.value), children: opt.label }, opt.value))) }) })] }));
};
