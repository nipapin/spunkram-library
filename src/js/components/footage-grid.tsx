import { ConfirmDialog } from "@/components/ConfirmDialog";
import { applyPackItemToHost } from "@/lib/utils/apply-item";
import { openLinkInBrowser } from "@/lib/utils/bolt";
import { packItemIsAudio, resolveItemAudioFile } from "@/lib/utils/pack-apply-paths";
import "./footage-grid.scss";
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
import {
  PRELOAD_CAP,
  preloadPosters,
} from "@/lib/utils/preview-preload";
import type { PackHostId } from "@/lib/utils/pack-host";
import { resolvePreviewAspectRatio, type PackContentSection } from "@/lib/utils/pack-tree";
import type { PackSettings, PackTreeItem } from "@/lib/utils/pack-types";
import type { GalAccountPlan } from "@/lib/utils/gal-plan";
import { usePanelActions, usePanelGrid } from "@/lib/panel-ui-context";
import { cn } from "@/lib/utils";
import { BRAND } from "@brands";
import { AudioLines, Check, Download, Loader2, Lock, Sparkles, Star } from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

const GRID_GAP_PX = 4;
const SECTION_GAP_PX = 16;
/** Classic Spunkram cards vs Gal chips + Import hover. */
export type FootageAccessUi = "overlay" | "chips";
const CARD_RADIUS_OVERLAY = "clamp(2px, 4%, 10px)";
const CARD_RADIUS_CHIPS = "clamp(10px, 8%, 16px)";
/** Extra margin so posters enqueue slightly before they scroll into view. */
const PREVIEW_LOAD_MARGIN_PX = 150;
const PREVIEW_LOAD_ROOT_MARGIN = `${PREVIEW_LOAD_MARGIN_PX}px 0px`;
const AUTOPLAY_ROOT_MARGIN = "80px 0px";
/** Max skeleton cells per section (≈2 viewports). */
const SKELETON_CELLS_PER_SECTION_ROWS = 8;
/** First N rows load without waiting for IntersectionObserver (beyond preload cap). */
const EAGER_PREVIEW_ROWS = 5;
const HTTPS_URL_RE = /^https?:\/\//i;

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
 * - Warm blob cache hit → sync retain (no readFileSync)
 * - Disk miss → priority queue (eager = priority 0, still yields)
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

    const adoptLocalBlob = (localPath: string, _preferSync: boolean) => {
      // Sync retain is cheap (Map lookup only) — always try so preloaded posters paint
      // without waiting for the async queue tick.
      const syncUrl = retainPreviewObjectUrlSync(localPath);
      if (syncUrl) {
        loadedKeyRef.current = path;
        blobPathRef.current = localPath;
        setUrl(syncUrl);
        return;
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
    if (HTTPS_URL_RE.test(path)) {
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

/** Viewport (or scroll root) hit-test — CEF IntersectionObserver misses some cards on scroll. */
function isElementNearRoot(
  el: Element,
  root: Element | null,
  marginY: number,
): boolean {
  const er = el.getBoundingClientRect();
  if (er.width <= 0 || er.height <= 0) return false;
  const rr = root
    ? root.getBoundingClientRect()
    : {
        top: 0,
        left: 0,
        bottom: window.innerHeight,
        right: window.innerWidth,
      };
  return (
    er.bottom >= rr.top - marginY &&
    er.top <= rr.bottom + marginY &&
    er.right >= rr.left &&
    er.left <= rr.right
  );
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

// --- Shared viewport observers (one scroll root, two IOs for the whole grid) ---

type GridViewportApi = {
  observeNear: (el: Element, onNear: () => void) => () => void;
  observePlay: (el: Element, onChange: (inView: boolean) => void) => () => void;
};

const GridViewportContext = createContext<GridViewportApi | null>(null);

function useGridViewport(): GridViewportApi | null {
  return useContext(GridViewportContext);
}

function GridViewportProvider({
  scrollRoot,
  children,
}: {
  scrollRoot: Element | null;
  children: ReactNode;
}) {
  const nearMap = useRef(new Map<Element, () => void>());
  const playMap = useRef(new Map<Element, (inView: boolean) => void>());
  const nearIo = useRef<IntersectionObserver | null>(null);
  const playIo = useRef<IntersectionObserver | null>(null);
  const scrollRootRef = useRef(scrollRoot);
  scrollRootRef.current = scrollRoot;

  const flushNear = useCallback(() => {
    const root = scrollRootRef.current;
    for (const [el, onNear] of [...nearMap.current]) {
      if (isElementNearRoot(el, root, PREVIEW_LOAD_MARGIN_PX)) onNear();
    }
  }, []);

  useEffect(() => {
    nearIo.current?.disconnect();
    playIo.current?.disconnect();

    // Viewport root (not the inner scroller): CEP/CEF often fails to deliver
    // scroll updates when IntersectionObserver.root is an overflow:auto element.
    nearIo.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          nearMap.current.get(entry.target)?.();
        }
      },
      { root: null, rootMargin: PREVIEW_LOAD_ROOT_MARGIN, threshold: 0 },
    );

    playIo.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          playMap.current.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { root: null, rootMargin: AUTOPLAY_ROOT_MARGIN, threshold: 0 },
    );

    for (const el of nearMap.current.keys()) nearIo.current.observe(el);
    for (const el of playMap.current.keys()) playIo.current.observe(el);

    flushNear();
    const rafId = requestAnimationFrame(flushNear);

    return () => {
      cancelAnimationFrame(rafId);
      nearIo.current?.disconnect();
      playIo.current?.disconnect();
      nearIo.current = null;
      playIo.current = null;
    };
  }, [flushNear]);

  useEffect(() => {
    flushNear();
  }, [scrollRoot, flushNear]);

  useEffect(() => {
    if (!scrollRoot) return;
    let raf = 0;
    const onScroll = () => {
      if (raf || nearMap.current.size === 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        flushNear();
      });
    };
    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollRoot.removeEventListener("scroll", onScroll);
    };
  }, [scrollRoot, flushNear]);

  const api = useMemo<GridViewportApi>(
    () => ({
      observeNear: (el, onNear) => {
        let done = false;
        const fire = () => {
          if (done) return;
          done = true;
          nearMap.current.delete(el);
          nearIo.current?.unobserve(el);
          onNear();
        };
        nearMap.current.set(el, fire);
        nearIo.current?.observe(el);
        if (isElementNearRoot(el, scrollRootRef.current, PREVIEW_LOAD_MARGIN_PX)) {
          fire();
        } else {
          requestAnimationFrame(() => {
            if (!done && isElementNearRoot(el, scrollRootRef.current, PREVIEW_LOAD_MARGIN_PX)) {
              fire();
            }
          });
        }
        return () => {
          done = true;
          nearMap.current.delete(el);
          nearIo.current?.unobserve(el);
        };
      },
      observePlay: (el, onChange) => {
        playMap.current.set(el, onChange);
        playIo.current?.observe(el);
        return () => {
          playMap.current.delete(el);
          playIo.current?.unobserve(el);
        };
      },
    }),
    [],
  );

  return (
    <GridViewportContext.Provider value={api}>{children}</GridViewportContext.Provider>
  );
}

// --- Shared media / interaction for both chrome variants --------------------

type PreviewCardSharedProps = {
  item: PackTreeItem;
  assetsPath: string;
  assetsBaseUrl?: string;
  assetsHost?: PackHostId | null;
  packFilePath: string;
  settings?: PackSettings | null;
  locked: boolean;
  ready: boolean;
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
  gridIndex?: number;
  onRequestSubscribe: () => void;
};

function usePreviewCardModel({
  item,
  assetsPath,
  assetsBaseUrl,
  assetsHost,
  packFilePath,
  settings,
  locked,
  ready,
  preferWebm,
  useMp4,
  prepareApply,
  gridIndex = 0,
  onRequestSubscribe,
  chipsMode,
}: PreviewCardSharedProps & { chipsMode: boolean }) {
  const {
    playPreview,
    audioEnabled,
    previewVolume,
    gridColumns,
    isFavorite,
    toggleFavorite,
    applyingItemId,
    setApplyingItemId,
    showNewBadges,
  } = usePanelGrid();
  const { setHoveredItemName, showStatus } = usePanelActions();
  const viewport = useGridViewport();

  const [hovered, setHovered] = useState(false);
  const [inView, setInView] = useState(false);
  const preloaded = gridIndex < PRELOAD_CAP;
  const eagerLoad =
    preloaded || gridIndex < Math.max(1, gridColumns) * EAGER_PREVIEW_ROWS;
  const [nearView, setNearView] = useState(eagerLoad);
  const [posterFailed, setPosterFailed] = useState(false);
  const [posterPainted, setPosterPainted] = useState(false);
  /** Set only after a successful prepareApply in this session. */
  const [appliedThisSession, setAppliedThisSession] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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
  const isNew = showNewBadges && !!item.group.is_new_mark;
  const isPremium = !!item.group.premium;
  const cardRadius = chipsMode ? CARD_RADIUS_CHIPS : CARD_RADIUS_OVERLAY;
  const shouldMute = playPreview || !audioEnabled;
  const volumeLevel = Math.min(1, Math.max(0, (previewVolume || 0) / 100));
  const downloaded = ready || appliedThisSession;

  const audioPath = useMemo(
    () => (isAudio ? resolveItemAudioFile(item, packFilePath) : null),
    [isAudio, item, packFilePath],
  );

  useEffect(() => {
    setHovered(false);
    setInView(false);
    setNearView(eagerLoad);
    setPosterFailed(false);
    setPosterPainted(false);
    setAppliedThisSession(false);
    if (exclusiveHoverId === item.id) clearExclusiveHover();
    stopSfxPreview(item.id);
  }, [item.id]); // eagerLoad latches below — don't unload on column-count change

  useEffect(() => {
    if (eagerLoad) setNearView(true);
  }, [eagerLoad]);

  const posterUrl = usePreviewObjectUrl(media.posterPath, {
    load: nearView || eagerLoad || preloaded,
    priority: gridIndex,
    eager: eagerLoad || preloaded,
  });

  useEffect(() => {
    setPosterPainted(false);
    if (posterUrl) setPosterFailed(false);
  }, [posterUrl]);

  const markPosterPainted = useCallback(() => setPosterPainted(true), []);
  const markPosterFailed = useCallback(() => {
    setPosterFailed(true);
    setPosterPainted(false);
  }, []);

  const waitingPoster =
    Boolean(media.posterPath) && !posterFailed && (!posterUrl || !posterPainted);

  useEffect(() => {
    if (playPreview) return;
    const sync = () => {
      setHovered(exclusiveHoverId === item.id);
    };
    sync();
    return subscribeExclusiveHover(sync);
  }, [playPreview, item.id]);

  useEffect(() => {
    ensurePanelLeaveListeners(playPreview);
  }, [playPreview]);

  // Shared near-viewport gate — latch once true.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !viewport) return;
    return viewport.observeNear(el, () => setNearView(true));
  }, [viewport, item.id]);

  useEffect(() => {
    if (!playPreview) {
      setInView(false);
      return;
    }
    const el = cardRef.current;
    if (!el || !viewport) return;
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
    void video
      .play()
      .then(() => {
        if (cancelled) video.pause();
      })
      .catch(() => {});

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

  async function applyToHost() {
    if (isApplying) return;
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
      } else if (!ready && !appliedThisSession) {
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
    if (locked) onRequestSubscribe();
  }

  function handleFocus() {
    setHoveredItemName(item.name);
    if (isAudio || !playPreview) {
      if (!playPreview) setExclusiveHoverId(item.id);
      setHovered(true);
    }
  }

  function handleBlur() {
    setHoveredItemName(null);
    if (isAudio || !playPreview) {
      if (!playPreview && exclusiveHoverId === item.id) clearExclusiveHover();
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
    handleFocus,
    handleBlur,
    onRequestSubscribe,
    markPosterPainted,
    markPosterFailed,
  };
}

type CardModel = ReturnType<typeof usePreviewCardModel> & {
  accountPlan?: GalAccountPlan | null;
};

function PosterImg({
  src,
  waiting,
  onPainted,
  onFailed,
}: {
  src: string;
  waiting: boolean;
  onPainted: () => void;
  onFailed: () => void;
}) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (!img?.complete) return;
    if (img.naturalWidth > 0) onPainted();
    else onFailed();
  }, [src, onPainted, onFailed]);

  return (
    <img
      ref={ref}
      src={src}
      alt=""
      onLoad={onPainted}
      onError={onFailed}
      className={cn(
        "absolute inset-0 size-full object-cover transition-opacity duration-150",
        waiting ? "opacity-0" : "opacity-100",
      )}
      draggable={false}
    />
  );
}

function PreviewMediaLayers(m: CardModel) {
  return (
    <>
      {m.waitingPoster && (
        <div
          className="absolute inset-0 z-[2] animate-pulse bg-secondary/80"
          aria-hidden
        />
      )}

      {(!m.imgSrc || m.posterFailed) && !m.waitingPoster && !(m.showMotion && m.isVideoMotion) && (
        <div className="absolute inset-0 bg-gradient-to-br from-secondary to-background" />
      )}

      {m.showAudioIcon && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
          <AudioLines
            className={cn(
              "text-white/35 transition-colors duration-150",
              m.hovered && m.audioEnabled && "text-primary/75",
            )}
            style={{ width: "38%", height: "38%" }}
            strokeWidth={1.5}
          />
        </div>
      )}

      {m.imgSrc && !m.posterFailed && (
        <PosterImg
          src={m.imgSrc}
          waiting={m.waitingPoster}
          onPainted={m.markPosterPainted}
          onFailed={m.markPosterFailed}
        />
      )}

      {m.isVideoMotion && m.motionUrl && m.showMotion && (
        <video
          key={`${m.item.id}:${m.motionUrl}`}
          ref={m.videoRef}
          src={m.motionUrl}
          poster={m.posterUrl ?? undefined}
          muted={m.shouldMute}
          loop
          playsInline
          preload="metadata"
          className="pointer-events-none absolute inset-0 z-[1] size-full object-cover"
        />
      )}
    </>
  );
}

function ChipsPreviewChrome({
  m,
  accountPlan,
}: {
  m: CardModel;
  accountPlan?: GalAccountPlan | null;
}) {
  return (
    <>
      {m.isNew && (
        <span className="pointer-events-none absolute left-1 top-1 z-[9] rounded-sm bg-primary/90 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground">
          New
        </span>
      )}
      <button
        type="button"
        aria-label={m.favorited ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={m.favorited}
        onClick={m.handleFavoriteClick}
        className={cn(
          "absolute left-1 top-1 z-10 flex size-6 items-center justify-center rounded-md transition-opacity",
          m.favorited
            ? "bg-black/45 text-primary opacity-100"
            : "bg-black/40 text-white opacity-0 group-hover:opacity-100",
        )}
      >
        <Star
          className="size-3.5"
          fill={m.favorited ? "currentColor" : "none"}
          strokeWidth={2.25}
        />
      </button>
      <div className="absolute right-1 top-1 z-10">
        {m.locked ? (
          <button
            type="button"
            aria-label="Unlock with Gal Toolkit MAX"
            title="Unlock with Gal Toolkit MAX"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              m.onRequestSubscribe();
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
      {m.downloaded && !m.isApplying && (
        <div
          className="pointer-events-none absolute bottom-1 left-1 z-10 flex size-5 items-center justify-center rounded-full bg-black/55 text-emerald-400 shadow-sm"
          aria-label="Downloaded"
          title="Downloaded"
        >
          <Check className="size-3" strokeWidth={2.75} />
        </div>
      )}
      {!m.isApplying && (
        <div
          className={cn(
            "absolute bottom-0 right-0 z-20 p-1 transition-opacity",
            m.hovered ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <button
            type="button"
            onPointerDown={m.handleImportPointerDown}
            className={cn(
              "inline-flex items-center justify-center rounded-md bg-primary/55 font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary",
              m.gridColumns <= 1
                ? "gap-1 px-2.5 py-1.5 text-[10px]"
                : m.gridColumns === 2
                  ? "gap-1 px-2 py-1 text-[9px]"
                  : "gap-0.5 px-1.5 py-0.5 text-[8px]",
            )}
          >
            <Download
              className={m.gridColumns >= 3 ? "size-2.5" : "size-3"}
              strokeWidth={2.5}
            />
            Import
          </button>
        </div>
      )}
      {m.isApplying && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45">
          <Loader2 className="size-5 animate-spin text-white" />
        </div>
      )}
    </>
  );
}

function OverlayPreviewChrome({ m }: { m: CardModel }) {
  return (
    <>
      {(m.isNew || m.isPremium) && (
        <div className="pointer-events-none absolute left-1 top-1 z-10 flex gap-1">
          {m.isNew && (
            <span className="rounded-sm bg-primary/90 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground">
              New
            </span>
          )}
          {m.isPremium && (
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
          aria-label={m.favorited ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={m.favorited}
          onClick={m.handleFavoriteClick}
          className={cn(
            "flex size-6 items-center justify-center rounded-md transition-opacity",
            m.favorited
              ? "bg-black/45 text-primary opacity-100"
              : "bg-black/40 text-white opacity-0 group-hover:opacity-100",
          )}
        >
          <Star
            className="size-3.5"
            fill={m.favorited ? "currentColor" : "none"}
            strokeWidth={2.25}
          />
        </button>
      </div>
      {(m.isApplying || m.locked) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55">
          {m.isApplying ? (
            <Loader2 className="size-5 animate-spin text-white" />
          ) : (
            <Lock className="size-4 text-white/80" />
          )}
        </div>
      )}
    </>
  );
}

function PreviewCardShell({
  m,
  accountPlan,
  chipsMode,
}: {
  m: CardModel;
  accountPlan?: GalAccountPlan | null;
  chipsMode: boolean;
}) {
  return (
    <div
      ref={m.cardRef}
      role="button"
      tabIndex={0}
      title={
        chipsMode
          ? undefined
          : m.locked
            ? `${m.item.name} (premium — sign in to apply)`
            : m.item.name
      }
      onPointerEnter={m.handlePointerEnter}
      onPointerLeave={m.handlePointerLeave}
      onFocus={m.handleFocus}
      onBlur={m.handleBlur}
      onKeyDown={m.handleKeyDown}
      onClick={m.handleCardClick}
      onDoubleClick={m.handleDoubleClick}
      className="footage-preview-card group relative w-full overflow-hidden border border-white/5 bg-secondary/40 outline-none ring-primary/60 transition focus-visible:ring-2"
      style={{
        borderRadius: m.cardRadius,
        aspectRatio: m.aspectRatio,
      }}
    >
      <PreviewMediaLayers {...m} />
      {chipsMode ? (
        <ChipsPreviewChrome m={m} accountPlan={accountPlan} />
      ) : (
        <OverlayPreviewChrome m={m} />
      )}
    </div>
  );
}

const ChipsPreviewCard = memo(function ChipsPreviewCard(
  props: PreviewCardSharedProps,
) {
  const m = usePreviewCardModel({ ...props, chipsMode: true });
  return (
    <PreviewCardShell m={m} accountPlan={props.accountPlan} chipsMode />
  );
});

const OverlayPreviewCard = memo(function OverlayPreviewCard(
  props: PreviewCardSharedProps,
) {
  const m = usePreviewCardModel({ ...props, chipsMode: false });
  return <PreviewCardShell m={m} chipsMode={false} />;
});

// --- Skeleton / section title -----------------------------------------------

function SectionTitle({
  title,
  count,
  sticky,
}: {
  title: string;
  count: number;
  sticky: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!sticky) return;
    const titleEl = titleRef.current;
    const sentinel = sentinelRef.current;
    if (!titleEl || !sentinel) return;
    const scroller = closestScrollParent(titleEl);
    if (!scroller) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const sentinelTop = sentinel.getBoundingClientRect().top;
      const rootTop = scroller.getBoundingClientRect().top;
      setStuck(sentinelTop <= rootTop + 0.5);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sticky, title, count]);

  if (!sticky) {
    return (
      <h3 className="mb-1.5 px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
        {title}
        <span className="ml-1.5 font-medium text-muted-foreground/70">
          {count}
        </span>
      </h3>
    );
  }

  return (
    <>
      <div
        ref={sentinelRef}
        className="gal-footage-section__stick-sentinel"
        aria-hidden
      />
      <h3
        ref={titleRef}
        className={cn(
          "gal-footage-section__title",
          stuck && "is-stuck",
        )}
      >
        {title}
        <span className="gal-footage-section__title-count">{count}</span>
      </h3>
    </>
  );
}

function GridSkeleton({
  sections,
  columns,
  accessUi = "overlay",
  stickySectionTitles = false,
  progress,
}: {
  sections: PackContentSection[];
  columns: number;
  accessUi?: FootageAccessUi;
  stickySectionTitles?: boolean;
  progress?: { done: number; total: number } | null;
}) {
  const cols = Math.max(1, columns);
  const radius = accessUi === "chips" ? CARD_RADIUS_CHIPS : CARD_RADIUS_OVERLAY;
  const maxCells = cols * SKELETON_CELLS_PER_SECTION_ROWS;
  const progressLabel =
    progress && progress.total > 0
      ? `Loading previews ${progress.done} / ${progress.total}`
      : "Loading previews";

  return (
    <div
      className="relative w-full"
      style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP_PX }}
      aria-busy="true"
      aria-label={progressLabel}
    >
      {progress && progress.total > 0 ? (
        <p className="px-2 text-[11px] text-muted-foreground">{progressLabel}</p>
      ) : null}
      {sections.map((section) => {
        if (section.items.length === 0) return null;
        const aspectCss =
          resolvePreviewAspectRatio(section.items[0]?.group) || "16 / 9";
        const cells = Math.min(section.items.length, maxCells);

        return (
          <section
            key={section.id}
            data-section-id={section.id}
            className={stickySectionTitles ? "gal-footage-section" : "w-full"}
          >
            {section.title ? (
              <SectionTitle
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
                  className="footage-preview-card animate-pulse bg-secondary/70"
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
  rootId = "",
  onReadyChange,
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
  /** Root category id — preload key; subgroup changes must not remount. */
  rootId?: string;
  /** Fires when the live grid (not skeleton) is shown / hidden. */
  onReadyChange?: (ready: boolean) => void;
}) {
  const { gridColumns } = usePanelGrid();
  const preferWebm = packPrefersWebmPreview(settings);
  const useMp4 = settings?.inside_option_sets?.use_webm_preview === "mp4";
  const lockedFn = isLocked ?? (() => false);
  const readyFn = isReady ?? (() => Boolean(assetsPath && packFilePath));
  const chipsMode = accessUi === "chips";
  const Card = chipsMode ? ChipsPreviewCard : OverlayPreviewCard;

  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const requestSubscribe = useCallback(() => setSubscribeOpen(true), []);

  const rootRef = useRef<HTMLDivElement>(null);
  const [scrollRoot, setScrollRoot] = useState<Element | null>(null);

  const itemCount = useMemo(
    () => sections.reduce((sum, s) => sum + s.items.length, 0),
    [sections],
  );

  /** Layout identity — columns / assets base. */
  const layoutKey = useMemo(
    () => `${gridColumns}|${assetsPath}|${assetsBaseUrl || ""}`,
    [gridColumns, assetsPath, assetsBaseUrl],
  );

  /** Unit of preload: root category. Subgroup nav must not remount. */
  const preloadKey = useMemo(
    () => `${layoutKey}|${rootId || "all"}`,
    [layoutKey, rootId],
  );

  const posterPathsForPreload = useMemo(() => {
    const host = assetsHost === "AE" ? "AE" : "PR";
    const paths: string[] = [];
    for (const section of sections) {
      for (const item of section.items) {
        if (paths.length >= PRELOAD_CAP) return paths;
        let posterPath: string | null = null;
        if (assetsBaseUrl) {
          posterPath = resolveItemRemotePreviewMedia(item, assetsBaseUrl, {
            preferWebm,
            useMp4,
            host,
          }).posterPath;
        } else if (assetsPath) {
          posterPath = resolveItemPreviewMedia(item, assetsPath, {
            preferWebm,
            useMp4,
          }).posterPath;
        }
        if (posterPath) paths.push(posterPath);
      }
    }
    return paths;
  }, [
    sections,
    assetsBaseUrl,
    assetsPath,
    assetsHost,
    preferWebm,
    useMp4,
  ]);

  const [gridReady, setGridReady] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const releasePreloadRef = useRef<(() => void) | null>(null);
  const completedPreloadKeyRef = useRef<string | null>(null);
  const posterPathsRef = useRef(posterPathsForPreload);
  posterPathsRef.current = posterPathsForPreload;

  useEffect(() => {
    if (itemCount === 0) {
      completedPreloadKeyRef.current = null;
      setGridReady(false);
      setPreloadProgress(null);
      return;
    }

    if (completedPreloadKeyRef.current === preloadKey) {
      setGridReady(true);
      return;
    }

    setGridReady(false);
    const paths = posterPathsRef.current;
    setPreloadProgress({ done: 0, total: paths.length });

    const signal = { cancelled: false };

    void preloadPosters(
      paths,
      (done, total) => {
        if (!signal.cancelled) setPreloadProgress({ done, total });
      },
      signal,
    ).then((cleanup) => {
      if (signal.cancelled) {
        cleanup();
        return;
      }
      releasePreloadRef.current?.();
      releasePreloadRef.current = cleanup;
      completedPreloadKeyRef.current = preloadKey;
      setGridReady(true);
    });

    return () => {
      signal.cancelled = true;
    };
  }, [preloadKey, itemCount]);

  useEffect(() => {
    return () => {
      releasePreloadRef.current?.();
      releasePreloadRef.current = null;
      completedPreloadKeyRef.current = null;
    };
  }, []);

  useEffect(() => {
    onReadyChange?.(gridReady && itemCount > 0);
  }, [gridReady, itemCount, onReadyChange]);

  useLayoutEffect(() => {
    setScrollRoot(closestScrollParent(rootRef.current));
  }, [sections, gridReady]);

  const subscribeHref = (subscribeUrl || BRAND.siteOrigin || "").trim();

  if (sections.length === 0 || itemCount === 0) {
    return (
      <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  if (!gridReady) {
    return (
      <div ref={rootRef}>
        <GridSkeleton
          sections={sections}
          columns={gridColumns}
          accessUi={accessUi}
          stickySectionTitles={stickySectionTitles}
          progress={preloadProgress}
        />
      </div>
    );
  }

  let flatOffset = 0;

  return (
    <div ref={rootRef}>
      <GridViewportProvider scrollRoot={scrollRoot}>
        <div
          className="relative w-full"
          style={{ display: "flex", flexDirection: "column", gap: SECTION_GAP_PX }}
        >
          {sections.map((section) => {
            if (section.items.length === 0) return null;
            const sectionStart = flatOffset;
            flatOffset += section.items.length;

            return (
              <section
                key={section.id}
                data-section-id={section.id}
                className={stickySectionTitles ? "gal-footage-section" : "w-full"}
              >
                {section.title ? (
                  <SectionTitle
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
                    <Card
                      key={clip.id}
                      item={clip}
                      assetsPath={assetsPath}
                      assetsBaseUrl={assetsBaseUrl}
                      assetsHost={assetsHost}
                      packFilePath={packFilePath}
                      settings={settings}
                      locked={lockedFn(clip)}
                      ready={readyFn(clip)}
                      accountPlan={accountPlan}
                      subscribeUrl={subscribeUrl}
                      preferWebm={preferWebm}
                      useMp4={useMp4}
                      prepareApply={prepareApply}
                      gridIndex={sectionStart + itemIndex}
                      onRequestSubscribe={requestSubscribe}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </GridViewportProvider>

      {chipsMode && (
        <ConfirmDialog
          open={subscribeOpen}
          title="Gal Toolkit MAX"
          message="Subscribe to Gal Toolkit MAX to unlock this item and the full library."
          confirmLabel="Get MAX"
          cancelLabel="Not now"
          onCancel={() => setSubscribeOpen(false)}
          onConfirm={() => {
            setSubscribeOpen(false);
            if (subscribeHref) openLinkInBrowser(subscribeHref);
          }}
        />
      )}
    </div>
  );
}
