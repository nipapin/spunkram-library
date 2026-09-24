import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Play } from "lucide-react";
import { fetchVideoTutorials, youtubeEmbedUrl, youtubeThumbnailUrl, } from "@/lib/api/tutorials-api";
import { authErrorMessage, openYoutube } from "@/lib/api/market-api";
import { cn } from "@/lib/utils";
function markBadgeClasses(color) {
    switch (color) {
        case "yellow":
            return "bg-amber-400 text-black";
        case "red":
            return "bg-red-500 text-white";
        case "green":
            return "bg-emerald-500 text-white";
        default:
            return "bg-primary text-primary-foreground";
    }
}
function VideoCard({ videoId, title, mark, }) {
    const [playing, setPlaying] = useState(false);
    return (_jsxs("div", { className: "group overflow-hidden rounded-xl border border-white/10 bg-card/60 transition-colors hover:border-primary/40", children: [_jsx("div", { className: "relative aspect-video overflow-hidden bg-secondary/40", children: playing ? (_jsx("iframe", { src: youtubeEmbedUrl(videoId), title: title, allow: "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true, className: "absolute inset-0 size-full border-0" })) : (_jsxs(_Fragment, { children: [_jsx("img", { src: youtubeThumbnailUrl(videoId), alt: "", draggable: false, className: "absolute inset-0 size-full object-cover" }), mark && (_jsx("div", { className: cn("absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", markBadgeClasses(mark[1])), children: mark[0] })), _jsxs("div", { className: "absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:bg-black/35 group-hover:opacity-100", children: [_jsx("button", { type: "button", "aria-label": "Play video", onClick: () => setPlaying(true), className: "flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform hover:scale-105", children: _jsx(Play, { className: "size-4 fill-current" }) }), _jsxs("button", { type: "button", onClick: () => openYoutube(videoId), className: "flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-black/80", children: [_jsx(ExternalLink, { className: "size-3" }), "Browser"] })] })] })) }), _jsxs("div", { className: "flex items-start justify-between gap-2 p-2.5", children: [_jsx("div", { className: "min-w-0", children: _jsx("h3", { className: "truncate text-xs font-medium text-foreground", title: title, children: title }) }), _jsx("button", { type: "button", onClick: () => openYoutube(videoId), className: "shrink-0 text-muted-foreground transition-colors hover:text-foreground", "aria-label": "Open on YouTube", title: "Open on YouTube", children: _jsx(ExternalLink, { className: "size-3" }) })] })] }));
}
function flattenGroups(groups, activePackName) {
    const isBound = (g) => !!g.bind && !!activePackName && g.bind === activePackName;
    const bound = groups.filter(isBound);
    const rest = groups.filter((g) => !isBound(g));
    const ordered = [...bound, ...rest];
    const tiles = [];
    for (const group of ordered) {
        const mark = group.mark && group.mark.length >= 2
            ? [group.mark[0], group.mark[1]]
            : undefined;
        const total = group.videos.length;
        group.videos.forEach((videoId, i) => {
            tiles.push({
                videoId,
                groupName: total > 1 ? `${group.name} · ${i + 1}` : group.name,
                bound: isBound(group),
                mark: i === 0 ? mark : undefined,
            });
        });
    }
    return tiles;
}
export function TutorialsPanel({ activePackName = "" }) {
    const [groups, setGroups] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const load = () => {
        setLoading(true);
        setError(null);
        void fetchVideoTutorials().then((result) => {
            setLoading(false);
            if (result.groups) {
                setGroups(result.groups);
            }
            else {
                setError(result.error ?? "NO_SUCCESS_LOAD");
            }
        });
    };
    useEffect(load, []);
    const tiles = useMemo(() => flattenGroups(groups ?? [], activePackName), [groups, activePackName]);
    if (loading) {
        return (_jsxs("div", { className: "flex h-full items-center justify-center gap-2 text-xs text-muted-foreground", children: [_jsx(Loader2, { className: "size-4 animate-spin" }), "Loading tutorials\u2026"] }));
    }
    if (error) {
        return (_jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 p-4 text-center", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: authErrorMessage(error) }), _jsx("button", { type: "button", onClick: load, className: "rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70", children: "Try again" })] }));
    }
    if (tiles.length === 0) {
        return (_jsx("div", { className: "flex h-full items-center justify-center text-xs text-muted-foreground", children: "No tutorials available yet." }));
    }
    return (_jsx("div", { className: "h-full overflow-y-auto p-2.5", children: _jsx("div", { className: "grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2", children: tiles.map((tile, idx) => (_jsx(VideoCard, { videoId: tile.videoId, title: tile.groupName, mark: tile.mark }, `${tile.groupName}-${tile.videoId}-${idx}`))) }) }));
}
