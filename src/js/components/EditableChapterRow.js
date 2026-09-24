import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Trash2 } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { formatChapterTimestamp, parseChapterTimestamp } from "../utils/chapters";
import "./EditableChapterRow.scss";
// memo + локальный стейт полей — правка тайминга/текста не дёргает весь список
export const EditableChapterRow = memo(function EditableChapterRow({ chapter, order, useHours, canDelete, onUpdateTitle, onUpdateTime, onDelete, }) {
    const [timeText, setTimeText] = useState(() => formatChapterTimestamp(chapter.time, useHours));
    const [timeError, setTimeError] = useState(false);
    const [title, setTitle] = useState(chapter.title);
    useEffect(() => {
        setTimeText(formatChapterTimestamp(chapter.time, useHours));
        setTimeError(false);
    }, [chapter.time, useHours]);
    useEffect(() => {
        setTitle(chapter.title);
    }, [chapter.title]);
    const commitTime = () => {
        const seconds = parseChapterTimestamp(timeText);
        if (seconds == null || seconds < 0) {
            setTimeError(true);
            setTimeText(formatChapterTimestamp(chapter.time, useHours));
            return;
        }
        setTimeError(false);
        if (seconds !== chapter.time)
            onUpdateTime(chapter.id, seconds);
        else
            setTimeText(formatChapterTimestamp(chapter.time, useHours));
    };
    const commitTitle = () => {
        const trimmed = title.trim();
        if (trimmed && trimmed !== chapter.title)
            onUpdateTitle(chapter.id, trimmed);
        else
            setTitle(chapter.title);
    };
    return (_jsxs("div", { className: "chapter-row card", children: [_jsx("input", { className: `chapter-row__time ${timeError ? "chapter-row__time--error" : ""}`, value: timeText, onChange: (e) => {
                    setTimeText(e.target.value);
                    setTimeError(false);
                }, onBlur: commitTime, onKeyDown: (e) => {
                    if (e.key === "Enter")
                        e.target.blur();
                }, "aria-label": `Chapter ${order + 1} timestamp`, "data-tooltip": timeError ? "Use MM:SS or HH:MM:SS" : undefined }), _jsx("input", { className: "chapter-row__title", value: title, onChange: (e) => setTitle(e.target.value), onBlur: commitTitle, onKeyDown: (e) => {
                    if (e.key === "Enter")
                        e.target.blur();
                }, "aria-label": `Chapter ${order + 1} title`, placeholder: "Chapter title" }), _jsx("button", { type: "button", className: "icon-btn chapter-row__delete", onClick: () => onDelete(chapter.id), disabled: !canDelete, "aria-label": "Delete chapter", "data-tooltip": "Delete chapter", children: _jsx(Trash2, { size: 13 }) })] }));
});
