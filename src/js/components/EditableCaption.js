import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Check, Pencil, X } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatTimestamp } from "../utils/transcribe";
import "./EditableCaption.scss";
// memo + локальный стейт: ввод перерисовывает только этот блок
export const EditableCaption = memo(function EditableCaption({ caption, index, fontSize, offset, sentenceCount, captionCount, highlighted, onSave, onSeek, onSplit, onMerge, onMoveWord, onSplitWords, }) {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(caption.text);
    const [menu, setMenu] = useState(null);
    const menuRef = useRef(null);
    useEffect(() => {
        if (!editing)
            setText(caption.text);
    }, [caption.text, editing]);
    // закрываем контекстное меню по клику вне него или по Escape (раньше это делал MUI Menu)
    useEffect(() => {
        if (!menu)
            return;
        const onPointerDown = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target))
                setMenu(null);
        };
        const onKeyDown = (e) => {
            if (e.key === "Escape")
                setMenu(null);
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [menu]);
    // держим меню в границах панели — рядом с нижними сегментами оно иначе уезжает за экран
    useLayoutEffect(() => {
        const el = menuRef.current;
        if (!menu || !el)
            return;
        const { width, height } = el.getBoundingClientRect();
        const x = Math.max(4, Math.min(menu.x, window.innerWidth - width - 4));
        const y = Math.max(4, Math.min(menu.y, window.innerHeight - height - 4));
        if (Math.abs(x - menu.x) < 0.5 && Math.abs(y - menu.y) < 0.5)
            return;
        setMenu({ ...menu, x, y });
    }, [menu]);
    const startEdit = () => {
        setText(caption.text);
        setEditing(true);
    };
    const save = () => {
        setEditing(false);
        if (text.trim() !== caption.text.trim())
            onSave(caption, text);
    };
    const cancel = () => {
        setEditing(false);
        setText(caption.text);
    };
    // Ctrl/Cmd+Enter — быстрое сохранение без мышки, обычный Enter оставляем
    // для перевода строки в textarea
    const onTextareaKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            save();
        }
        else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
        }
    };
    const openMenu = (e, wordPos) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, wordPos });
    };
    const closeMenu = () => setMenu(null);
    // клик по карточке — переход плейхеда хоста на начало сегмента; игнорируем клики
    // по кнопкам редактирования, textarea и контекстному меню, чтобы не мешать им
    const onCardClick = (e) => {
        if (editing)
            return;
        const target = e.target;
        if (target.closest(".caption-card__actions") || target.closest(".menu"))
            return;
        onSeek(caption);
    };
    // ПКМ-меню доступно для любого caption со словами (все режимы)
    const hasWords = !editing && !!caption.words?.length;
    // custom-режим: разбиваем плоский список слов на строки по lineWordCounts,
    // чтобы отображение уважало реально посчитанные lines/characters, а не
    // просто переносило слова по ширине карточки
    const wordLineGroups = hasWords && caption.lineWordCounts && caption.lineWordCounts.length > 1
        ? (() => {
            const groups = [];
            let pos = 0;
            for (const count of caption.lineWordCounts) {
                const group = caption.words.slice(pos, pos + count).map((word, i) => ({ word, pos: pos + i }));
                groups.push(group);
                pos += count;
            }
            return groups;
        })()
        : null;
    const isSentence = caption.edit.target === "sentence";
    const sentenceIndex = caption.edit.target === "sentence" ? caption.edit.index : -1;
    const canSplit = !!menu && isSentence && menu.wordPos > 0 && menu.wordPos < (caption.words?.length ?? 0);
    const canMergePrev = isSentence && sentenceIndex > 0;
    const canMergeNext = isSentence && sentenceIndex >= 0 && sentenceIndex < sentenceCount - 1;
    const canMovePrev = index > 0 && (caption.words?.length ?? 0) > 0;
    const canMoveNext = index < captionCount - 1 && (caption.words?.length ?? 0) > 0;
    const canSplitWords = (caption.words?.length ?? 0) > 1;
    return (_jsxs("div", { "data-caption-index": index, className: `caption-card ${editing ? "caption-card--editing" : ""} ${highlighted ? "caption-card--highlight" : ""}`, onClick: onCardClick, children: [_jsxs("div", { className: "caption-card__head", children: [_jsxs("p", { className: "caption-card__time", children: [formatTimestamp(caption.timestamp[0] + offset), " \u2014 ", formatTimestamp(caption.timestamp[1] + offset)] }), _jsx("div", { className: "caption-card__actions", children: editing ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "icon-btn", "data-tooltip": "Save", onClick: save, style: { color: "var(--accent)" }, children: _jsx(Check, { size: 14 }) }), _jsx("button", { className: "icon-btn", "data-tooltip": "Cancel", onClick: cancel, children: _jsx(X, { size: 14 }) })] })) : (_jsx("button", { className: "icon-btn", "data-tooltip": "Edit", onClick: startEdit, children: _jsx(Pencil, { size: 14 }) })) })] }), _jsx("div", { className: "caption-card__body", children: editing ? (_jsx("textarea", { className: "caption-card__textarea", autoFocus: true, rows: 2, value: text, onChange: (e) => setText(e.target.value), onKeyDown: onTextareaKeyDown, style: { fontSize } })) : hasWords && wordLineGroups ? (wordLineGroups.map((group, lineIndex) => (_jsx("div", { className: "caption-card__words", children: group.map(({ word, pos }) => (_jsx("span", { className: "caption-card__word", onContextMenu: (e) => openMenu(e, pos), style: { fontSize }, children: word.text }, word.gi))) }, lineIndex)))) : hasWords ? (_jsx("div", { className: "caption-card__words", children: caption.words.map((word, pos) => (_jsx("span", { className: "caption-card__word", onContextMenu: (e) => openMenu(e, pos), style: { fontSize }, children: word.text }, word.gi))) })) : (caption.lines.map((line, lineIndex) => (_jsx("p", { className: "caption-card__line", style: { fontSize }, children: line }, lineIndex)))) }), editing && (_jsxs(_Fragment, { children: [_jsx("div", { className: "caption-card__divider" }), _jsx("p", { className: "caption-card__hint", children: "Editing \u00B7 Ctrl+Enter to save \u00B7 Esc to cancel" })] })), menu &&
                createPortal(_jsxs("div", { ref: menuRef, className: "menu", style: { top: menu.y, left: menu.x }, children: [isSentence && (_jsxs(_Fragment, { children: [_jsx("button", { className: "menu-item", disabled: !canSplit, onClick: () => {
                                        onSplit(caption, menu.wordPos);
                                        closeMenu();
                                    }, children: "Split here" }), _jsx("button", { className: "menu-item", disabled: !canMergePrev, onClick: () => {
                                        onMerge(caption, "prev");
                                        closeMenu();
                                    }, children: "Merge with previous" }), _jsx("button", { className: "menu-item", disabled: !canMergeNext, onClick: () => {
                                        onMerge(caption, "next");
                                        closeMenu();
                                    }, children: "Merge with next" })] })), _jsx("button", { className: "menu-item", disabled: !canMovePrev, onClick: () => {
                                onMoveWord(caption, index, "prev");
                                closeMenu();
                            }, children: "Move first word to previous" }), _jsx("button", { className: "menu-item", disabled: !canMoveNext, onClick: () => {
                                onMoveWord(caption, index, "next");
                                closeMenu();
                            }, children: "Move last word to next" }), _jsx("button", { className: "menu-item", disabled: !canSplitWords, onClick: () => {
                                onSplitWords(caption, index);
                                closeMenu();
                            }, children: "Split into words" })] }), document.body)] }));
});
