import { Loader2, Search, Star, X } from "lucide-react";
import {
  memo,
  startTransition,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { PanelSidebar } from "@/components/panel-sidebar";
import { FootageGrid } from "@/components/footage-grid";
import { usePanelUI } from "@/lib/panel-ui-context";
import { usePackWorkspace } from "@/lib/use-pack-workspace";
import { cn } from "@/lib/utils";
import { BRAND } from "@brands";
import { GalFooter } from "./GalFooter";

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
  const { focusMode, showFavoritesOnly, showAvailableOnly, toggleShowFavoritesOnly } =
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

  const showSidebar = !focusMode;
  const canBrowseRemote = Boolean(assetsBaseUrl) || tree.length > 0;
  const catalogLoading = structureLoading && tree.length === 0;
  const showFocusTools = !showSidebar;

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
        {showSidebar ? (
          <PanelSidebar
            tree={showAvailableOnly ? sidebarTree : tree}
            active={showFavoritesOnly ? "" : category}
            onSelect={(id) => startTransition(() => setCategory(id))}
            tools={searchTools}
            loading={structureLoading}
          />
        ) : null}
        <div
          className={cn(
            "gal-effects__main",
            showFocusTools && "gal-effects__main--focus-tools",
          )}
        >
          {showFocusTools ? (
            <div className="gal-effects__focus-tools">{searchTools}</div>
          ) : null}
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
        </div>
      </div>
      <GalFooter />
    </div>
  );
}
