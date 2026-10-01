import { useMemo, useState } from "react";
import {
  LayoutGrid,
  Loader2,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { BRAND } from "@brands";
import { PanelSidebar } from "@/components/panel-sidebar";
import { FootageGrid } from "@/components/footage-grid";
import { usePanelUI } from "@/lib/panel-ui-context";
import type { usePackWorkspace } from "@/lib/use-pack-workspace";
import type { useOdinPackage } from "./use-odin-package";
import { OdinPackagePanel } from "./OdinPackagePanel";
import { OdinFooter } from "./OdinFooter";
import { OdinToolSpoiler } from "./OdinToolSpoiler";
import { useOdinHost } from "./use-odin-host";

export function OdinLibrary({
  workspace,
  packageModel,
  onAiTools,
}: {
  workspace: ReturnType<typeof usePackWorkspace>;
  packageModel: ReturnType<typeof useOdinPackage>;
  onAiTools: () => void;
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const host = useOdinHost();
  const ui = usePanelUI();
  const sections = useMemo(
    () =>
      workspace.sections.length === 1
        ? [{ ...workspace.sections[0], title: "" }]
        : workspace.sections,
    [workspace.sections],
  );
  const missing = !workspace.packFilePath && workspace.tree.length === 0;
  return (
    <section className="odin-library" aria-label="Library">
      <div className="odin-subheader">
        <div className="odin-subheader__tools">
          <button
            type="button"
            aria-label="Toolbar"
            data-tooltip="Toolbar"
            aria-expanded={toolsOpen}
            className={toolsOpen ? "current" : ""}
            onClick={() => setToolsOpen((value) => !value)}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            type="button"
            aria-label="Favorites"
            data-tooltip="Favorites"
            aria-pressed={ui.showFavoritesOnly}
            className={ui.showFavoritesOnly ? "current" : ""}
            onClick={ui.toggleShowFavoritesOnly}
          >
            <Star size={18} />
          </button>
          {BRAND.features.aiTools && (
            <button
              type="button"
              aria-label="AI Tools"
              data-tooltip="AI Tools"
              onClick={onAiTools}
            >
              <Sparkles size={18} />
            </button>
          )}
        </div>
        <label className="odin-search">
          <Search size={16} />
          <input
            aria-label="Find items"
            placeholder="Find items"
            value={workspace.query}
            onChange={(event) => workspace.setQuery(event.target.value)}
          />
        </label>
      </div>
      {toolsOpen && (
        <OdinToolSpoiler
          host={host}
          engine={workspace.packSettings?.main?.engine_pack}
          packName={workspace.packSettings?.main?.name}
        />
      )}
      {workspace.packError && (
        <div className="odin-error" role="alert">
          {workspace.packError}
          <button type="button" onClick={() => workspace.reloadPackList()}>
            Retry
          </button>
        </div>
      )}
      <div className="odin-library__body">
          {!missing && packageModel.installed && (
            <PanelSidebar
              tree={workspace.sidebarTree}
              active={workspace.category}
              onSelect={workspace.setCategory}
              loading={workspace.structureLoading}
            />
          )}
          <main className="odin-library__content">
            {workspace.structureLoading && missing ? (
              <div className="odin-empty" role="status">
                <Loader2 size={32} className="animate-spin" />
                <p>Loading packages…</p>
              </div>
            ) : !packageModel.installed || workspace.packError ? (
              <OdinPackagePanel model={packageModel} />
            ) : (
              <FootageGrid
                sections={sections}
                assetsPath={workspace.assetsPath}
                assetsBaseUrl={workspace.assetsBaseUrl}
                assetsHost={workspace.assetsHost}
                packFilePath={workspace.packFilePath}
                settings={workspace.packSettings}
                isLocked={workspace.isLocked}
                isReady={workspace.isReady}
                prepareApply={workspace.prepareApply}
                emptyMessage={
                  ui.showFavoritesOnly ? "No favorites yet" : "No matches"
                }
              />
            )}
          </main>
      </div>
      <OdinFooter />
    </section>
  );
}
