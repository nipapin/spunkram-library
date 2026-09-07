import { Loader2, Search, Star, X } from "lucide-react";
import { PanelSidebar } from "@/components/panel-sidebar";
import { FootageGrid } from "@/components/footage-grid";
import { usePanelUI } from "@/lib/panel-ui-context";
import { usePackWorkspace } from "@/lib/use-pack-workspace";
import { cn } from "@/lib/utils";
import { BRAND } from "@brands";
import { GalFooter } from "./GalFooter";

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

  const searchTools = (
    <div className="gal-sidebar-tools">
      <label className="gal-sidebar-search">
        <Search className="size-3.5 shrink-0" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find items"
          disabled={catalogLoading}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
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
        disabled={catalogLoading}
        onClick={toggleShowFavoritesOnly}
      >
        <Star
          className="size-3.5"
          fill={showFavoritesOnly ? "currentColor" : "none"}
        />
      </button>
    </div>
  );

  return (
    <div className="gal-effects">
      <div className="gal-effects__body">
        {showSidebar ? (
          <PanelSidebar
            tree={showAvailableOnly ? sidebarTree : tree}
            active={showFavoritesOnly ? "" : category}
            onSelect={setCategory}
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
          )}
        </div>
      </div>
      <GalFooter />
    </div>
  );
}
