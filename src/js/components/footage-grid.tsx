import { applyPackItemToHost } from "@/lib/utils/apply-item";
import { pathToObjectUrl, resolveItemsPreviewMedia, type ItemPreviewMedia } from "@/lib/utils/pack-preview";
import { resolvePreviewAspectRatio, type PackContentSection } from "@/lib/utils/pack-tree";
import type { PackSettings, PackTreeItem } from "@/lib/utils/pack-types";
import { usePanelUI } from "@/lib/panel-ui-context";
import { cn } from "@/lib/utils";
import { Loader2, Lock, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

/** First batch of cards per section; more load as the sentinel enters the scrollport. */
const INITIAL_VISIBLE = 24;
const LOAD_MORE = 24;

function getScrollParent(el: HTMLElement | null): Element | null {
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

function PreviewCard({
  item,
  media,
  packFilePath,
  settings,
  locked,
}: {
  item: PackTreeItem;
  media: ItemPreviewMedia | undefined;
  packFilePath: string;
  settings?: PackSettings | null;
  locked: boolean;
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
  const [motionUrl, setMotionUrl] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const favorited = isFavorite(item.id);
  const motion = media?.motion ?? null;
  const posterUrl = media?.posterUrl ?? null;
  const isVideoMotion = motion?.kind === "webm" || motion?.kind === "mp4";
  const isGifMotion = motion?.kind === "gif";
  const aspectRatio = resolvePreviewAspectRatio(item.group);
  const isApplying = applyingItemId === item.id;
  const isNew = showNewBadges && !!item.group.is_new_mark;
  const isPremium = !!item.group.premium;

  // With Play Preview on, only cards in the scrollport should decode/play.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    if (!playPreview) {
      setInView(true);
      return;
    }

    const root = getScrollParent(el);
    const observer = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { root, rootMargin: "80px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [playPreview]);

  const wantMotion = playPreview ? inView : hovered;
  const showMotion = !!motion && !!motionUrl && wantMotion;

  useEffect(() => {
    if (!motion || motionUrl) return;
    if (!wantMotion) return;
    const url = pathToObjectUrl(motion.path);
    if (url) setMotionUrl(url);
  }, [wantMotion, motion, motionUrl]);

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

  const imgSrc =
    showMotion && isGifMotion && motionUrl ? motionUrl : (posterUrl ?? undefined);

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
      ref={cardRef}
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
          key={imgSrc}
          src={imgSrc}
          alt={item.name}
          onError={() => setPosterFailed(true)}
          className="absolute inset-0 size-full object-cover"
          draggable={false}
        />
      )}

      {motion && isVideoMotion && motionUrl && showMotion && (
        <video
          ref={videoRef}
          src={motionUrl}
          poster={posterUrl ?? undefined}
          muted={!audioEnabled}
          loop
          playsInline
          preload={playPreview ? "auto" : "metadata"}
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
}

function SectionBlock({
  section,
  assetsPath,
  packFilePath,
  settings,
  isLocked,
}: {
  section: PackContentSection;
  assetsPath: string;
  packFilePath: string;
  settings?: PackSettings | null;
  isLocked: (item: PackTreeItem) => boolean;
}) {
  const { gridColumns } = usePanelUI();
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [section.id, section.items]);

  const visibleItems = useMemo(
    () => section.items.slice(0, visibleCount),
    [section.items, visibleCount],
  );

  const hasMore = visibleCount < section.items.length;

  const mediaMap = useMemo(
    () => resolveItemsPreviewMedia(visibleItems, assetsPath, settings),
    [visibleItems, assetsPath, settings],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const root = getScrollParent(sentinel);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisibleCount((count) =>
          Math.min(count + LOAD_MORE, section.items.length),
        );
      },
      { root, rootMargin: "240px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
    // Re-bind when visibleCount grows so a still-visible sentinel keeps loading.
  }, [hasMore, section.items.length, visibleCount]);

  if (section.items.length === 0) return null;

  return (
    <section className="flex flex-col gap-1.5">
      {section.title ? (
        <h3 className="px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
          {section.title}
          <span className="ml-1.5 font-medium text-muted-foreground/70">
            {section.items.length}
          </span>
        </h3>
      ) : null}
      <div
        className="grid items-start gap-1"
        style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((clip) => (
          <PreviewCard
            key={clip.id}
            item={clip}
            media={mediaMap.get(clip.id)}
            packFilePath={packFilePath}
            settings={settings}
            locked={isLocked(clip)}
          />
        ))}
      </div>
      {hasMore ? <div ref={sentinelRef} className="h-px w-full" aria-hidden /> : null}
    </section>
  );
}

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
  if (sections.length === 0) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const locked = isLocked ?? (() => false);

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          assetsPath={assetsPath}
          packFilePath={packFilePath}
          settings={settings}
          isLocked={locked}
        />
      ))}
    </div>
  );
}
