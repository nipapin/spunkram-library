import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import "./ScrubNumber.scss";
const formatDisplay = (n) => {
    if (!Number.isFinite(n))
        return "0";
    if (Number.isInteger(n))
        return String(n);
    const rounded = Math.round(n * 100) / 100;
    return String(rounded);
};
const clamp = (n, min, max) => {
    let v = n;
    if (typeof min === "number")
        v = Math.max(min, v);
    if (typeof max === "number")
        v = Math.min(max, v);
    return v;
};
/**
 * Как в After Effects: тянешь по тексту — меняется значение,
 * клик без драга — можно ввести число с клавиатуры.
 */
export const ScrubNumber = ({ value, onChange, min, max, step, suffix, className }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const inputRef = useRef(null);
    const rootRef = useRef(null);
    // scrub state в ref — чтобы не пересоздавать listeners на каждый кадр
    const scrubRef = useRef(null);
    const effectiveStep = (() => {
        if (typeof step === "number")
            return step;
        if (typeof min === "number" && typeof max === "number") {
            const span = max - min;
            if (span <= 1)
                return 0.01;
            if (span <= 10)
                return 0.1;
            if (span <= 100)
                return 0.5;
            return 1;
        }
        return 1;
    })();
    const commitDraft = () => {
        const parsed = Number(draft.replace(",", "."));
        if (Number.isFinite(parsed))
            onChange(clamp(parsed, min, max));
        setEditing(false);
    };
    const beginEdit = () => {
        setDraft(formatDisplay(value));
        setEditing(true);
    };
    useEffect(() => {
        if (!editing)
            return;
        requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        });
    }, [editing]);
    const onPointerDown = (e) => {
        if (editing || e.button !== 0)
            return;
        e.preventDefault();
        scrubRef.current = {
            active: true,
            dragged: false,
            startX: e.clientX,
            startValue: value,
            pointerId: e.pointerId,
        };
        rootRef.current?.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
        const s = scrubRef.current;
        if (!s?.active || e.pointerId !== s.pointerId)
            return;
        const dx = e.clientX - s.startX;
        if (!s.dragged && Math.abs(dx) < 3)
            return;
        s.dragged = true;
        // Shift — грубее (×10), Alt — тоньше (/10), как в AE
        let sens = effectiveStep;
        if (e.shiftKey)
            sens *= 10;
        if (e.altKey)
            sens /= 10;
        const next = clamp(s.startValue + dx * sens * 0.15, min, max);
        // округляем к шагу, чтобы не плыла дробь
        const snapped = Math.round(next / effectiveStep) * effectiveStep;
        onChange(clamp(Number(snapped.toFixed(4)), min, max));
    };
    const onPointerUp = (e) => {
        const s = scrubRef.current;
        if (!s || e.pointerId !== s.pointerId)
            return;
        if (rootRef.current?.hasPointerCapture(e.pointerId)) {
            rootRef.current.releasePointerCapture(e.pointerId);
        }
        const wasDrag = s.dragged;
        scrubRef.current = null;
        if (!wasDrag)
            beginEdit();
    };
    if (editing) {
        return (_jsxs("span", { className: `scrub-number scrub-number--editing ${className ?? ""}`, children: [_jsx("input", { ref: inputRef, className: "scrub-number__input", value: draft, onChange: (e) => setDraft(e.target.value), onBlur: commitDraft, onKeyDown: (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commitDraft();
                        }
                        else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditing(false);
                        }
                    } }), suffix && _jsx("span", { className: "scrub-number__suffix", children: suffix })] }));
    }
    return (_jsx("span", { ref: rootRef, className: `scrub-number ${className ?? ""}`, onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onPointerCancel: onPointerUp, title: "Drag to scrub \u00B7 click to type", children: _jsxs("span", { className: "scrub-number__value", children: [formatDisplay(value), suffix ?? ""] }) }));
};
