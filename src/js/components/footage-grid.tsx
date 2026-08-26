import { applyPackItemToHost } from "@/lib/utils/apply-item";
import { packItemIsAudio, resolveItemAudioFile } from "@/lib/utils/pack-apply-paths";
import {
  loadPreviewObjectUrl,
  packPrefersWebmPreview,
  playSfxPreview,
  releasePreviewObjectUrl,
  resolveItemPreviewMedia,
  stopSfxPreview,
} from "@/lib/utils/pack-preview";
import { resolvePreviewAspectRatio, type PackContentSection } from "@/lib/utils/pack-tree";
import type { PackSettings, PackTreeItem } from "@/lib/utils/pack-types";
import { usePanelUI } from "@/lib/panel-ui-context";
import { cn } from "@/lib/utils";
import { AudioLines, Loader2, Lock, Sparkles, Star } from "lucide-react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

const GRID_GAP_PX = 4;
const SECTION_GAP_PX = 16;
/** Show skeleton until the grid mounts when the list is large enough to hitch. */
const SKELETON_THRESHOLD = 64;

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
 * Retain a local-file blob URL for as long as `path` is set.
 * Releases on change/unmount so Strict Mode remounts can reuse the same blob.
 */
function usePreviewObjectUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }

    let alive = true;
    let retained = false;
    void loadPreviewObjectUrl(path).then((next) => {
      if (!next) return;
      if (!alive) {
        releasePreviewObjectUrl(path);
        return;
      }
      retained = true;
      setUrl(next);
    });

    return () => {
      alive = false;
      setUrl(null);
      if (retained) releasePreviewObjectUrl(path);
    };
  }, [path]);

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
  packFilePath,
  settings,
  locked,
  preferWebm,
  useMp4,
}: {
  item: PackTreeItem;
  assetsPath: string;
  packFilePath: string;
  settings?: PackSettings | null;
  locked: boolean;
  preferWebm: boolean;
  useMp4: boolean;
}) {
  const {
    playPreview,
    audioEnabled,
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
  const [posterFailed, setPosterFailed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const media = useMemo(
    () => resolveItemPreviewMedia(item, assetsPath, { preferWebm, useMp4 }),
    [item, assetsPath, preferWebm, useMp4],
  );

  const favorited = isFavorite(item.id);
  const motion = media.motion;
  const isAudio = packItemIsAudio(item);
  const isVideoMotion = motion?.kind === "webm" || motion?.kind === "mp4";
  const isGifMotion = motion?.kind === "gif";
  const aspectRatio = resolvePreviewAspectRatio(item.group);
  const isApplying = applyingItemId === item.id;
  const isNew = showNewBadges && !!item.group.is_new_mark;
  const isPremium = !!item.group.premium;
  // AutoPlay must stay silent even when footer audio is on; sound only on hover.
  const shouldMute = playPreview || !audioEnabled;

  const audioPath = useMemo(
    () => (isAudio ? resolveItemAudioFile(item, packFilePath) : null),
    [isAudio, item, packFilePath],
  );

  // Reset media state whenever the cell binds a different item.
  useEffect(() => {
    setHovered(false);
    setInView(false);
    setPosterFailed(false);
    if (exclusiveHoverId === item.id) clearExclusiveHover();
    stopSfxPreview(item.id);
  }, [item.id]);

  const posterUrl = usePreviewObjectUrl(media.posterPath);

  useEffect(() => {
    if (posterUrl) setPosterFailed(false);
  }, [posterUrl]);

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

  const motionUrl = usePreviewObjectUrl(wantMotion && motion ? motion.path : null);
  const audioUrl = usePreviewObjectUrl(wantAudio ? audioPath : null);
  const showMotion = !!motion && !!motionUrl && wantMotion;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideoMotion || !motionUrl || !showMotion) return;

    let cancelled = false;
    video.muted = shouldMute;
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
  }, [showMotion, isVideoMotion, motionUrl, shouldMute, playPreview]);

  useEffect(() => {
    if (!wantAudio || !audioUrl) {
      stopSfxPreview(item.id);
      return;
    }
    playSfxPreview(item.id, audioUrl);
    return () => {
      stopSfxPreview(item.id);
    };
  }, [wantAudio, audioUrl, item.id]);

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

  function handlePointerLeave() {
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

  async function applyToHost() {
    if (isApplying) return;
    if (locked) {
      showStatus("Sign in with an active subscription to apply premium items.", "error");
      return;
    }
    setApplyingItemId(item.id);
    try {
      const result = await applyPackItemToHost(item, packFilePath, settings ?? null);
      if (result.ok) {
        if (result.warning) showStatus(result.warning, "info", 8000);
        else showStatus(`Applied "${item.name}"`, "success");
      } else {
        showStatus(result.message, "error", 6000);
      }
    } finally {
      setApplyingItemId(null);
    }
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

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      title={locked ? `${item.name} (premium — sign in to apply)` : item.name}
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
      onDoubleClick={handleDoubleClick}
      className="group relative w-full overflow-hidden border border-white/5 bg-secondary/40 outline-none ring-primary/60 transition focus-visible:ring-2"
      style={{
        borderRadius: "clamp(2px, 4%, 10px)",
        aspectRatio,
      }}
    >
      {(!imgSrc || posterFailed) && !(showMotion && isVideoMotion) && (
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
          onError={() => setPosterFailed(true)}
          className="absolute inset-0 size-full object-cover"
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

      <div className="absolute right-1 top-1 z-10 flex gap-1">
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

      {(isApplying || locked) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55">
          {isApplying ? (
            <Loader2 className="size-5 animate-spin text-white" />
          ) : (
            <Lock className="size-4 text-white/80" />
          )}
        </div>
      )}
    </div>
  );
});

// --- Skeleton ---------------------------------------------------------------

function GridSkeleton({
  columns,
  aspectCss,
  itemCount,
}: {
  columns: number;
  aspectCss: string;
  itemCount: number;
}) {
  const cols = Math.max(1, columns);
  // Fill roughly a viewport of placeholders, never more than the real count.
  const cells = Math.min(itemCount, cols * 8);

  return (
    <div
      className="grid items-start"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: GRID_GAP_PX,
      }}
      aria-busy="true"
      aria-label="Loading previews"
    >
      {Array.from({ length: cells }, (_, i) => (
        <div
          key={i}
          className="animate-pulse bg-secondary/70"
          style={{
            aspectRatio: aspectCss,
            borderRadius: "clamp(2px, 4%, 10px)",
            animationDelay: `${(i % cols) * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

// --- Grid -------------------------------------------------------------------

export function FootageGrid({
  sections,
  assetsPath,
  packFilePath = "",
  settings,
  isLocked,
  emptyMessage = "No matches",
}: {
  sections: PackContentSection[];
  assetsPath: string;
  packFilePath?: string;
  settings?: PackSettings | null;
  isLocked?: (item: PackTreeItem) => boolean;
  emptyMessage?: string;
}) {
  const { gridColumns } = usePanelUI();
  const preferWebm = packPrefersWebmPreview(settings);
  const useMp4 = settings?.inside_option_sets?.use_webm_preview === "mp4";
  const lockedFn = isLocked ?? (() => false);

  const itemCount = useMemo(
    () => sections.reduce((sum, s) => sum + s.items.length, 0),
    [sections],
  );

  const contentKey = useMemo(
    () =>
      `${gridColumns}|${assetsPath}|${sections.map((s) => `${s.id}:${s.items.length}`).join("|")}`,
    [sections, gridColumns, assetsPath],
  );

  const needsSkeleton = itemCount >= SKELETON_THRESHOLD;
  const [gridReady, setGridReady] = useState(!needsSkeleton);

  // For large lists: paint skeleton first, then mount cards on the next tick
  // so CEP Chromium doesn't freeze on a blank panel.
  useEffect(() => {
    if (!needsSkeleton) {
      setGridReady(true);
      return;
    }

    setGridReady(false);
    let cancelled = false;
    let timeoutId = 0;
    const rafId = requestAnimationFrame(() => {
      // One frame for skeleton paint, then a short defer before heavy mount.
      timeoutId = window.setTimeout(() => {
        if (!cancelled) setGridReady(true);
      }, 32);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [contentKey, needsSkeleton]);

  if (sections.length === 0 || itemCount === 0) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const skeletonAspect =
    resolvePreviewAspectRatio(sections[0]?.items[0]?.group) || "16 / 9";

  if (needsSkeleton && !gridReady) {
    return (
      <GridSkeleton
        columns={gridColumns}
        aspectCss={skeletonAspect}
        itemCount={itemCount}
      />
    );
  }

  return (
    <div className="relative w-full" style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP_PX }}>
      {sections.map((section) => {
        if (section.items.length === 0) return null;

        return (
          <section key={section.id} className="w-full">
            {section.title ? (
              <h3 className="mb-1.5 px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
                {section.title}
                <span className="ml-1.5 font-medium text-muted-foreground/70">
                  {section.items.length}
                </span>
              </h3>
            ) : null}
            <div
              className="grid items-start"
              style={{
                gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                gap: GRID_GAP_PX,
              }}
            >
              {section.items.map((clip) => (
                <PreviewCard
                  key={clip.id}
                  item={clip}
                  assetsPath={assetsPath}
                  packFilePath={packFilePath}
                  settings={settings}
                  locked={lockedFn(clip)}
                  preferWebm={preferWebm}
                  useMp4={useMp4}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
