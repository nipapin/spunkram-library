import { applyPackItemToHost } from "@/lib/utils/apply-item";
import {
  loadPreviewObjectUrl,
  packPrefersWebmPreview,
  resolveItemPreviewMedia,
  revokePreviewObjectUrls,
} from "@/lib/utils/pack-preview";
import { resolvePreviewAspectRatio, type PackContentSection } from "@/lib/utils/pack-tree";
import type { PackSettings, PackTreeItem } from "@/lib/utils/pack-types";
import { usePanelUI } from "@/lib/panel-ui-context";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, Lock, Sparkles, Star } from "lucide-react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

const GRID_GAP_PX = 4;
const SECTION_GAP_PX = 16;
const HEADER_ROW_PX = 26;
const OVERSCAN_ROWS = 2;
/** Cap simultaneous Play Preview video decodes in weak CEP Chromium. */
const MAX_CONCURRENT_VIDEOS = 4;

type FlatRow =
  | { kind: "header"; key: string; title: string; count: number }
  | {
      kind: "cards";
      key: string;
      items: PackTreeItem[];
      aspectCss: string;
      sectionEnd: boolean;
    };

function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function parseAspectRatio(css: string): number {
  const parts = css.split("/").map((s) => parseFloat(s.trim()));
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
    return parts[0] / parts[1];
  }
  return 16 / 9;
}

/** Row height from aspect + width. Includes trailing gap (row or section). */
function estimateCardsRowHeight(
  aspectCss: string,
  containerWidth: number,
  columns: number,
  sectionEnd: boolean,
): number {
  if (containerWidth <= 0 || columns <= 0) return 120;
  const cellW = (containerWidth - GRID_GAP_PX * (columns - 1)) / columns;
  const cardH = cellW / parseAspectRatio(aspectCss);
  return cardH + (sectionEnd ? SECTION_GAP_PX : GRID_GAP_PX);
}

function buildFlatRows(
  sections: PackContentSection[],
  columns: number,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const cols = Math.max(1, columns);

  for (const section of sections) {
    if (section.items.length === 0) continue;

    if (section.title) {
      rows.push({
        kind: "header",
        key: `h:${section.id}`,
        title: section.title,
        count: section.items.length,
      });
    }

    for (let i = 0; i < section.items.length; i += cols) {
      const slice = section.items.slice(i, i + cols);
      const sectionEnd = i + cols >= section.items.length;
      rows.push({
        kind: "cards",
        key: `c:${section.id}:${i}`,
        items: slice,
        aspectCss: resolvePreviewAspectRatio(slice[0].group),
        sectionEnd,
      });
    }
  }

  return rows;
}

// --- Concurrent Play Preview slot manager -----------------------------------

const activeVideoIds = new Set<string>();
const videoSlotListeners = new Set<() => void>();

function notifyVideoSlots(): void {
  for (const listener of videoSlotListeners) listener();
}

function tryAcquireVideoSlot(id: string): boolean {
  if (activeVideoIds.has(id)) return true;
  if (activeVideoIds.size >= MAX_CONCURRENT_VIDEOS) return false;
  activeVideoIds.add(id);
  return true;
}

function releaseVideoSlot(id: string): void {
  if (!activeVideoIds.delete(id)) return;
  notifyVideoSlots();
}

function subscribeVideoSlots(listener: () => void): () => void {
  videoSlotListeners.add(listener);
  return () => {
    videoSlotListeners.delete(listener);
  };
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
  const [hasVideoSlot, setHasVideoSlot] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [motionUrl, setMotionUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const itemIdRef = useRef(item.id);
  itemIdRef.current = item.id;

  const media = useMemo(
    () => resolveItemPreviewMedia(item, assetsPath, { preferWebm, useMp4 }),
    [item, assetsPath, preferWebm, useMp4],
  );

  const favorited = isFavorite(item.id);
  const motion = media.motion;
  const isVideoMotion = motion?.kind === "webm" || motion?.kind === "mp4";
  const isGifMotion = motion?.kind === "gif";
  const aspectRatio = resolvePreviewAspectRatio(item.group);
  const isApplying = applyingItemId === item.id;
  const isNew = showNewBadges && !!item.group.is_new_mark;
  const isPremium = !!item.group.premium;

  // Virtualization already windows cards — mounted ⇒ near viewport.
  // Reset media state whenever the recycled cell binds a different item.
  useEffect(() => {
    setHovered(false);
    setHasVideoSlot(false);
    setPosterFailed(false);
    setPosterUrl(media.posterUrl);
    setMotionUrl(null);
    releaseVideoSlot(item.id);
  }, [item.id, media.posterUrl]);

  // Load poster as soon as the card mounts / item changes (queued FS reads).
  useEffect(() => {
    if (media.posterUrl) {
      setPosterUrl(media.posterUrl);
      return;
    }
    if (!media.posterPath) return;

    const id = item.id;
    let cancelled = false;
    void loadPreviewObjectUrl(media.posterPath).then((url) => {
      if (cancelled || itemIdRef.current !== id || !url) return;
      setPosterUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, media.posterPath, media.posterUrl]);

  // Mounted + Play Preview on ⇒ eligible for motion; otherwise hover-only.
  const wantMotion = playPreview || hovered;
  const showMotion =
    !!motion && !!motionUrl && wantMotion && (!isVideoMotion || hasVideoSlot);

  useEffect(() => {
    if (!isVideoMotion || !wantMotion) {
      releaseVideoSlot(item.id);
      setHasVideoSlot(false);
      return;
    }

    const trySlot = () => {
      setHasVideoSlot(tryAcquireVideoSlot(item.id));
    };
    trySlot();
    const unsubscribe = subscribeVideoSlots(trySlot);
    return () => {
      unsubscribe();
      releaseVideoSlot(item.id);
    };
  }, [isVideoMotion, wantMotion, item.id]);

  useEffect(() => {
    if (!motion) return;
    if (!wantMotion) return;
    if (isVideoMotion && !hasVideoSlot) return;

    const id = item.id;
    const path = motion.path;
    let cancelled = false;
    void loadPreviewObjectUrl(path).then((url) => {
      if (cancelled || itemIdRef.current !== id || !url) return;
      setMotionUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [wantMotion, motion, isVideoMotion, hasVideoSlot, item.id]);

  // Drop motion when leaving hover / play mode so a recycled cell can't flash old video.
  useEffect(() => {
    if (!wantMotion) setMotionUrl(null);
  }, [wantMotion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideoMotion || !motionUrl || !showMotion) return;

    let cancelled = false;
    video.muted = !audioEnabled;
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
  }, [showMotion, isVideoMotion, motionUrl, audioEnabled, playPreview]);

  const resolvedPoster = posterUrl ?? media.posterUrl;
  const imgSrc =
    showMotion && isGifMotion && motionUrl
      ? motionUrl
      : (resolvedPoster ?? undefined);

  function handlePointerEnter() {
    setHoveredItemName(item.name);
    if (!playPreview) setHovered(true);
  }

  function handlePointerLeave() {
    setHoveredItemName(null);
    if (!playPreview) setHovered(false);
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
        showStatus(`Applied "${item.name}"`, "success");
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
      role="button"
      tabIndex={0}
      title={locked ? `${item.name} (premium — sign in to apply)` : item.name}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={() => setHoveredItemName(item.name)}
      onBlur={() => setHoveredItemName(null)}
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

      {imgSrc && !(showMotion && isVideoMotion) && (
        <img
          key={`${item.id}:${imgSrc}`}
          src={imgSrc}
          alt={item.name}
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
          poster={resolvedPoster ?? undefined}
          muted={!audioEnabled}
          loop
          playsInline
          preload="metadata"
          className="pointer-events-none absolute inset-0 size-full object-cover"
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

// --- Virtualized grid -------------------------------------------------------

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
  const hostRef = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const preferWebm = packPrefersWebmPreview(settings);
  const useMp4 = settings?.inside_option_sets?.use_webm_preview === "mp4";
  const lockedFn = isLocked ?? (() => false);

  const rows = useMemo(
    () => buildFlatRows(sections, gridColumns),
    [sections, gridColumns],
  );

  const rowsKey = useMemo(
    () => sections.map((s) => `${s.id}:${s.items.length}`).join("|"),
    [sections],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setScrollElement(getScrollParent(host));

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(w);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Fixed estimates only — measureElement during fast scroll caused gaps/overlaps.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return 100;
      if (row.kind === "header") return HEADER_ROW_PX;
      return estimateCardsRowHeight(
        row.aspectCss,
        containerWidth,
        gridColumns,
        row.sectionEnd,
      );
    },
    overscan: OVERSCAN_ROWS,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  // Reset scroll + free blob URLs when category / query / pack content changes.
  useEffect(() => {
    if (scrollElement) scrollElement.scrollTop = 0;
    virtualizer.scrollToOffset(0);
    return () => {
      revokePreviewObjectUrls();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed by content identity
  }, [rowsKey, gridColumns, assetsPath]);

  // Recompute row sizes when geometry changes (no per-row DOM measuring).
  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerWidth, gridColumns, rowsKey]);

  if (sections.length === 0 || rows.length === 0) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div ref={hostRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (!row) return null;

        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            className="absolute left-0 top-0 w-full"
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {row.kind === "header" ? (
              <h3 className="px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
                {row.title}
                <span className="ml-1.5 font-medium text-muted-foreground/70">
                  {row.count}
                </span>
              </h3>
            ) : (
              <div
                className="grid items-start"
                style={{
                  gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
                  gap: GRID_GAP_PX,
                }}
              >
                {row.items.map((clip) => (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
