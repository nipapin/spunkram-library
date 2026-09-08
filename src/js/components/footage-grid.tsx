import { ConfirmDialog } from "@/components/ConfirmDialog";
import { applyPackItemToHost } from "@/lib/utils/apply-item";
import { openLinkInBrowser } from "@/lib/utils/bolt";
import { packItemIsAudio, resolveItemAudioFile } from "@/lib/utils/pack-apply-paths";
import {
  loadPreviewObjectUrl,
  packPrefersWebmPreview,
  playSfxPreview,
  releasePreviewObjectUrl,
  resolveItemPreviewMedia,
  resolveItemRemotePreviewMedia,
  retainPreviewObjectUrlSync,
  setSfxPreviewVolume,
  stopSfxPreview,
} from "@/lib/utils/pack-preview";
import {
  peekCachedPreviewPath,
  warmPreviewCache,
} from "@/lib/utils/preview-disk-cache";
import type { PackHostId } from "@/lib/utils/pack-host";
import { resolvePreviewAspectRatio, type PackContentSection } from "@/lib/utils/pack-tree";
import type { PackSettings, PackTreeItem } from "@/lib/utils/pack-types";
import type { GalAccountPlan } from "@/lib/utils/gal-plan";
import { usePanelUI } from "@/lib/panel-ui-context";
import { cn } from "@/lib/utils";
import { AudioLines, Check, Download, Loader2, Lock, Sparkles, Star } from "lucide-react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

const GRID_GAP_PX = 4;
const SECTION_GAP_PX = 16;
/** Large lists: defer mounting real cards so CEP can paint section skeleton first. */
const SKELETON_THRESHOLD = 64;
const LARGE_LIST_MOUNT_MS = 40;
/** Classic Spunkram cards vs Gal chips + Import hover. */
export type FootageAccessUi = "overlay" | "chips";
const CARD_RADIUS_OVERLAY = "clamp(2px, 4%, 10px)";
const CARD_RADIUS_CHIPS = "clamp(10px, 8%, 16px)";
/** Extra margin so posters enqueue slightly before they scroll into view. */
const PREVIEW_LOAD_ROOT_MARGIN = "150px 0px";
/** Max skeleton cells per section (≈2 viewports). */
const SKELETON_CELLS_PER_SECTION_ROWS = 8;
/** First N rows load without waiting for IntersectionObserver. */
const EAGER_PREVIEW_ROWS = 5;

// --- Exclusive hover (AutoPlay off) — only one card plays at a time ----------

/** Exclusive hover id when AutoPlay is off — only one card plays at a time. */
let exclusiveHoverId: string | null = null;
const exclusiveHoverListeners = new Set<() => void>();

function notifyExclusiveHover(): void {
  for (const listener of exclusiveHoverListeners) listener();
}

function setExclusiveHoverId(id: string | null): void {
  if (exclusiveHoverId === id) return;
  exclusiveHoverId = id;
  notifyExclusiveHover();
}

function subscribeExclusiveHover(listener: () => void): () => void {
  exclusiveHoverListeners.add(listener);
  return () => {
    exclusiveHoverListeners.delete(listener);
  };
}

function clearExclusiveHover(): void {
  setExclusiveHoverId(null);
}

/**
 * Resolve preview URL with minimal first-paint delay:
 * - HTTPS miss → show remote immediately, warm AppData cache in background
 * - HTTPS / local disk hit → sync blob (no queue) for above-the-fold
 * - `load` gates start only; scroll-away must not revoke/reload
 */
function usePreviewObjectUrl(
  path: string | null,
  opts?: { load?: boolean; priority?: number; eager?: boolean },
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const load = opts?.load ?? true;
  const eager = opts?.eager ?? false;
  const priorityRef = useRef(opts?.priority ?? 0);
  /** Props path we already resolved (remote URL or local file). */
  const loadedKeyRef = useRef<string | null>(null);
  /** Local path retained in the blob cache (for release). */
  const blobPathRef = useRef<string | null>(null);
  priorityRef.current = opts?.priority ?? 0;

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

    if (loadedKeyRef.current === path) return;

    if (loadedKeyRef.current && loadedKeyRef.current !== path) {
      if (blobPathRef.current) {
        releasePreviewObjectUrl(blobPathRef.current);
        blobPathRef.current = null;
      }
      loadedKeyRef.current = null;
      setUrl(null);
    }

    if (!load) return;

    let alive = true;

    const adoptLocalBlob = (localPath: string, preferSync: boolean) => {
      if (preferSync) {
        const syncUrl = retainPreviewObjectUrlSync(localPath);
        if (syncUrl) {
          loadedKeyRef.current = path;
          blobPathRef.current = localPath;
          setUrl(syncUrl);
          return;
        }
      }
      void loadPreviewObjectUrl(localPath, { priority: priorityRef.current }).then((next) => {
        if (!next) return;
        if (!alive) {
          releasePreviewObjectUrl(localPath);
          return;
        }
        loadedKeyRef.current = path;
        blobPathRef.current = localPath;
        setUrl(next);
      });
    };

    // Remote HTTPS — paint ASAP; disk cache is a warm path, never a gate.
    if (/^https?:\/\//i.test(path)) {
      const cached = peekCachedPreviewPath(path);
      if (cached) {
        adoptLocalBlob(cached, eager);
        return () => {
          alive = false;
        };
      }

      loadedKeyRef.current = path;
      blobPathRef.current = null;
      setUrl(path);
      warmPreviewCache(path);
      return () => {
        alive = false;
      };
    }

    adoptLocalBlob(path, eager);
    return () => {
      alive = false;
    };
  }, [path, load, eager]);

  useEffect(() => {
    return () => {
      if (blobPathRef.current) {
        releasePreviewObjectUrl(blobPathRef.current);
        blobPathRef.current = null;
      }
      loadedKeyRef.current = null;
    };
  }, []);

  return url;
}

function closestScrollParent(el: HTMLElement | null): Element | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll" || oy === "overlay") return node;
    node = node.parentElement;
  }
  return null;
}

/** One shared listener for all cards — stop hover playback when leaving the CEP panel. */
let panelLeaveBound = false;
let panelLeavePlayPreview = false;

function ensurePanelLeaveListeners(playPreview: boolean): void {
  panelLeavePlayPreview = playPreview;
  if (panelLeaveBound) return;
  panelLeaveBound = true;
  const clear = () => {
    stopSfxPreview();
    if (!panelLeavePlayPreview) clearExclusiveHover();
  };
  const onVisibility = () => {
    if (document.hidden) clear();
  };
  document.documentElement.addEventListener("mouseleave", clear);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", onVisibility);
}

// --- Preview card -----------------------------------------------------------

const PreviewCard = memo(function PreviewCard({
  item,
  assetsPath,
  assetsBaseUrl,
  assetsHost,
  packFilePath,
  settings,
  locked,
  ready,
  accessUi,
  accountPlan,
  subscribeUrl,
  preferWebm,
  useMp4,
  prepareApply,
  gridIndex = 0,
}: {
  item: PackTreeItem;
  assetsPath: string;
  assetsBaseUrl?: string;
  assetsHost?: PackHostId | null;
  packFilePath: string;
  settings?: PackSettings | null;
  locked: boolean;
  ready: boolean;
  accessUi: FootageAccessUi;
  accountPlan?: GalAccountPlan | null;
  subscribeUrl?: string;
  preferWebm: boolean;
  useMp4: boolean;
  prepareApply?: (
    item: PackTreeItem,
  ) => Promise<
    | { ok: true; packFilePath: string; settings: PackSettings | null }
    | { ok: false; message: string }
  >;
  /** Flat index in the visible grid — used for top-down preview priority. */
  gridIndex?: number;
}) {
  const {
    playPreview,
    audioEnabled,
    previewVolume,
    gridColumns,
    setHoveredItemName,
    isFavorite,
    toggleFavorite,
    applyingItemId,
    setApplyingItemId,
    showStatus,
    showNewBadges,
  } = usePanelUI();
  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(false);
  const eagerLoad =
    gridIndex < Math.max(1, gridColumns) * EAGER_PREVIEW_ROWS;
  const [nearView, setNearView] = useState(eagerLoad);
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterPainted, setPosterPainted] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [cachedLocally, setCachedLocally] = useState(ready);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const media = useMemo(() => {
    // Prefer HTTPS proxy when available (Gal remote catalog); local Previews may be empty.
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
  const isNew = showNewBadges && !!item.group.is_new_mark;
  const isPremium = !!item.group.premium;
  const chipsMode = accessUi === "chips";
  const cardRadius = chipsMode ? CARD_RADIUS_CHIPS : CARD_RADIUS_OVERLAY;
  // AutoPlay must stay silent even when footer audio is on; sound only on hover.
  const shouldMute = playPreview || !audioEnabled;
  const volumeLevel = Math.min(1, Math.max(0, (previewVolume || 0) / 100));

  const audioPath = useMemo(
    () => (isAudio ? resolveItemAudioFile(item, packFilePath) : null),
    [isAudio, item, packFilePath],
  );

  // Reset media state whenever the cell binds a different item.
  useEffect(() => {
    setHovered(false);
    setInView(false);
    setNearView(eagerLoad);
    setPosterFailed(false);
    setPosterPainted(false);
    setSubscribeOpen(false);
    if (exclusiveHoverId === item.id) clearExclusiveHover();
    stopSfxPreview(item.id);
  }, [item.id, eagerLoad]);

  useEffect(() => {
    setCachedLocally(ready);
  }, [ready, item.id]);

  const posterUrl = usePreviewObjectUrl(media.posterPath, {
    load: nearView || eagerLoad,
    priority: gridIndex,
    eager: eagerLoad,
  });

  useEffect(() => {
    setPosterPainted(false);
    if (posterUrl) setPosterFailed(false);
  }, [posterUrl]);

  /** Pulse until the poster has actually painted (not just URL resolved). */
  const waitingPoster =
    Boolean(media.posterPath) && !posterFailed && (!posterUrl || !posterPainted);

  // Sync exclusive hover: another card took over, or panel-wide clear.
  useEffect(() => {
    if (playPreview) return;
    const sync = () => {
      setHovered(exclusiveHoverId === item.id);
    };
    sync();
    return subscribeExclusiveHover(sync);
  }, [playPreview, item.id]);

  // Leave the CEP panel / tab → stop hover playback (AutoPlay keeps playing).
  useEffect(() => {
    ensurePanelLeaveListeners(playPreview);
  }, [playPreview]);

  // Near-viewport gate for poster loading (top-down priority queue).
  // Latch once true — leaving the margin must not unload / re-fetch the poster.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const root = closestScrollParent(el);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNearView(true);
      },
      { root, rootMargin: PREVIEW_LOAD_ROOT_MARGIN, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [item.id]);

  // AutoPlay: play every card currently in the scroll viewport (not just a cap of 4).
  useEffect(() => {
    if (!playPreview) {
      setInView(false);
      return;
    }
    const el = cardRef.current;
    if (!el) return;

    const root = closestScrollParent(el);
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { root, rootMargin: "80px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [playPreview, item.id]);

  // AutoPlay ⇒ visible cards; otherwise hover-only.
  const wantMotion = playPreview ? inView : hovered;
  const wantAudio = isAudio && hovered && audioEnabled && !locked;

  // Motion/audio still unload when not playing; posters stay via nearView latch.
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
    if (!video || !isVideoMotion || !motionUrl || !showMotion) return;

    let cancelled = false;
    video.muted = shouldMute;
    video.volume = volumeLevel;
    if (!playPreview) {
      try {
        video.currentTime = 0;
      } catch {
        // ignore seek errors before metadata
      }
    }
    void video.play().then(() => {
      if (cancelled) video.pause();
    }).catch(() => {});

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
    if (!wantAudio) return;
    setSfxPreviewVolume(volumeLevel);
  }, [wantAudio, volumeLevel]);

  const gifSrc = showMotion && isGifMotion && motionUrl ? motionUrl : null;
  const imgSrc = gifSrc || posterUrl || undefined;
  const showAudioIcon = isAudio && (!imgSrc || posterFailed);

  function handlePointerEnter() {
    setHoveredItemName(item.name);
    if (isAudio) {
      setHovered(true);
      if (!playPreview) setExclusiveHoverId(item.id);
      return;
    }
    if (!playPreview) {
      setExclusiveHoverId(item.id);
      setHovered(true);
    }
  }

  function handlePointerLeave(e: PointerEvent<HTMLDivElement>) {
    const next = e.relatedTarget;
    if (next instanceof Node && cardRef.current?.contains(next)) return;
    setHoveredItemName(null);
    if (isAudio) {
      setHovered(false);
      if (!playPreview && exclusiveHoverId === item.id) clearExclusiveHover();
      return;
    }
    if (!playPreview) {
      if (exclusiveHoverId === item.id) clearExclusiveHover();
      setHovered(false);
    }
  }

  function handleFavoriteClick(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    toggleFavorite(item.id);
  }

  function openSubscribeFlow() {
    setSubscribeOpen(true);
  }

  async function applyToHost() {
    if (isApplying) return;
    if (locked) {
      if (chipsMode) {
        openSubscribeFlow();
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
        setCachedLocally(true);
      } else if (!ready && !cachedLocally) {
        showStatus(
          "Download will be available soon. Install the pack from Settings for now.",
          "info",
          6000,
        );
        return;
      }
      if (!applyPackPath) {
        showStatus("No pack loaded.", "error", 6000);
        return;
      }
      const result = await applyPackItemToHost(item, applyPackPath, applySettings);
      if (result.ok) {
        if (result.warning) showStatus(result.warning, "info", 8000);
        else showStatus(`Applied "${item.name}"`, "success");
      } else {
        showStatus(result.message, "error", 8000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(msg || "Could not apply item.", "error", 8000);
    } finally {
      setApplyingItemId(null);
    }
  }

  function handleImportPointerDown(e: PointerEvent) {
    // Fire on pointerdown so CEP doesn't lose the click when hover clears.
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    void applyToHost();
  }

  function handleDoubleClick() {
    void applyToHost();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void applyToHost();
    }
  }

  function handleCardClick() {
    if (!chipsMode) return;
    if (locked) openSubscribeFlow();
  }

  return (
    <>
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        title={chipsMode ? undefined : locked ? `${item.name} (premium — sign in to apply)` : item.name}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onFocus={() => {
          setHoveredItemName(item.name);
          if (isAudio || !playPreview) {
            if (!playPreview) setExclusiveHoverId(item.id);
            setHovered(true);
          }
        }}
        onBlur={() => {
          setHoveredItemName(null);
          if (isAudio || !playPreview) {
            if (!playPreview && exclusiveHoverId === item.id) clearExclusiveHover();
            setHovered(false);
          }
        }}
        onKeyDown={handleKeyDown}
        onClick={handleCardClick}
        onDoubleClick={handleDoubleClick}
        className="group relative w-full overflow-hidden border border-white/5 bg-secondary/40 outline-none ring-primary/60 transition focus-visible:ring-2"
        style={{
          borderRadius: cardRadius,
          aspectRatio,
        }}
      >
        {waitingPoster && (
          <div
            className="absolute inset-0 z-[2] animate-pulse bg-secondary/80"
            aria-hidden
          />
        )}

        {(!imgSrc || posterFailed) && !waitingPoster && !(showMotion && isVideoMotion) && (
          <div className="absolute inset-0 bg-gradient-to-br from-secondary to-background" />
        )}

        {showAudioIcon && (
          <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
            <AudioLines
              className={cn(
                "text-white/35 transition-colors duration-150",
                hovered && audioEnabled && "text-primary/75",
              )}
              style={{ width: "38%", height: "38%" }}
              strokeWidth={1.5}
            />
          </div>
        )}

        {/* Keep poster mounted under video so hover never flashes a blank/broken frame. */}
        {imgSrc && !posterFailed && (
          <img
            key={`${item.id}:poster:${posterUrl ?? "none"}`}
            src={gifSrc || posterUrl || imgSrc}
            alt=""
            onLoad={() => setPosterPainted(true)}
            onError={() => {
              setPosterFailed(true);
              setPosterPainted(false);
            }}
            className={cn(
              "absolute inset-0 size-full object-cover transition-opacity duration-150",
              waitingPoster ? "opacity-0" : "opacity-100",
            )}
            draggable={false}
          />
        )}

        {motion && isVideoMotion && motionUrl && showMotion && (
          <video
            key={`${item.id}:${motionUrl}`}
            ref={videoRef}
            src={motionUrl}
            poster={posterUrl ?? undefined}
            muted={shouldMute}
            loop
            playsInline
            preload="metadata"
            className="pointer-events-none absolute inset-0 z-[1] size-full object-cover"
          />
        )}

        {chipsMode ? (
          <>
            {isNew && (
              <span className="pointer-events-none absolute left-1 top-1 z-[9] rounded-sm bg-primary/90 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground">
                New
              </span>
            )}
            <button
              type="button"
              aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={favorited}
              onClick={handleFavoriteClick}
              className={cn(
                "absolute left-1 top-1 z-10 flex size-6 items-center justify-center rounded-md transition-opacity",
                favorited
                  ? "bg-black/45 text-primary opacity-100"
                  : "bg-black/40 text-white opacity-0 group-hover:opacity-100",
              )}
            >
              <Star
                className="size-3.5"
                fill={favorited ? "currentColor" : "none"}
                strokeWidth={2.25}
              />
            </button>
            <div className="absolute right-1 top-1 z-10">
              {locked ? (
                <button
                  type="button"
                  aria-label="Unlock with Gal Toolkit Max"
                  title="Unlock with Gal Toolkit Max"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    openSubscribeFlow();
                  }}
                  className="flex size-6 items-center justify-center rounded-full bg-black/55 text-white shadow-sm"
                >
                  <Lock className="size-3" strokeWidth={2.25} />
                </button>
              ) : accountPlan === "free" ? (
                <span
                  className="pointer-events-none rounded-sm bg-primary/90 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm"
                  aria-label="Included on Free"
                >
                  Free
                </span>
              ) : null}
            </div>
            {cachedLocally && !isApplying && (
              <div
                className="pointer-events-none absolute bottom-1 left-1 z-10 flex size-5 items-center justify-center rounded-full bg-black/55 text-emerald-400 shadow-sm"
                aria-label="Downloaded"
                title="Downloaded"
              >
                <Check className="size-3" strokeWidth={2.75} />
              </div>
            )}
          </>
        ) : (
          <>
            {(isNew || isPremium) && (
              <div className="pointer-events-none absolute left-1 top-1 z-10 flex gap-1">
                {isNew && (
                  <span className="rounded-sm bg-primary/90 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground">
                    New
                  </span>
                )}
                {isPremium && (
                  <span className="flex items-center gap-0.5 rounded-sm bg-black/60 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-300">
                    <Sparkles className="size-2.5" />
                    Pro
                  </span>
                )}
              </div>
            )}
            <div className="absolute right-1 top-1 z-10">
              <button
                type="button"
                aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={favorited}
                onClick={handleFavoriteClick}
                className={cn(
                  "flex size-6 items-center justify-center rounded-md transition-opacity",
                  favorited
                    ? "bg-black/45 text-primary opacity-100"
                    : "bg-black/40 text-white opacity-0 group-hover:opacity-100",
                )}
              >
                <Star
                  className="size-3.5"
                  fill={favorited ? "currentColor" : "none"}
                  strokeWidth={2.25}
                />
              </button>
            </div>
          </>
        )}

        {chipsMode && !isApplying && (
          <div
            className={cn(
              "absolute bottom-0 right-0 z-20 p-1 transition-opacity",
              hovered ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <button
              type="button"
              onPointerDown={handleImportPointerDown}
              className={cn(
                "inline-flex items-center justify-center rounded-md bg-primary/55 font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary",
                gridColumns <= 1
                  ? "gap-1 px-2.5 py-1.5 text-[10px]"
                  : gridColumns === 2
                    ? "gap-1 px-2 py-1 text-[9px]"
                    : "gap-0.5 px-1.5 py-0.5 text-[8px]",
              )}
            >
              <Download
                className={gridColumns >= 3 ? "size-2.5" : "size-3"}
                strokeWidth={2.5}
              />
              Import
            </button>
          </div>
        )}

        {chipsMode && isApplying && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45">
            <Loader2 className="size-5 animate-spin text-white" />
          </div>
        )}

        {!chipsMode && (isApplying || locked) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55">
            {isApplying ? (
              <Loader2 className="size-5 animate-spin text-white" />
            ) : (
              <Lock className="size-4 text-white/80" />
            )}
          </div>
        )}
      </div>

      {chipsMode && (
        <ConfirmDialog
          open={subscribeOpen}
          title="Gal Toolkit Max"
          message="Subscribe to Gal Toolkit Max to unlock this item and the full library."
          confirmLabel="Get Max"
          cancelLabel="Not now"
          onCancel={() => setSubscribeOpen(false)}
          onConfirm={() => {
            setSubscribeOpen(false);
            const url = (subscribeUrl || "https://premieregal.motionflow.pro").trim();
            if (url) openLinkInBrowser(url);
          }}
        />
      )}
    </>
  );
});

// --- Skeleton ---------------------------------------------------------------

function SectionTitleSkeleton({
  title,
  count,
  sticky,
}: {
  title: string;
  count: number;
  sticky: boolean;
}) {
  return (
    <h3
      className={
        sticky
          ? "gal-footage-section__title"
          : "mb-1.5 px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground"
      }
    >
      {title}
      <span
        className={
          sticky
            ? "gal-footage-section__title-count"
            : "ml-1.5 font-medium text-muted-foreground/70"
        }
      >
        {count}
      </span>
    </h3>
  );
}

function GridSkeleton({
  sections,
  columns,
  accessUi = "overlay",
  stickySectionTitles = false,
}: {
  sections: PackContentSection[];
  columns: number;
  accessUi?: FootageAccessUi;
  stickySectionTitles?: boolean;
}) {
  const cols = Math.max(1, columns);
  const radius = accessUi === "chips" ? CARD_RADIUS_CHIPS : CARD_RADIUS_OVERLAY;
  const maxCells = cols * SKELETON_CELLS_PER_SECTION_ROWS;

  return (
    <div
      className="relative w-full"
      style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP_PX }}
      aria-busy="true"
      aria-label="Loading previews"
    >
      {sections.map((section) => {
        if (section.items.length === 0) return null;
        const aspectCss =
          resolvePreviewAspectRatio(section.items[0]?.group) || "16 / 9";
        const cells = Math.min(section.items.length, maxCells);

        return (
          <section
            key={section.id}
            className={stickySectionTitles ? "gal-footage-section" : "w-full"}
          >
            {section.title ? (
              <SectionTitleSkeleton
                title={section.title}
                count={section.items.length}
                sticky={stickySectionTitles}
              />
            ) : null}
            <div
              className="grid items-start"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: GRID_GAP_PX,
              }}
            >
              {Array.from({ length: cells }, (_, i) => (
                <div
                  key={i}
                  className="animate-pulse bg-secondary/70"
                  style={{
                    aspectRatio: aspectCss,
                    borderRadius: radius,
                    animationDelay: `${(i % cols) * 40}ms`,
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// --- Grid -------------------------------------------------------------------

export function FootageGrid({
  sections,
  assetsPath,
  assetsBaseUrl,
  assetsHost,
  packFilePath = "",
  settings,
  isLocked,
  isReady,
  prepareApply,
  accessUi = "overlay",
  accountPlan,
  subscribeUrl,
  emptyMessage = "No matches",
  stickySectionTitles = false,
}: {
  sections: PackContentSection[];
  assetsPath: string;
  /** HTTPS media proxy base (Gal R2 Assets). Used when `assetsPath` is empty. */
  assetsBaseUrl?: string;
  assetsHost?: PackHostId | null;
  packFilePath?: string;
  settings?: PackSettings | null;
  isLocked?: (item: PackTreeItem) => boolean;
  /** Local project ready to apply (checkmark). Defaults to false in chips mode. */
  isReady?: (item: PackTreeItem) => boolean;
  /** Download/version-check before apply (Gal on-demand R2). */
  prepareApply?: (
    item: PackTreeItem,
  ) => Promise<
    | { ok: true; packFilePath: string; settings: PackSettings | null }
    | { ok: false; message: string }
  >;
  accessUi?: FootageAccessUi;
  accountPlan?: GalAccountPlan | null;
  subscribeUrl?: string;
  emptyMessage?: string;
  /** Stick section titles to the top of the scroll container while browsing. */
  stickySectionTitles?: boolean;
}) {
  const { gridColumns } = usePanelUI();
  const preferWebm = packPrefersWebmPreview(settings);
  const useMp4 = settings?.inside_option_sets?.use_webm_preview === "mp4";
  const lockedFn = isLocked ?? (() => false);
  const readyFn = isReady ?? (() => Boolean(assetsPath && packFilePath));

  const itemCount = useMemo(
    () => sections.reduce((sum, s) => sum + s.items.length, 0),
    [sections],
  );

  const contentKey = useMemo(
    () =>
      `${gridColumns}|${assetsPath}|${assetsBaseUrl || ""}|${sections.map((s) => `${s.id}:${s.items.length}`).join("|")}`,
    [sections, gridColumns, assetsPath, assetsBaseUrl],
  );

  // Only defer mount for huge lists (CEP hitch). Small categories mount immediately
  // and use per-card poster skeletons so headers don't jump and UI doesn't flash.
  const isLargeList = itemCount >= SKELETON_THRESHOLD;
  const [gridReady, setGridReady] = useState(!isLargeList);

  // Kick off above-the-fold HTTPS posters immediately (don't wait for card effects / IO).
  useEffect(() => {
    if (!assetsBaseUrl) return;
    const host = assetsHost === "AE" ? "AE" : "PR";
    const budget = Math.max(1, gridColumns) * EAGER_PREVIEW_ROWS;
    let seen = 0;
    for (const section of sections) {
      for (const item of section.items) {
        if (seen >= budget) return;
        const media = resolveItemRemotePreviewMedia(item, assetsBaseUrl, {
          preferWebm,
          useMp4,
          host,
        });
        if (media.posterPath) warmPreviewCache(media.posterPath);
        seen += 1;
      }
    }
  }, [contentKey, assetsBaseUrl, assetsHost, preferWebm, useMp4, gridColumns, sections]);

  useEffect(() => {
    if (!isLargeList) {
      setGridReady(true);
      return;
    }
    setGridReady(false);
    let cancelled = false;
    let timeoutId = 0;
    const rafId = requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => {
        if (!cancelled) setGridReady(true);
      }, LARGE_LIST_MOUNT_MS);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [contentKey, isLargeList]);

  if (sections.length === 0 || itemCount === 0) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  if (isLargeList && !gridReady) {
    return (
      <GridSkeleton
        sections={sections}
        columns={gridColumns}
        accessUi={accessUi}
        stickySectionTitles={stickySectionTitles}
      />
    );
  }

  let flatOffset = 0;

  return (
    <div className="relative w-full" style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP_PX }}>
      {sections.map((section) => {
        if (section.items.length === 0) return null;
        const sectionStart = flatOffset;
        flatOffset += section.items.length;

        return (
          <section
            key={section.id}
            className={stickySectionTitles ? "gal-footage-section" : "w-full"}
          >
            {section.title ? (
              <SectionTitleSkeleton
                title={section.title}
                count={section.items.length}
                sticky={stickySectionTitles}
              />
            ) : null}
            <div
              className="grid items-start"
              style={{
                gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                gap: GRID_GAP_PX,
              }}
            >
              {section.items.map((clip, itemIndex) => (
                <PreviewCard
                  key={clip.id}
                  item={clip}
                  assetsPath={assetsPath}
                  assetsBaseUrl={assetsBaseUrl}
                  assetsHost={assetsHost}
                  packFilePath={packFilePath}
                  settings={settings}
                  locked={lockedFn(clip)}
                  ready={readyFn(clip)}
                  accessUi={accessUi}
                  accountPlan={accountPlan}
                  subscribeUrl={subscribeUrl}
                  preferWebm={preferWebm}
                  useMp4={useMp4}
                  prepareApply={prepareApply}
                  gridIndex={sectionStart + itemIndex}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
