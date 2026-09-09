import { ChevronsUp, Loader2, Search, Star, X } from "lucide-react";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PanelSidebar } from "@/components/panel-sidebar";
import { FootageGrid } from "@/components/footage-grid";
import { usePanelUI } from "@/lib/panel-ui-context";
import { usePackWorkspace } from "@/lib/use-pack-workspace";
import { BRAND } from "@brands";
import { GalFooter } from "./GalFooter";

const SNAP_EPSILON_PX = 28;
/** Sticky section title band — scroll-spy treats this as the "active" line. */
const STICKY_SPY_EPSILON_PX = 44;
/** Near end of scroll: last section cannot reach the sticky line — force-activate it. */
const SCROLL_BOTTOM_EPS_PX = 8;
/** Ignore scroll-spy updates while programmatic scroll animates. */
const SPY_SUPPRESS_MS = 600;

function scrollMainToNearestGroup(scroller: HTMLElement) {
  const sections = Array.from(
    scroller.querySelectorAll<HTMLElement>(".gal-footage-section"),
  );
  if (sections.length === 0) return;

  const scrollTop = scroller.scrollTop;
  const starts = sections.map((el) => ({
    el,
    top: el.offsetTop,
  }));

  // Section that currently owns the viewport top (last start <= scrollTop + eps).
  let currentIdx = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i].top <= scrollTop + SNAP_EPSILON_PX) currentIdx = i;
    else break;
  }

  const current = starts[currentIdx];
  const atCurrentStart = Math.abs(scrollTop - current.top) <= SNAP_EPSILON_PX;
  const targetIdx =
    atCurrentStart && currentIdx > 0 ? currentIdx - 1 : currentIdx;
  const targetTop = starts[targetIdx].top;

  scroller.scrollTo({ top: targetTop, behavior: "smooth" });
}

const GalSearchTools = memo(function GalSearchTools({
  query,
  onQuery,
  showFavoritesOnly,
  onToggleFavorites,
  disabled,
}: {
  query: string;
  onQuery: (q: string) => void;
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
  disabled: boolean;
}) {
  // Local value so typing stays responsive while the grid filters in a transition.
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  return (
    <div className="gal-sidebar-tools">
      <label className="gal-sidebar-search">
        <Search className="size-3.5 shrink-0" aria-hidden />
        <input
          type="text"
          value={localQuery}
          onChange={(e) => {
            const next = e.target.value;
            setLocalQuery(next);
            startTransition(() => onQuery(next));
          }}
          placeholder="Find items"
          disabled={disabled}
        />
        {localQuery ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setLocalQuery("");
              startTransition(() => onQuery(""));
            }}
          >
            <X className="size-3" />
          </button>
        ) : null}
      </label>
      <button
        type="button"
        className={
          showFavoritesOnly ? "gal-sidebar-fav is-active" : "gal-sidebar-fav"
        }
        aria-pressed={showFavoritesOnly}
        aria-label="Favorites"
        title="Favorites"
        disabled={disabled}
        onClick={() => startTransition(() => onToggleFavorites())}
      >
        <Star
          className="size-3.5"
          fill={showFavoritesOnly ? "currentColor" : "none"}
        />
      </button>
    </div>
  );
});

export function GalEffectsWorkspace({
  workspace,
}: {
  workspace: ReturnType<typeof usePackWorkspace>;
}) {
  const { showFavoritesOnly, showAvailableOnly, toggleShowFavoritesOnly } =
    usePanelUI();
  const {
    tree,
    sidebarTree,
    category,
    setCategory,
    query,
    setQuery,
    packError,
    assetsPath,
    assetsBaseUrl,
    assetsHost,
    packFilePath,
    packSettings,
    sections,
    activeRootId,
    scrollTargetSectionId,
    galAccountPlan,
    isLocked,
    isReady,
    prepareApply,
    structureLoading,
  } = workspace;

  const canBrowseRemote = Boolean(assetsBaseUrl) || tree.length > 0;
  const catalogLoading = structureLoading && tree.length === 0;
  const mainRef = useRef<HTMLDivElement>(null);
  const [showJumpFab, setShowJumpFab] = useState(false);
  const [gridReady, setGridReady] = useState(false);
  const [visibleSectionId, setVisibleSectionId] = useState<string | null>(null);
  const suppressSpyUntilRef = useRef(0);

  const spyEnabled =
    !showFavoritesOnly && query.trim().length === 0 && Boolean(activeRootId);

  const syncJumpFab = useCallback(() => {
    const el = mainRef.current;
    if (!el) {
      setShowJumpFab(false);
      return;
    }
    const sectionCount = el.querySelectorAll(".gal-footage-section").length;
    setShowJumpFab(sectionCount > 0 && el.scrollTop > SNAP_EPSILON_PX);
  }, []);

  const syncScrollSpy = useCallback(() => {
    if (!spyEnabled) return;
    if (Date.now() < suppressSpyUntilRef.current) return;
    const el = mainRef.current;
    if (!el) return;

    const nodes = Array.from(
      el.querySelectorAll<HTMLElement>("[data-section-id]"),
    );
    if (nodes.length === 0) return;

    const scrollTop = el.scrollTop;
    const maxScroll = el.scrollHeight - el.clientHeight;
    // Last section's title often never reaches the sticky band — not enough
    // content below it. When pinned to the bottom, treat the last section as active.
    const atBottom =
      maxScroll > SCROLL_BOTTOM_EPS_PX &&
      scrollTop >= maxScroll - SCROLL_BOTTOM_EPS_PX;

    let activeId = "";
    if (atBottom) {
      activeId = nodes[nodes.length - 1].dataset.sectionId || "";
    } else {
      activeId = nodes[0].dataset.sectionId || "";
      for (const node of nodes) {
        const id = node.dataset.sectionId;
        if (!id) continue;
        if (node.offsetTop <= scrollTop + STICKY_SPY_EPSILON_PX) activeId = id;
        else break;
      }
    }
    if (activeId) {
      setVisibleSectionId((prev) => (prev === activeId ? prev : activeId));
    }
  }, [spyEnabled]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        syncJumpFab();
        syncScrollSpy();
      });
    };
    syncJumpFab();
    syncScrollSpy();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [syncJumpFab, syncScrollSpy, sections, catalogLoading, gridReady]);

  // Clear spy when leaving browse mode.
  useEffect(() => {
    if (!spyEnabled) setVisibleSectionId(null);
  }, [spyEnabled]);

  // Scroll to the selected subgroup once the root grid is ready (or on category click).
  useEffect(() => {
    if (!gridReady || !scrollTargetSectionId || !spyEnabled) return;
    const el = mainRef.current;
    if (!el) return;

    const target = el.querySelector<HTMLElement>(
      `[data-section-id="${scrollTargetSectionId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
    );
    if (!target) return;

    suppressSpyUntilRef.current = Date.now() + SPY_SUPPRESS_MS;
    setVisibleSectionId(scrollTargetSectionId);
    el.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  }, [category, gridReady, scrollTargetSectionId, spyEnabled]);

  const jumpToNearestGroup = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    suppressSpyUntilRef.current = Date.now() + SPY_SUPPRESS_MS;
    scrollMainToNearestGroup(el);
  }, []);

  const handleReadyChange = useCallback((ready: boolean) => {
    setGridReady(ready);
  }, []);

  const sidebarActive = showFavoritesOnly
    ? ""
    : spyEnabled
      ? visibleSectionId || category
      : category;

  const searchTools: ReactNode = (
    <GalSearchTools
      query={query}
      onQuery={setQuery}
      showFavoritesOnly={showFavoritesOnly}
      onToggleFavorites={toggleShowFavoritesOnly}
      disabled={catalogLoading}
    />
  );

  return (
    <div className="gal-effects">
      <div className="gal-effects__body">
        <PanelSidebar
          tree={showAvailableOnly ? sidebarTree : tree}
          active={sidebarActive}
          onSelect={(id) => startTransition(() => setCategory(id))}
          tools={searchTools}
          loading={structureLoading}
        />
        <div className="gal-effects__main" ref={mainRef}>
          {catalogLoading ? (
            <div className="gal-effects__empty" aria-busy="true">
              <Loader2 className="gal-effects__spinner" aria-hidden />
              <span>Loading catalog…</span>
            </div>
          ) : packError && tree.length === 0 ? (
            <div className="gal-effects__empty">{packError}</div>
          ) : !canBrowseRemote && tree.length === 0 ? (
            <div className="gal-effects__empty">
              Effects catalog is empty. Check your connection or try again later.
            </div>
          ) : (
            <div className="gal-effects__grid-enter">
              <FootageGrid
                sections={sections}
                assetsPath={assetsPath}
                assetsBaseUrl={assetsBaseUrl}
                assetsHost={assetsHost}
                packFilePath={packFilePath}
                settings={packSettings}
                isLocked={isLocked}
                isReady={isReady}
                prepareApply={prepareApply}
                accessUi="chips"
                accountPlan={galAccountPlan}
                subscribeUrl={BRAND.siteOrigin}
                stickySectionTitles
                rootId={activeRootId}
                onReadyChange={handleReadyChange}
                emptyMessage={
                  showAvailableOnly
                    ? "No items available on your plan in this view."
                    : "No matches"
                }
              />
            </div>
          )}
          {showJumpFab ? (
            <button
              type="button"
              className="gal-jump-group-float"
              aria-label="Jump to nearest group"
              title="Jump to nearest group"
              onClick={jumpToNearestGroup}
            >
              <ChevronsUp className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      <GalFooter />
    </div>
  );
}
