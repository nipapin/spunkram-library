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

  const syncJumpFab = useCallback(() => {
    const el = mainRef.current;
    if (!el) {
      setShowJumpFab(false);
      return;
    }
    const sectionCount = el.querySelectorAll(".gal-footage-section").length;
    setShowJumpFab(sectionCount > 0 && el.scrollTop > SNAP_EPSILON_PX);
  }, []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    syncJumpFab();
    el.addEventListener("scroll", syncJumpFab, { passive: true });
    return () => el.removeEventListener("scroll", syncJumpFab);
  }, [syncJumpFab, sections, catalogLoading]);

  const jumpToNearestGroup = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    scrollMainToNearestGroup(el);
  }, []);

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
          active={showFavoritesOnly ? "" : category}
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
