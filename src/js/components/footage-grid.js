import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { applyPackItemToHost } from "@/lib/utils/apply-item";
import { beginApplyOnDropOutside, beginHostFileDrag, beginPlaceholderDrag, cepHostFileDragEnabled, finishHostDrag, } from "@/lib/utils/cep-file-drag";
import { adoptTimelinePlaceholder, ensureDragPlaceholderFile, releaseDragAnchor, } from "@/lib/utils/drag-placeholder";
import { planPackItemDrag } from "@/lib/utils/pack-drag";
import { openLinkInBrowser } from "@/lib/utils/bolt";
import { packItemIsAudio, resolveItemAudioFile } from "@/lib/utils/pack-apply-paths";
import "./footage-grid.scss";
import { loadPreviewObjectUrl, packPrefersWebmPreview, playSfxPreview, releasePreviewObjectUrl, resolveItemPreviewMedia, resolveItemRemotePreviewMedia, retainPreviewObjectUrlSync, setSfxPreviewVolume, stopSfxPreview, } from "@/lib/utils/pack-preview";
import { peekCachedPreviewPath, warmPreviewCache, } from "@/lib/utils/preview-disk-cache";
import { peekWarmPosterUrl } from "@/lib/utils/preview-preload";
import { posterQueue } from "@/lib/utils/poster-loader";
import { resolvePreviewAspectRatio } from "@/lib/utils/pack-tree";
import { GAL_GRID_PAD_X_PX, GRID_GAP_PX, PLAIN_TITLE_HEIGHT_PX, SECTION_GAP_PX, STICKY_TITLE_HEIGHT_PX, WINDOW_BUFFER_PX, layoutGridSections, windowGridSections, windowRangeKey, } from "@/lib/utils/footage-grid-window";
import { usePanelActions, usePanelGrid } from "@/lib/panel-ui-context";
import { cn } from "@/lib/utils";
import { BRAND } from "@brands";
import { AudioLines, Check, Download, Loader2, Lock, Sparkles, Star } from "lucide-react";
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
const CARD_RADIUS_OVERLAY = "clamp(2px, 4%, 10px)";
const CARD_RADIUS_CHIPS = "clamp(10px, 8%, 16px)";
const AUTOPLAY_ROOT_MARGIN = "80px 0px";
const HTTPS_URL_RE = /^https?:\/\//i;
// --- Exclusive hover (AutoPlay off) — only one card plays at a time ----------
/** Exclusive hover id when AutoPlay is off — only one card plays at a time. */
let exclusiveHoverId = null;
const exclusiveHoverListeners = new Set();
function notifyExclusiveHover() {
    for (const listener of exclusiveHoverListeners)
        listener();
}
function setExclusiveHoverId(id) {
    if (exclusiveHoverId === id)
        return;
    exclusiveHoverId = id;
    notifyExclusiveHover();
}
function subscribeExclusiveHover(listener) {
    exclusiveHoverListeners.add(listener);
    return () => {
        exclusiveHoverListeners.delete(listener);
    };
}
function clearExclusiveHover() {
    setExclusiveHoverId(null);
}
/**
 * Resolve preview URL with minimal first-paint delay:
 * - Warm blob cache hit → URL available during render (no gray flash)
 * - HTTPS miss → show remote immediately, warm AppData cache in background
 * - Disk miss → priority queue (eager = priority 0, still yields)
 * - `load` gates start only; scroll-away must not revoke/reload
 */
function usePreviewObjectUrl(path, opts) {
    const [url, setUrl] = useState(null);
    const load = opts?.load ?? true;
    const priorityRef = useRef(opts?.priority ?? 0);
    /** Props path we already resolved (remote URL or local file). */
    const loadedKeyRef = useRef(null);
    /** Local path retained in the blob cache (for release). */
    const blobPathRef = useRef(null);
    priorityRef.current = opts?.priority ?? 0;
    const warmUrl = path && load ? peekWarmPosterUrl(path) : null;
    const remoteFallback = path && load && !warmUrl && HTTPS_URL_RE.test(path) ? path : null;
    const adoptLocalBlob = (localPath, sourcePath, alive) => {
        const syncUrl = retainPreviewObjectUrlSync(localPath);
        if (syncUrl) {
            loadedKeyRef.current = sourcePath;
            blobPathRef.current = localPath;
            setUrl(syncUrl);
            return;
        }
        void loadPreviewObjectUrl(localPath, { priority: priorityRef.current }).then((next) => {
            if (!next)
                return;
            if (!alive.current) {
                releasePreviewObjectUrl(localPath);
                return;
            }
            loadedKeyRef.current = sourcePath;
            blobPathRef.current = localPath;
            setUrl(next);
        });
    };
    // Retain a boot-warmed blob before paint so Strict Mode remounts keep the URL.
    useLayoutEffect(() => {
        if (!path || !load)
            return;
        const local = HTTPS_URL_RE.test(path)
            ? peekCachedPreviewPath(path)
            : path;
        if (!local)
            return;
        const syncUrl = retainPreviewObjectUrlSync(local);
        if (!syncUrl)
            return;
        if (blobPathRef.current && blobPathRef.current !== local) {
            releasePreviewObjectUrl(blobPathRef.current);
        }
        blobPathRef.current = local;
        loadedKeyRef.current = path;
        setUrl((prev) => (prev === syncUrl ? prev : syncUrl));
    }, [path, load]);
    useEffect(() => {
        if (!path) {
            if (blobPathRef.current) {
                releasePreviewObjectUrl(blobPathRef.current);
                blobPathRef.current = null;
            }
            loadedKeyRef.current = null;
            setUrl(null);
            return;
        }
        if (loadedKeyRef.current === path)
            return;
        if (loadedKeyRef.current && loadedKeyRef.current !== path) {
            if (blobPathRef.current) {
                releasePreviewObjectUrl(blobPathRef.current);
                blobPathRef.current = null;
            }
            loadedKeyRef.current = null;
            setUrl(null);
        }
        if (!load)
            return;
        const alive = { current: true };
        if (HTTPS_URL_RE.test(path)) {
            const cached = peekCachedPreviewPath(path);
            if (cached) {
                adoptLocalBlob(cached, path, alive);
                return () => {
                    alive.current = false;
                };
            }
            loadedKeyRef.current = path;
            blobPathRef.current = null;
            setUrl(path);
            warmPreviewCache(path);
            return () => {
                alive.current = false;
            };
        }
        adoptLocalBlob(path, path, alive);
        return () => {
            alive.current = false;
        };
    }, [path, load]);
    useEffect(() => {
        return () => {
            if (blobPathRef.current) {
                releasePreviewObjectUrl(blobPathRef.current);
                blobPathRef.current = null;
            }
            loadedKeyRef.current = null;
        };
    }, []);
    return url ?? warmUrl ?? remoteFallback;
}
function closestScrollParent(el) {
    let node = el?.parentElement ?? null;
    while (node) {
        const oy = getComputedStyle(node).overflowY;
        if (oy === "auto" || oy === "scroll" || oy === "overlay")
            return node;
        node = node.parentElement;
    }
    return null;
}
/** One shared listener for all cards — stop hover playback when leaving the CEP panel. */
let panelLeaveBound = false;
let panelLeavePlayPreview = false;
function ensurePanelLeaveListeners(playPreview) {
    panelLeavePlayPreview = playPreview;
    if (panelLeaveBound)
        return;
    panelLeaveBound = true;
    const clear = () => {
        stopSfxPreview();
        if (!panelLeavePlayPreview)
            clearExclusiveHover();
    };
    const onVisibility = () => {
        if (document.hidden)
            clear();
    };
    document.documentElement.addEventListener("mouseleave", clear);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", onVisibility);
}
const GridViewportContext = createContext(null);
function useGridViewport() {
    return useContext(GridViewportContext);
}
function GridViewportProvider({ children }) {
    const playMap = useRef(new Map());
    const playIo = useRef(null);
    useEffect(() => {
        playIo.current?.disconnect();
        playIo.current = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                playMap.current.get(entry.target)?.(entry.isIntersecting);
            }
        }, { root: null, rootMargin: AUTOPLAY_ROOT_MARGIN, threshold: 0 });
        for (const el of playMap.current.keys())
            playIo.current.observe(el);
        return () => {
            playIo.current?.disconnect();
            playIo.current = null;
        };
    }, []);
    const api = useMemo(() => ({
        observePlay: (el, onChange) => {
            playMap.current.set(el, onChange);
            playIo.current?.observe(el);
            return () => {
                playMap.current.delete(el);
                playIo.current?.unobserve(el);
            };
        },
    }), []);
    return (_jsx(GridViewportContext.Provider, { value: api, children: children }));
}
function usePreviewCardModel({ item, assetsPath, assetsBaseUrl, assetsHost, packFilePath, settings, locked, ready, preferWebm, useMp4, prepareApply, gridIndex = 0, onRequestSubscribe, chipsMode, }) {
    const { playPreview, audioEnabled, previewVolume, gridColumns, isFavorite, toggleFavorite, applyingItemId, setApplyingItemId, showNewBadges, } = usePanelGrid();
    const { setHoveredItemName, showStatus } = usePanelActions();
    const viewport = useGridViewport();
    const [hovered, setHovered] = useState(false);
    const [inView, setInView] = useState(false);
    const [posterFailed, setPosterFailed] = useState(false);
    /** Set only after a successful prepareApply in this session. */
    const [appliedThisSession, setAppliedThisSession] = useState(false);
    const cardRef = useRef(null);
    const videoRef = useRef(null);
    const suppressDragRef = useRef(false);
    const media = useMemo(() => {
        if (assetsBaseUrl) {
            return resolveItemRemotePreviewMedia(item, assetsBaseUrl, {
                preferWebm,
                useMp4,
                host: assetsHost === "AE" ? "AE" : "PR",
            });
        }
        if (assetsPath) {
            return resolveItemPreviewMedia(item, assetsPath, { preferWebm, useMp4 });
        }
        return { posterPath: null, motion: null };
    }, [item, assetsPath, assetsBaseUrl, assetsHost, preferWebm, useMp4]);
    const favorited = isFavorite(item.id);
    const motion = media.motion;
    const isAudio = packItemIsAudio(item);
    const isVideoMotion = motion?.kind === "webm" || motion?.kind === "mp4";
    const isGifMotion = motion?.kind === "gif";
    const aspectRatio = resolvePreviewAspectRatio(item.group);
    const isApplying = applyingItemId === item.id;
    const canDrag = cepHostFileDragEnabled && !locked && !isApplying;
    const isNew = showNewBadges && !!item.group.is_new_mark;
    const isPremium = !!item.group.premium;
    const cardRadius = chipsMode ? CARD_RADIUS_CHIPS : CARD_RADIUS_OVERLAY;
    const shouldMute = playPreview || !audioEnabled;
    const volumeLevel = Math.min(1, Math.max(0, (previewVolume || 0) / 100));
    const downloaded = ready || appliedThisSession;
    const audioPath = useMemo(() => (isAudio ? resolveItemAudioFile(item, packFilePath) : null), [isAudio, item, packFilePath]);
    useEffect(() => {
        setHovered(false);
        setInView(false);
        setPosterFailed(false);
        setAppliedThisSession(false);
        if (exclusiveHoverId === item.id)
            clearExclusiveHover();
        stopSfxPreview(item.id);
    }, [item.id]);
    const [poster, setPoster] = useState(null);
    const posterPath = isAudio ? null : media.posterPath;
    const posterUrl = poster?.path === posterPath ? poster.url : null;
    useEffect(() => {
        if (!posterPath)
            return;
        setPosterFailed(false);
        return posterQueue.subscribe(posterPath, (url) => {
            setPoster({ path: posterPath, url });
            setPosterFailed(!url);
        });
    }, [posterPath]);
    useEffect(() => {
        if (posterUrl)
            setPosterFailed(false);
    }, [posterUrl]);
    const markPosterFailed = useCallback(() => {
        setPosterFailed(true);
    }, []);
    const waitingPoster = !isAudio && Boolean(media.posterPath) && !posterFailed && !posterUrl;
    useEffect(() => {
        if (playPreview)
            return;
        const sync = () => {
            setHovered(exclusiveHoverId === item.id);
        };
        sync();
        return subscribeExclusiveHover(sync);
    }, [playPreview, item.id]);
    useEffect(() => {
        ensurePanelLeaveListeners(playPreview);
    }, [playPreview]);
    useEffect(() => {
        if (!playPreview) {
            setInView(false);
            return;
        }
        const el = cardRef.current;
        if (!el || !viewport)
            return;
        return viewport.observePlay(el, setInView);
    }, [playPreview, viewport, item.id]);
    const wantMotion = playPreview ? inView : hovered;
    const wantAudio = isAudio && hovered && audioEnabled && !locked;
    const motionUrl = usePreviewObjectUrl(wantMotion && motion ? motion.path : null, {
        load: !!wantMotion,
        priority: gridIndex,
    });
    const audioUrl = usePreviewObjectUrl(wantAudio ? audioPath : null, {
        load: !!wantAudio,
        priority: gridIndex,
    });
    const showMotion = !!motion && !!motionUrl && wantMotion;
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isVideoMotion || !motionUrl || !showMotion)
            return;
        let cancelled = false;
        video.muted = shouldMute;
        video.volume = volumeLevel;
        if (!playPreview) {
            try {
                video.currentTime = 0;
            }
            catch {
                // ignore seek errors before metadata
            }
        }
        void video
            .play()
            .then(() => {
            if (cancelled)
                video.pause();
        })
            .catch(() => { });
        return () => {
            cancelled = true;
            video.pause();
        };
    }, [showMotion, isVideoMotion, motionUrl, shouldMute, playPreview, volumeLevel]);
    useEffect(() => {
        if (!wantAudio || !audioUrl) {
            stopSfxPreview(item.id);
            return;
        }
        playSfxPreview(item.id, audioUrl, volumeLevel);
        return () => {
            stopSfxPreview(item.id);
        };
    }, [wantAudio, audioUrl, item.id, volumeLevel]);
    useEffect(() => {
        if (!wantAudio)
            return;
        setSfxPreviewVolume(volumeLevel);
    }, [wantAudio, volumeLevel]);
    const gifSrc = showMotion && isGifMotion && motionUrl ? motionUrl : null;
    const imgSrc = gifSrc || posterUrl || undefined;
    const showAudioIcon = isAudio && (!imgSrc || posterFailed);
    function handlePointerEnter() {
        setHoveredItemName(item.name);
        if (isAudio) {
            setHovered(true);
            if (!playPreview)
                setExclusiveHoverId(item.id);
            return;
        }
        if (!playPreview) {
            setExclusiveHoverId(item.id);
            setHovered(true);
        }
    }
    function handlePointerLeave(e) {
        const next = e.relatedTarget;
        if (next instanceof Node && cardRef.current?.contains(next))
            return;
        setHoveredItemName(null);
        if (isAudio) {
            setHovered(false);
            if (!playPreview && exclusiveHoverId === item.id)
                clearExclusiveHover();
            return;
        }
        if (!playPreview) {
            if (exclusiveHoverId === item.id)
                clearExclusiveHover();
            setHovered(false);
        }
    }
    function handleFavoriteClick(e) {
        e.stopPropagation();
        e.preventDefault();
        toggleFavorite(item.id);
    }
    async function applyToHost() {
        if (isApplying)
            return;
        if (locked) {
            if (chipsMode) {
                onRequestSubscribe();
                return;
            }
            showStatus("Sign in with an active subscription to apply premium items.", "error");
            return;
        }
        setApplyingItemId(item.id);
        try {
            let applyPackPath = packFilePath;
            let applySettings = settings ?? null;
            if (prepareApply) {
                showStatus(`Preparing "${item.name}"…`, "info", 8000);
                const prepared = await prepareApply(item);
                if (!prepared.ok) {
                    showStatus(prepared.message, "error", 8000);
                    return;
                }
                applyPackPath = prepared.packFilePath;
                applySettings = prepared.settings;
                setAppliedThisSession(true);
            }
            else if (!ready && !appliedThisSession) {
                showStatus("Download will be available soon. Install the pack from Settings for now.", "info", 6000);
                return;
            }
            if (!applyPackPath) {
                showStatus("No pack loaded.", "error", 6000);
                return;
            }
            const result = await applyPackItemToHost(item, applyPackPath, applySettings);
            if (result.ok) {
                if (result.warning)
                    showStatus(result.warning, "info", 8000);
                else
                    showStatus(`Applied "${item.name}"`, "success");
            }
            else {
                showStatus(result.message, "error", 8000);
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            showStatus(msg || "Could not apply item.", "error", 8000);
        }
        finally {
            setApplyingItemId(null);
        }
    }
    function handleImportPointerDown(e) {
        if (e.button !== 0)
            return;
        suppressDragRef.current = true;
        e.stopPropagation();
        e.preventDefault();
        void applyToHost();
    }
    function handleCardPointerDown(e) {
        const target = e.target;
        suppressDragRef.current =
            target instanceof Element && Boolean(target.closest("button"));
    }
    function handleDragStart(e) {
        if (!canDrag || suppressDragRef.current) {
            suppressDragRef.current = false;
            e.preventDefault();
            return;
        }
        const plan = planPackItemDrag(item, packFilePath, settings ?? null);
        if (plan.kind === "file") {
            if (!beginHostFileDrag(e, plan.file))
                e.preventDefault();
            return;
        }
        if (plan.kind === "placeholder") {
            const stub = ensureDragPlaceholderFile();
            if (!stub || !beginPlaceholderDrag(e, stub)) {
                e.preventDefault();
                showStatus("Could not start the timeline drop. Double-click to apply at the playhead.", "info", 5000);
            }
            return;
        }
        if (plan.kind === "apply" || (plan.kind === "missing" && prepareApply)) {
            beginApplyOnDropOutside(e);
            return;
        }
        e.preventDefault();
        showStatus(plan.kind === "blocked"
            ? plan.message
            : "Item file is missing from the pack on disk.", "info", 5000);
    }
    async function applyAtDrop() {
        try {
            const adopted = await adoptTimelinePlaceholder();
            if (!adopted.ok) {
                showStatus(adopted.message, "info", 6000);
                return;
            }
            await applyToHost();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            showStatus(msg || "Could not place the item.", "error", 8000);
        }
        finally {
            void releaseDragAnchor();
        }
    }
    function handleDragEnd(e) {
        suppressDragRef.current = false;
        const outcome = finishHostDrag(e);
        if (outcome === "placeholder")
            void applyAtDrop();
        else if (outcome === "apply")
            void applyToHost();
    }
    function handleDoubleClick() {
        void applyToHost();
    }
    function handleKeyDown(e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void applyToHost();
        }
    }
    function handleCardClick() {
        if (!chipsMode)
            return;
        if (locked)
            onRequestSubscribe();
    }
    function handleFocus() {
        setHoveredItemName(item.name);
        if (isAudio || !playPreview) {
            if (!playPreview)
                setExclusiveHoverId(item.id);
            setHovered(true);
        }
    }
    function handleBlur() {
        setHoveredItemName(null);
        if (isAudio || !playPreview) {
            if (!playPreview && exclusiveHoverId === item.id)
                clearExclusiveHover();
            setHovered(false);
        }
    }
    return {
        cardRef,
        videoRef,
        item,
        locked,
        favorited,
        isNew,
        isPremium,
        isApplying,
        downloaded,
        waitingPoster,
        imgSrc,
        posterUrl,
        posterFailed,
        showAudioIcon,
        showMotion,
        isVideoMotion,
        motionUrl,
        shouldMute,
        hovered,
        audioEnabled,
        gridColumns,
        cardRadius,
        aspectRatio,
        chipsMode,
        handlePointerEnter,
        handlePointerLeave,
        handleFavoriteClick,
        handleImportPointerDown,
        handleDoubleClick,
        handleKeyDown,
        handleCardClick,
        handleCardPointerDown,
        handleDragStart,
        handleDragEnd,
        canDrag,
        handleFocus,
        handleBlur,
        onRequestSubscribe,
        markPosterFailed,
    };
}
function PosterImg({ src, waiting, onFailed, }) {
    const ref = useRef(null);
    useEffect(() => {
        const img = ref.current;
        if (!img?.complete)
            return;
        if (img.naturalWidth === 0)
            onFailed();
    }, [src, onFailed]);
    return (_jsx("img", { ref: ref, src: src, alt: "", onError: onFailed, className: cn("absolute inset-0 size-full object-cover transition-opacity duration-150", waiting ? "opacity-0" : "opacity-100"), draggable: false }));
}
function PreviewMediaLayers(m) {
    return (_jsxs(_Fragment, { children: [m.waitingPoster && (_jsx("div", { className: "absolute inset-0 z-[2] bg-secondary/80", "aria-hidden": true })), (!m.imgSrc || m.posterFailed) && !m.waitingPoster && !(m.showMotion && m.isVideoMotion) && (_jsx("div", { className: "absolute inset-0 bg-gradient-to-br from-secondary to-background" })), m.showAudioIcon && (_jsx("div", { className: "pointer-events-none absolute inset-0 z-[1] flex items-center justify-center", children: _jsx(AudioLines, { className: cn("text-white/35 transition-colors duration-150", m.hovered && m.audioEnabled && "text-primary/75"), style: { width: "38%", height: "38%" }, strokeWidth: 1.5 }) })), m.imgSrc && !m.posterFailed && (_jsx(PosterImg, { src: m.imgSrc, waiting: m.waitingPoster, onFailed: m.markPosterFailed })), m.isVideoMotion && m.motionUrl && m.showMotion && (_jsx("video", { ref: m.videoRef, src: m.motionUrl, poster: m.posterUrl ?? undefined, muted: m.shouldMute, loop: true, playsInline: true, preload: "metadata", draggable: false, className: "pointer-events-none absolute inset-0 z-[1] size-full object-cover" }, `${m.item.id}:${m.motionUrl}`))] }));
}
function ChipsPreviewChrome({ m, accountPlan, }) {
    return (_jsxs(_Fragment, { children: [m.isNew && (_jsx("span", { className: "pointer-events-none absolute left-1 top-1 z-[9] rounded-sm bg-primary/90 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground", children: "New" })), _jsx("button", { type: "button", "aria-label": m.favorited ? "Remove from favorites" : "Add to favorites", "aria-pressed": m.favorited, onClick: m.handleFavoriteClick, className: cn("absolute left-1 top-1 z-10 flex size-6 items-center justify-center rounded-md transition-opacity", m.favorited
                    ? "bg-black/45 text-primary opacity-100"
                    : "bg-black/40 text-white opacity-0 group-hover:opacity-100"), children: _jsx(Star, { className: "size-3.5", fill: m.favorited ? "currentColor" : "none", strokeWidth: 2.25 }) }), _jsx("div", { className: "absolute right-1 top-1 z-10", children: m.locked ? (_jsx("button", { type: "button", "aria-label": "Unlock with Gal Toolkit MAX", title: "Unlock with Gal Toolkit MAX", onClick: (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        m.onRequestSubscribe();
                    }, className: "flex size-6 items-center justify-center rounded-full bg-black/55 text-white shadow-sm", children: _jsx(Lock, { className: "size-3", strokeWidth: 2.25 }) })) : accountPlan === "free" ? (_jsx("span", { className: "pointer-events-none rounded-sm bg-primary/90 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm", "aria-label": "Included on Free", children: "Free" })) : null }), m.downloaded && !m.isApplying && (_jsx("div", { className: "pointer-events-none absolute bottom-1 left-1 z-10 flex size-5 items-center justify-center rounded-full bg-black/55 text-emerald-400 shadow-sm", "aria-label": "Downloaded", title: "Downloaded", children: _jsx(Check, { className: "size-3", strokeWidth: 2.75 }) })), !m.isApplying && (_jsx("div", { className: cn("absolute bottom-0 right-0 z-20 p-1 transition-opacity", m.hovered ? "opacity-100" : "pointer-events-none opacity-0"), children: _jsxs("button", { type: "button", onPointerDown: m.handleImportPointerDown, className: cn("inline-flex items-center justify-center rounded-md bg-primary/55 font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary", m.gridColumns <= 1
                        ? "gap-1 px-2.5 py-1.5 text-[10px]"
                        : m.gridColumns === 2
                            ? "gap-1 px-2 py-1 text-[9px]"
                            : "gap-0.5 px-1.5 py-0.5 text-[8px]"), children: [_jsx(Download, { className: m.gridColumns >= 3 ? "size-2.5" : "size-3", strokeWidth: 2.5 }), "Import"] }) })), m.isApplying && (_jsx("div", { className: "absolute inset-0 z-20 flex items-center justify-center bg-black/45", children: _jsx(Loader2, { className: "size-5 animate-spin text-white" }) }))] }));
}
function OverlayPreviewChrome({ m }) {
    return (_jsxs(_Fragment, { children: [(m.isNew || m.isPremium) && (_jsxs("div", { className: "pointer-events-none absolute left-1 top-1 z-10 flex gap-1", children: [m.isNew && (_jsx("span", { className: "rounded-sm bg-primary/90 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground", children: "New" })), m.isPremium && (_jsxs("span", { className: "flex items-center gap-0.5 rounded-sm bg-black/60 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-300", children: [_jsx(Sparkles, { className: "size-2.5" }), "Pro"] }))] })), _jsx("div", { className: "absolute right-1 top-1 z-10", children: _jsx("button", { type: "button", "aria-label": m.favorited ? "Remove from favorites" : "Add to favorites", "aria-pressed": m.favorited, onClick: m.handleFavoriteClick, className: cn("flex size-6 items-center justify-center rounded-md transition-opacity", m.favorited
                        ? "bg-black/45 text-primary opacity-100"
                        : "bg-black/40 text-white opacity-0 group-hover:opacity-100"), children: _jsx(Star, { className: "size-3.5", fill: m.favorited ? "currentColor" : "none", strokeWidth: 2.25 }) }) }), (m.isApplying || m.locked) && (_jsx("div", { className: "absolute inset-0 z-20 flex items-center justify-center bg-black/55", children: m.isApplying ? (_jsx(Loader2, { className: "size-5 animate-spin text-white" })) : (_jsx(Lock, { className: "size-4 text-white/80" })) }))] }));
}
function PreviewCardShell({ m, accountPlan, chipsMode, }) {
    return (_jsxs("div", { ref: m.cardRef, role: "button", tabIndex: 0, title: chipsMode
            ? undefined
            : m.locked
                ? `${m.item.name} (premium — sign in to apply)`
                : m.canDrag
                    ? `${m.item.name}. Drag onto the timeline.`
                    : m.item.name, draggable: m.canDrag, onPointerDown: m.handleCardPointerDown, onDragStart: m.handleDragStart, onDragEnd: m.handleDragEnd, onPointerEnter: m.handlePointerEnter, onPointerLeave: m.handlePointerLeave, onFocus: m.handleFocus, onBlur: m.handleBlur, onKeyDown: m.handleKeyDown, onClick: m.handleCardClick, onDoubleClick: m.handleDoubleClick, className: cn("footage-preview-card group relative w-full overflow-hidden border border-white/5 bg-secondary/40 outline-none ring-primary/60 transition focus-visible:ring-2", m.canDrag && "is-draggable"), style: {
            borderRadius: m.cardRadius,
            aspectRatio: m.aspectRatio,
        }, children: [_jsx(PreviewMediaLayers, { ...m }), chipsMode ? (_jsx(ChipsPreviewChrome, { m: m, accountPlan: accountPlan })) : (_jsx(OverlayPreviewChrome, { m: m }))] }));
}
const ChipsPreviewCard = memo(function ChipsPreviewCard(props) {
    const m = usePreviewCardModel({ ...props, chipsMode: true });
    return (_jsx(PreviewCardShell, { m: m, accountPlan: props.accountPlan, chipsMode: true }));
});
const OverlayPreviewCard = memo(function OverlayPreviewCard(props) {
    const m = usePreviewCardModel({ ...props, chipsMode: false });
    return _jsx(PreviewCardShell, { m: m, chipsMode: false });
});
// --- Skeleton / section title -----------------------------------------------
function SectionTitle({ title, count, sticky, stuck, }) {
    if (!sticky) {
        return (_jsxs("h3", { className: "mb-1.5 px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground", children: [title, _jsx("span", { className: "ml-1.5 font-medium text-muted-foreground/70", children: count })] }));
    }
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "gal-footage-section__stick-sentinel", "aria-hidden": true }), _jsxs("h3", { className: cn("gal-footage-section__title", stuck && "is-stuck"), children: [title, _jsx("span", { className: "gal-footage-section__title-count", children: count })] })] }));
}
// --- Grid -------------------------------------------------------------------
export function FootageGrid({ sections, assetsPath, assetsBaseUrl, assetsHost, packFilePath = "", settings, isLocked, isReady, prepareApply, accessUi = "overlay", accountPlan, subscribeUrl, emptyMessage = "No matches", stickySectionTitles = false, onReadyChange, }) {
    const { gridColumns } = usePanelGrid();
    const preferWebm = packPrefersWebmPreview(settings);
    const useMp4 = settings?.inside_option_sets?.use_webm_preview === "mp4";
    const lockedFn = isLocked ?? (() => false);
    const readyFn = isReady ?? (() => Boolean(assetsPath && packFilePath));
    const chipsMode = accessUi === "chips";
    const Card = chipsMode ? ChipsPreviewCard : OverlayPreviewCard;
    const [subscribeOpen, setSubscribeOpen] = useState(false);
    const requestSubscribe = useCallback(() => setSubscribeOpen(true), []);
    const rootRef = useRef(null);
    const [scrollRoot, setScrollRoot] = useState(null);
    const [view, setView] = useState({ scrollTop: 0, viewportH: 480, width: 320 });
    const rangeKeyRef = useRef("");
    const itemCount = useMemo(() => sections.reduce((sum, s) => sum + s.items.length, 0), [sections]);
    const metrics = useMemo(() => ({
        columns: Math.max(1, gridColumns),
        width: Math.max(1, view.width),
        gap: GRID_GAP_PX,
        sectionGap: SECTION_GAP_PX,
        titleHeight: stickySectionTitles
            ? STICKY_TITLE_HEIGHT_PX
            : PLAIN_TITLE_HEIGHT_PX,
        gridPadX: stickySectionTitles ? GAL_GRID_PAD_X_PX : 0,
    }), [gridColumns, view.width, stickySectionTitles]);
    const layout = useMemo(() => layoutGridSections(sections, metrics), [sections, metrics]);
    const windows = useMemo(() => windowGridSections(layout, view.scrollTop, view.viewportH, WINDOW_BUFFER_PX), [layout, view.scrollTop, view.viewportH]);
    const sectionById = useMemo(() => {
        const map = new Map();
        for (const section of sections)
            map.set(section.id, section);
        return map;
    }, [sections]);
    // Readiness describes mounted content, never completion of poster downloads.
    useEffect(() => {
        onReadyChange?.(itemCount > 0);
    }, [itemCount, onReadyChange]);
    useLayoutEffect(() => {
        const node = rootRef.current;
        const scroller = closestScrollParent(node);
        setScrollRoot(scroller);
        if (!scroller)
            return;
        rangeKeyRef.current = "";
        setView({
            scrollTop: scroller.scrollTop,
            viewportH: scroller.clientHeight,
            width: Math.max(1, node?.clientWidth || scroller.clientWidth),
        });
    }, [sections, gridColumns, stickySectionTitles]);
    useEffect(() => {
        const scroller = scrollRoot;
        const root = rootRef.current;
        if (!scroller)
            return;
        let raf = 0;
        const read = () => {
            raf = 0;
            const width = Math.max(1, root?.clientWidth || scroller.clientWidth);
            const viewportH = scroller.clientHeight;
            const scrollTop = scroller.scrollTop;
            const nextLayout = layoutGridSections(sections, {
                columns: Math.max(1, gridColumns),
                width,
                gap: GRID_GAP_PX,
                sectionGap: SECTION_GAP_PX,
                titleHeight: stickySectionTitles
                    ? STICKY_TITLE_HEIGHT_PX
                    : PLAIN_TITLE_HEIGHT_PX,
                gridPadX: stickySectionTitles ? GAL_GRID_PAD_X_PX : 0,
            });
            const nextWindows = windowGridSections(nextLayout, scrollTop, viewportH, WINDOW_BUFFER_PX);
            const key = `${Math.round(width)}x${Math.round(viewportH)}:${windowRangeKey(nextWindows)}`;
            if (key === rangeKeyRef.current)
                return;
            rangeKeyRef.current = key;
            setView({ scrollTop, viewportH, width });
        };
        const onScroll = () => {
            if (raf)
                return;
            raf = requestAnimationFrame(read);
        };
        scroller.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        let ro = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(onScroll);
            ro.observe(scroller);
            if (root)
                ro.observe(root);
        }
        read();
        return () => {
            if (raf)
                cancelAnimationFrame(raf);
            scroller.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            ro?.disconnect();
        };
    }, [scrollRoot, sections, gridColumns, stickySectionTitles]);
    const subscribeHref = (subscribeUrl || BRAND.siteOrigin || "").trim();
    if (sections.length === 0 || itemCount === 0) {
        return (_jsx("div", { className: "flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground", children: emptyMessage }));
    }
    let flatOffset = 0;
    const cols = Math.max(1, gridColumns);
    return (_jsxs("div", { ref: rootRef, children: [_jsx(GridViewportProvider, { children: _jsx("div", { className: "relative w-full", style: { display: "flex", flexDirection: "column", gap: SECTION_GAP_PX }, children: layout.sections.map((sectionLayout, sectionIndex) => {
                        const section = sectionById.get(sectionLayout.id);
                        if (!section)
                            return null;
                        const sectionStart = flatOffset;
                        flatOffset += section.items.length;
                        const win = windows[sectionIndex];
                        const className = stickySectionTitles ? "gal-footage-section" : "w-full";
                        if (!win || win.endRow <= win.startRow) {
                            return (_jsx("section", { "data-section-id": section.id, className: className, style: { height: sectionLayout.height }, "aria-hidden": true }, section.id));
                        }
                        const start = win.startRow * cols;
                        const end = Math.min(section.items.length, win.endRow * cols);
                        const stuck = stickySectionTitles &&
                            view.scrollTop + 0.5 >= sectionLayout.top &&
                            view.scrollTop < sectionLayout.top + sectionLayout.height;
                        return (_jsxs("section", { "data-section-id": section.id, className: className, style: { minHeight: sectionLayout.height }, children: [section.title ? (_jsx(SectionTitle, { title: section.title, count: section.items.length, sticky: stickySectionTitles, stuck: stuck })) : null, _jsx("div", { className: "grid items-start", style: {
                                        gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                                        gap: GRID_GAP_PX,
                                        paddingTop: win.padTop,
                                        paddingBottom: win.padBottom,
                                    }, children: section.items.slice(start, end).map((clip, itemIndex) => (_jsx(Card, { item: clip, assetsPath: assetsPath, assetsBaseUrl: assetsBaseUrl, assetsHost: assetsHost, packFilePath: packFilePath, settings: settings, locked: lockedFn(clip), ready: readyFn(clip), accountPlan: accountPlan, subscribeUrl: subscribeUrl, preferWebm: preferWebm, useMp4: useMp4, prepareApply: prepareApply, gridIndex: sectionStart + start + itemIndex, onRequestSubscribe: requestSubscribe }, clip.id))) })] }, section.id));
                    }) }) }), chipsMode && (_jsx(ConfirmDialog, { open: subscribeOpen, title: "Gal Toolkit MAX", message: "Subscribe to Gal Toolkit MAX to unlock this item and the full library.", confirmLabel: "Get MAX", cancelLabel: "Not now", onCancel: () => setSubscribeOpen(false), onConfirm: () => {
                    setSubscribeOpen(false);
                    if (subscribeHref)
                        openLinkInBrowser(subscribeHref);
                } }))] }));
}
