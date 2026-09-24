import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { RefreshCw, Search, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { ConfirmDialog } from "./ConfirmDialog";
import "./PresetGrid.scss";
const USER_SECTION = "Users";
const CaptionCard = ({ p, selected, onSelect, onToggleFavorite, onDelete, }) => {
    const [hover, setHover] = useState(false);
    const thumb = p.previewImageUrl;
    const video = p.previewVideoUrl;
    const category = p.source === "user" ? USER_SECTION : p.tags?.[0] || p.categoryName || null;
    return (_jsxs("div", { className: `preset-grid__card ${selected ? "preset-grid__card--active" : ""}`, onClick: onSelect, onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false), children: [_jsxs("div", { className: "preset-grid__card-actions", children: [onDelete && (_jsx("button", { type: "button", className: "preset-grid__fav preset-grid__delete", onClick: (e) => {
                            e.stopPropagation();
                            onDelete();
                        }, "aria-label": "Delete preset", "data-tooltip": "Delete", children: _jsx(Trash2, { size: 13 }) })), _jsx("button", { type: "button", className: `preset-grid__fav ${p.favorite ? "preset-grid__fav--on" : ""}`, onClick: (e) => {
                            e.stopPropagation();
                            onToggleFavorite();
                        }, "aria-label": p.favorite ? "Remove from favorites" : "Add to favorites", children: _jsx(Star, { size: 14, fill: p.favorite ? "currentColor" : "none" }) })] }), _jsxs("div", { className: "preset-grid__media", children: [thumb ? (_jsx("img", { className: "preset-grid__thumb", src: thumb, alt: "", draggable: false })) : !video ? (_jsx("div", { className: "preset-grid__swatch", children: "Aa" })) : null, hover && video ? (_jsx("video", { className: "preset-grid__video", src: video, muted: true, loop: true, playsInline: true, autoPlay: true, poster: thumb || undefined })) : null, category && _jsx("span", { className: "preset-grid__chip", children: category }), _jsx("div", { className: "preset-grid__name", children: p.name })] })] }));
};
export const PresetGrid = ({ excludeId, onSelect, variant = "page", } = {}) => {
    const { presets, selectedPresetId, selectPreset, toggleFavorite, deletePreset, stylesStatus, stylesError, refreshingStyles, refreshStyles, } = useConfiguration();
    const [search, setSearch] = useState("");
    const [favOnly, setFavOnly] = useState(false);
    const [tagFilter, setTagFilter] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const picker = variant === "picker";
    const allTags = useMemo(() => {
        const set = new Set();
        for (const p of presets) {
            const tags = p.tags?.length ? p.tags : p.categoryName ? [p.categoryName] : [];
            for (const t of tags)
                set.add(t);
        }
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [presets]);
    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return presets.filter((p) => {
            if (excludeId && p.id === excludeId)
                return false;
            if (favOnly && !p.favorite)
                return false;
            if (q && !p.name.toLowerCase().includes(q))
                return false;
            if (tagFilter) {
                const tags = p.tags?.length ? p.tags : p.categoryName ? [p.categoryName] : [];
                if (!tags.includes(tagFilter))
                    return false;
            }
            return true;
        });
    }, [presets, search, favOnly, tagFilter, excludeId]);
    const sections = useMemo(() => {
        const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        const map = new Map();
        for (const p of visible) {
            const key = p.source === "user" ? USER_SECTION : p.categoryName || "Other";
            const list = map.get(key) || [];
            list.push(p);
            map.set(key, list);
        }
        return [...map.entries()]
            .map(([category, items]) => [category, [...items].sort(byName)])
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    }, [visible]);
    const loading = stylesStatus === "loading" || stylesStatus === "idle";
    const pick = (id) => {
        if (onSelect)
            onSelect(id);
        else
            selectPreset(id, { applyToHost: false });
    };
    return (_jsxs("div", { className: `preset-grid ${picker ? "preset-grid--picker" : ""}`, children: [_jsxs("div", { className: "preset-grid__toolbar", children: [_jsxs("div", { className: "chip preset-grid__search", children: [_jsx(Search, { size: 14 }), _jsx("input", { className: "preset-grid__search-input", placeholder: "Search captions", value: search, onChange: (e) => setSearch(e.target.value) })] }), _jsx("button", { type: "button", className: `preset-grid__icon-btn ${favOnly ? "preset-grid__icon-btn--active" : ""}`, "data-tooltip": "Favorites only", onClick: () => setFavOnly((v) => !v), children: _jsx(Star, { size: 16, fill: favOnly ? "currentColor" : "none", color: "currentColor" }) }), !picker && (_jsx("button", { type: "button", className: "preset-grid__icon-btn", "data-tooltip": "Refresh catalog & project files", onClick: () => void refreshStyles(), disabled: refreshingStyles, "aria-label": "Refresh catalog and project files", children: _jsx(RefreshCw, { size: 15, className: refreshingStyles ? "preset-grid__spin" : undefined }) }))] }), allTags.length > 0 && (_jsxs("div", { className: "preset-grid__tags", children: [_jsx("button", { type: "button", className: `preset-grid__tag-chip ${!tagFilter ? "preset-grid__tag-chip--active" : ""}`, onClick: () => setTagFilter(null), children: "All" }), allTags.map((tag) => (_jsx("button", { type: "button", className: `preset-grid__tag-chip ${tagFilter === tag ? "preset-grid__tag-chip--active" : ""}`, onClick: () => setTagFilter((cur) => (cur === tag ? null : tag)), children: tag }, tag)))] })), _jsxs("p", { className: "preset-grid__count", children: ["CAPTIONS \u00B7 ", loading ? "…" : visible.length] }), loading && (_jsxs("div", { className: "preset-grid__state", children: [_jsx("span", { className: "spinner" }), "Loading captions\u2026"] })), !loading && stylesError && presets.length === 0 && (_jsxs("div", { className: "preset-grid__state preset-grid__state--error", children: [_jsx("p", { children: "Couldn\u2019t reach captions server." }), _jsx("p", { className: "preset-grid__state-hint", children: stylesError }), _jsx("button", { type: "button", className: "btn btn--ghost", onClick: () => void refreshStyles(), children: "Retry" })] })), !loading && !stylesError && presets.length === 0 && (_jsxs("div", { className: "preset-grid__state", children: [_jsx("p", { children: "No captions available." }), _jsx("p", { className: "preset-grid__state-hint", children: "Check CAPTIONS_ROOT on motionflow.pro." })] })), !loading && presets.length > 0 && visible.length === 0 && (_jsx("div", { className: "preset-grid__state", children: _jsx("p", { children: picker ? "No other captions" : "No captions match" }) })), !loading && sections.length > 0 && (_jsx("div", { className: "preset-grid__sections thin-scroll", children: sections.map(([category, items]) => (_jsxs("section", { className: "preset-grid__section", children: [_jsx("h3", { className: "preset-grid__section-title", children: category }), _jsx("div", { className: "preset-grid__grid", children: items.map((p) => (_jsx(CaptionCard, { p: p, selected: !picker && p.id === selectedPresetId, onSelect: () => pick(p.id), onToggleFavorite: () => toggleFavorite(p.id), onDelete: p.source === "user" ? () => setPendingDelete(p) : undefined }, p.id))) })] }, category))) })), _jsx(ConfirmDialog, { open: !!pendingDelete, title: "Delete preset", message: `Delete “${pendingDelete?.name ?? ""}”? This can’t be undone.`, confirmLabel: "Delete", onConfirm: () => {
                    if (pendingDelete)
                        deletePreset(pendingDelete.id);
                    setPendingDelete(null);
                }, onCancel: () => setPendingDelete(null) })] }));
};
