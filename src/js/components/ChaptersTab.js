import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Bookmark, Check, ChevronRight, Copy, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { EditableChapterRow } from "./EditableChapterRow";
import { GeneratedTextSection } from "./GeneratedTextSection";
import { LanguageRow } from "./LanguageRow";
import "./ChaptersTab.scss";
import { ChapterStylePicker } from "./ChapterStylePicker";
import { TitleSuggestions } from "./TitleSuggestions";
import { copyToClipboard } from "../utils/clipboard";
import { formatChaptersForYoutube, MIN_YOUTUBE_CHAPTERS } from "../utils/chapters";
const HOUR = 3600;
function formatHistoryWhen(createdAt) {
    const diff = Date.now() - createdAt;
    if (diff < 60_000)
        return "Just now";
    if (diff < 3_600_000)
        return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)
        return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 86_400_000 * 7)
        return `${Math.floor(diff / 86_400_000)}d ago`;
    try {
        return new Date(createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
    }
    catch {
        return "";
    }
}
export const ChaptersTab = ({ screen, progress, onGenerate, style, onStyleChange, generateLabel = "Generate", onBack, canRegenerate = true, history = [], onOpenHistory, onDeleteHistory, titles, onEditTitle, onRegenerateTitles, regeneratingTitles, description, onUpdateDescription, onRegenerateDescription, regeneratingDescription, tags, onUpdateTags, onNormalizeTags, onRegenerateTags, regeneratingTags, chapters, onUpdateChapterTitle, onUpdateChapterTime, onDeleteChapter, onAddChapter, onRegenerateChapters, regeneratingChapters, onCopyDescription, onAddMarkers, addingMarkers, }) => {
    const { chaptersSrcLang, chaptersTranslateTo, updateChaptersSrcLang, updateChaptersTranslateTo } = useConfiguration();
    const [chaptersCopied, setChaptersCopied] = useState(false);
    const [descriptionCopied, setDescriptionCopied] = useState(false);
    const [markersAdded, setMarkersAdded] = useState(false);
    const sortedChapters = useMemo(() => [...chapters].sort((a, b) => a.time - b.time), [chapters]);
    const useHours = sortedChapters.length > 0 && sortedChapters[sortedChapters.length - 1].time >= HOUR;
    // Same label as HistoryItem: first video title, else first chapter, else fallback
    const headerTitle = useMemo(() => {
        const title = titles.find((t) => t.trim())?.trim();
        if (title)
            return title;
        const firstChapter = sortedChapters[0]?.title?.trim();
        if (firstChapter)
            return firstChapter;
        return "Untitled chapters";
    }, [titles, sortedChapters]);
    // копирует только список таймкодов (напр. для закреплённого комментария) —
    // без основного текста описания
    const handleCopyChaptersOnly = async () => {
        if (!chapters.length)
            return;
        const ok = await copyToClipboard(formatChaptersForYoutube(chapters));
        if (!ok)
            return;
        setChaptersCopied(true);
        setTimeout(() => setChaptersCopied(false), 1500);
    };
    // главная кнопка футера — цельный блок (текст + таймкоды) для поля Description на YouTube
    const handleCopyDescription = async () => {
        const ok = await onCopyDescription();
        if (!ok)
            return;
        setDescriptionCopied(true);
        setTimeout(() => setDescriptionCopied(false), 1500);
    };
    const handleAddMarkers = async () => {
        const ok = await onAddMarkers();
        if (!ok)
            return;
        setMarkersAdded(true);
        setTimeout(() => setMarkersAdded(false), 1500);
    };
    if (screen === "landing") {
        return (_jsxs("div", { className: "chapters-tab chapters-tab--landing", children: [_jsxs("div", { className: "chapters-tab__landing-body thin-scroll", children: [history.length === 0 && (_jsxs("div", { className: "card chapters-tab__intro", children: [_jsx(Sparkles, { size: 26, className: "chapters-tab__intro-icon" }), _jsx("p", { className: "chapters-tab__intro-title", children: "Generate YouTube chapters" }), _jsx("p", { className: "chapters-tab__intro-text", children: "Transcribes the timeline audio and generates a title, description, tags and chapters \u2014 ready to paste into YouTube." })] })), history.length > 0 && (_jsxs("div", { className: "chapters-tab__history", children: [_jsxs("div", { className: "chapters-tab__history-head", children: [_jsx("span", { className: "chapters-tab__section-label", children: "History" }), _jsx("span", { className: "chapters-tab__history-count", children: history.length })] }), _jsx("ul", { className: "chapters-tab__history-list", children: history.map((item) => (_jsxs("li", { className: "chapters-tab__history-item", children: [_jsxs("button", { type: "button", className: "chapters-tab__history-open", onClick: () => onOpenHistory?.(item.id), disabled: !!progress, children: [_jsxs("span", { className: "chapters-tab__history-main", children: [_jsx("span", { className: "chapters-tab__history-label", children: item.label }), _jsxs("span", { className: "chapters-tab__history-meta", children: [item.chapterCount, " chapter", item.chapterCount === 1 ? "" : "s", _jsx("span", { className: "chapters-tab__history-dot", "aria-hidden": true, children: "\u00B7" }), formatHistoryWhen(item.createdAt)] })] }), _jsx(ChevronRight, { size: 14, className: "chapters-tab__history-chevron" })] }), onDeleteHistory ? (_jsx("button", { type: "button", className: "icon-btn chapters-tab__history-delete", onClick: () => onDeleteHistory(item.id), disabled: !!progress, "data-tooltip": "Remove from history", "aria-label": `Remove ${item.label} from history`, children: _jsx(Trash2, { size: 13, strokeWidth: 2 }) })) : null] }, item.id))) })] }))] }), _jsxs("div", { className: "chapters-tab__landing-footer", children: [_jsx(ChapterStylePicker, { value: style, onChange: onStyleChange, disabled: !!progress }), _jsx(LanguageRow, { srcLang: chaptersSrcLang, translateTo: chaptersTranslateTo, onSrcLang: updateChaptersSrcLang, onTranslateTo: updateChaptersTranslateTo, showArrow: true }), _jsxs("button", { type: "button", className: "btn btn--primary btn--full chapters-tab__generate-btn", onClick: onGenerate, disabled: !!progress, children: [progress ? _jsx("span", { className: "spinner" }) : _jsx(Sparkles, { size: 15 }), progress ? "Working…" : generateLabel] })] })] }));
    }
    return (_jsxs("div", { className: "chapters-tab", children: [_jsxs("div", { className: "chapters-tab__results-header", children: [_jsx("span", { className: "chapters-tab__results-title", title: headerTitle, children: headerTitle }), _jsx("button", { type: "button", className: "icon-btn chapters-tab__close", onClick: onBack, "aria-label": "Close", children: _jsx(X, { size: 15, strokeWidth: 2 }) })] }), _jsxs("div", { className: "chapters-tab__results-body thin-scroll", children: [_jsx(ChapterStylePicker, { value: style, onChange: onStyleChange, disabled: regeneratingTitles || regeneratingDescription || regeneratingTags }), _jsx(TitleSuggestions, { titles: titles, regenerating: regeneratingTitles, canRegenerate: canRegenerate, onEditTitle: onEditTitle, onRegenerate: onRegenerateTitles }), _jsx(GeneratedTextSection, { label: "DESCRIPTION", value: description, placeholder: "Video description", rows: 4, onChange: onUpdateDescription, onRegenerate: onRegenerateDescription, regenerating: regeneratingDescription, canRegenerate: canRegenerate }), _jsx(GeneratedTextSection, { label: "TAGS", value: tags, placeholder: "#spunkram #adobe #etc", rows: 2, onChange: onUpdateTags, onBlur: onNormalizeTags, onRegenerate: onRegenerateTags, regenerating: regeneratingTags, canRegenerate: canRegenerate }), _jsxs("div", { className: "chapters-tab__chapters-section", children: [_jsxs("div", { className: "chapters-tab__section-head", children: [_jsxs("span", { className: "chapters-tab__section-label", children: ["CHAPTERS \u00B7 ", chapters.length] }), _jsxs("div", { className: "chapters-tab__section-actions", children: [_jsx("button", { type: "button", className: "icon-btn chapters-tab__icon-action", onClick: handleCopyChaptersOnly, disabled: !chapters.length, "data-tooltip": chaptersCopied ? "Copied!" : "Copy chapters only", "aria-label": "Copy chapters only", children: chaptersCopied ? _jsx(Check, { size: 14, strokeWidth: 2 }) : _jsx(Copy, { size: 14, strokeWidth: 2 }) }), _jsx("button", { type: "button", className: "icon-btn chapters-tab__icon-action", onClick: onRegenerateChapters, disabled: regeneratingChapters || !canRegenerate, "data-tooltip": !canRegenerate
                                                    ? "No generations left"
                                                    : regeneratingChapters
                                                        ? "Regenerating…"
                                                        : "Regenerate chapters (uses 1 generation)", "aria-label": "Regenerate chapters", children: regeneratingChapters ? (_jsx("span", { className: "spinner" })) : (_jsx(RefreshCw, { size: 14, strokeWidth: 2 })) }), _jsxs("button", { type: "button", className: "btn btn--ghost chapters-tab__add-btn", onClick: onAddChapter, children: [_jsx(Plus, { size: 14, strokeWidth: 2 }), "Add"] })] })] }), chapters.length < MIN_YOUTUBE_CHAPTERS && (_jsxs("p", { className: "chapters-tab__warning", children: ["YouTube needs at least ", MIN_YOUTUBE_CHAPTERS, " chapters to display them as timestamps."] })), sortedChapters.map((chapter, index) => (_jsx(EditableChapterRow, { chapter: chapter, order: index, useHours: useHours, canDelete: chapters.length > 1, onUpdateTitle: onUpdateChapterTitle, onUpdateTime: onUpdateChapterTime, onDelete: onDeleteChapter }, chapter.id))), _jsxs("p", { className: "chapters-tab__hint", children: ["The first chapter is always copied as ", useHours ? "00:00:00" : "00:00", " \u2014 YouTube requires timestamps to start at zero."] })] })] }), _jsxs("div", { className: "chapters-tab__results-footer", children: [_jsxs("button", { type: "button", className: "btn btn--secondary chapters-tab__markers-btn", onClick: handleAddMarkers, disabled: !chapters.length || addingMarkers, "data-tooltip": "Add a marker per chapter to the composition/sequence", children: [addingMarkers ? _jsx("span", { className: "spinner" }) : markersAdded ? _jsx(Check, { size: 15 }) : _jsx(Bookmark, { size: 15 }), addingMarkers ? "Adding…" : markersAdded ? "Added!" : "Add Markers"] }), _jsxs("button", { type: "button", className: "btn btn--primary chapters-tab__copy-btn", onClick: handleCopyDescription, disabled: !description.trim() && !chapters.length, "data-tooltip": "Copies description text + chapter timestamps + tags as #hashtags", children: [descriptionCopied ? _jsx(Check, { size: 15 }) : _jsx(Copy, { size: 15 }), descriptionCopied ? "Copied!" : "Copy Description"] })] })] }));
};
