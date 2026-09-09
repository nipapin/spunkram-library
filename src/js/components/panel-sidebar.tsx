import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronRight,
  Folder,
  Layers,
  Film,
  Music,
  Sparkles,
  Star,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePanelUI } from "@/lib/panel-ui-context";
import { BRAND, storageKey } from "@brands";
import * as panelStore from "@/lib/userdata-store";
import type { PackTreeIcon, PackTreeNode } from "@/lib/utils/pack-types";
import { resolveGalRootCategoryIcon } from "@/ui/gal/gal-category-icons";
import "./panel-sidebar.scss";

const SIDEBAR_WIDTH_KEY = storageKey("sidebarWidth");
const SIDEBAR_MIN_WIDTH = 140;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 192;
const IS_GAL = BRAND.id === "gal";

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function loadSidebarWidth(): number {
  try {
    const stored = Number(panelStore.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(stored) && stored > 0) return clampSidebarWidth(stored);
  } catch {
    // ignore storage errors
  }
  return SIDEBAR_DEFAULT_WIDTH;
}

function FolderKids({ open, children }: { open: boolean; children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">(open ? "auto" : 0);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    if (open) {
      const frame = requestAnimationFrame(() => setHeight(el.scrollHeight));
      const timer = window.setTimeout(() => setHeight("auto"), 240);
      return () => {
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
      };
    }

    const px = el.getBoundingClientRect().height;
    setHeight(px);
    const frame = requestAnimationFrame(() => setHeight(0));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div
      className="sidebar-tree__kids"
      style={{ height: height === "auto" ? "auto" : `${height}px` }}
    >
      <div ref={innerRef} className="sidebar-tree__kids-inner">
        {children}
      </div>
    </div>
  );
}

function TreeIcon({
  icon,
  active,
  emphasized,
  RootIcon,
}: {
  icon: PackTreeIcon;
  active?: boolean;
  emphasized?: boolean;
  RootIcon?: LucideIcon;
}) {
  const className = cn(
    "size-3.5 shrink-0 sidebar-tree__icon",
    active || emphasized ? "text-primary" : "text-muted-foreground",
  );
  if (RootIcon) {
    return <RootIcon className={className} />;
  }
  switch (icon) {
    case "folder":
      return <Folder className={className} />;
    case "FOOTAGE":
      return <Film className={className} />;
    case "SFX":
      return <Music className={className} />;
    case "PRESETS":
      return <Sparkles className={className} />;
    default:
      return <Layers className={className} />;
  }
}

/** Folder ids that must be open to reveal `targetId` (includes target if it is a folder). */
function folderPathToActive(
  nodes: PackTreeNode[],
  targetId: string,
  trail: string[] = [],
): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node.kind === "folder" ? [...trail, node.id] : trail;
    }
    if (node.kind === "folder") {
      const found = folderPathToActive(node.children, targetId, [
        ...trail,
        node.id,
      ]);
      if (found) return found;
    }
  }
  return null;
}

function TreeNodeRow({
  node,
  active,
  onSelect,
  depth,
  openIds,
  onToggleOpen,
  showNewBadges,
  ancestorIds,
}: {
  node: PackTreeNode;
  active: string;
  onSelect: (id: string) => void;
  depth: number;
  openIds: Set<string>;
  onToggleOpen: (id: string) => void;
  showNewBadges: boolean;
  ancestorIds: Set<string>;
}) {
  const isFolder = node.kind === "folder";
  const isActive = active === node.id;
  const isAncestor = ancestorIds.has(node.id);
  const open = isFolder && openIds.has(node.id);
  const isRoot = depth === 0;
  const rootOnPath = IS_GAL && isRoot && (isActive || isAncestor);
  // All first-order rows stay bright (folders and leaf groups alike).
  const rootEmphasized = IS_GAL && isRoot && !rootOnPath && !isActive;
  const parentEmphasized =
    IS_GAL && isFolder && !isRoot && !isActive && !isAncestor;
  const RootIcon =
    IS_GAL && isRoot ? resolveGalRootCategoryIcon(node.label) : undefined;

  const chevron = isFolder ? (
    <button
      type="button"
      onClick={() => onToggleOpen(node.id)}
      className="sidebar-tree__chevron flex size-3 shrink-0 items-center justify-center"
      aria-label={open ? "Collapse" : "Expand"}
      aria-expanded={open}
    >
      <ChevronRight
        className={cn(
          "size-3 transition-transform duration-200 ease-out",
          IS_GAL ? "sidebar-tree__chevron-icon" : "text-muted-foreground",
          open && "rotate-90",
        )}
      />
    </button>
  ) : IS_GAL ? (
    <span
      className="sidebar-tree__chevron flex size-3 shrink-0 items-center justify-center opacity-0"
      aria-hidden
    >
      <ChevronRight className="size-3" />
    </span>
  ) : (
    <span className="size-3 shrink-0" />
  );

  const countChip = (
    <span
      className={cn(
        "sidebar-tree__count rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        isActive || rootOnPath
          ? "bg-background/60 text-foreground"
          : "bg-secondary/70 text-muted-foreground",
      )}
    >
      {node.count}
    </span>
  );

  return (
    <div className={cn("sidebar-tree__node", open && "is-open")}>
      <div
        className={cn(
          "sidebar-tree__row group flex w-full items-center gap-1.5 text-left text-xs transition-colors",
          IS_GAL ? "rounded-full py-2.5" : "rounded-lg py-1.5",
          !IS_GAL &&
            (isActive
              ? "bg-[#7c4dff]/15 font-semibold text-foreground"
              : "text-muted-foreground hover:text-foreground"),
          IS_GAL && isRoot && "is-root",
          IS_GAL && isFolder && "is-folder",
          IS_GAL && isActive && "is-active",
          IS_GAL && isAncestor && "is-ancestor",
          IS_GAL && rootOnPath && "is-root-active",
          IS_GAL && (rootEmphasized || parentEmphasized) && "is-parent",
          IS_GAL &&
            !isActive &&
            !rootOnPath &&
            !rootEmphasized &&
            !parentEmphasized &&
            "text-muted-foreground hover:text-foreground",
          IS_GAL &&
            (rootEmphasized ||
              parentEmphasized ||
              isActive ||
              rootOnPath) &&
            "font-semibold text-foreground",
        )}
        style={{
          paddingLeft: IS_GAL ? 8 : 8 + depth * 10,
          paddingRight: 8,
        }}
        data-depth={depth}
      >
        {!IS_GAL ? chevron : null}
        <button
          type="button"
          onClick={() => {
            // Gal: LMB on folder toggles when already selected; first click selects
            // (ancestors auto-open via effect). Chevron still toggles without select.
            if (IS_GAL && isFolder && isActive) {
              onToggleOpen(node.id);
              return;
            }
            onSelect(node.id);
          }}
          aria-pressed={isActive}
          className="sidebar-tree__select flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <TreeIcon
            icon={node.icon}
            active={isActive || rootOnPath}
            emphasized={rootEmphasized || parentEmphasized}
            RootIcon={RootIcon}
          />
          <span className="sidebar-tree__label min-w-0 flex-1 truncate">
            {node.label}
          </span>
          {showNewBadges && node.newCount > 0 && (
            <span className="rounded px-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
              NEW
            </span>
          )}
          {countChip}
        </button>
        {IS_GAL ? chevron : null}
      </div>

      {isFolder && (
        <FolderKids open={open}>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              active={active}
              onSelect={onSelect}
              depth={depth + 1}
              openIds={openIds}
              onToggleOpen={onToggleOpen}
              showNewBadges={showNewBadges}
              ancestorIds={ancestorIds}
            />
          ))}
        </FolderKids>
      )}
    </div>
  );
}

export function PanelSidebar({
  tree,
  active,
  onSelect,
  orientation = "vertical",
  tools,
  favoritesId,
  favoritesCount,
  loading = false,
}: {
  tree: PackTreeNode[];
  active: string;
  onSelect: (id: string) => void;
  orientation?: "vertical" | "horizontal";
  /** Optional search / filters rendered above the category tree (Gal). */
  tools?: ReactNode;
  /** When set, pin a Favorites row at the top of the vertical tree. */
  favoritesId?: string;
  favoritesCount?: number;
  /** Show a loading state while the category tree is fetching. */
  loading?: boolean;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [width, setWidth] = useState(loadSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const { showNewBadges } = usePanelUI();

  const ancestorIds = useMemo(() => {
    if (!active || tree.length === 0) return new Set<string>();
    const path = folderPathToActive(tree, active);
    return new Set(path ?? []);
  }, [active, tree]);

  const handleResizePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    setWidth(clampSidebarWidth(drag.startWidth + (e.clientX - drag.startX)));
  }, []);

  const handleResizePointerUp = useCallback(() => {
    dragStateRef.current = null;
    setResizing(false);
    window.removeEventListener("pointermove", handleResizePointerMove);
    window.removeEventListener("pointerup", handleResizePointerUp);
    setWidth((w) => {
      try {
        panelStore.setItem(SIDEBAR_WIDTH_KEY, String(w));
      } catch {
        // ignore storage errors
      }
      return w;
    });
  }, [handleResizePointerMove]);

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startWidth: width };
    setResizing(true);
    window.addEventListener("pointermove", handleResizePointerMove);
    window.addEventListener("pointerup", handleResizePointerUp);
  };

  // avoids leaking listeners if the component unmounts mid-drag
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleResizePointerMove);
      window.removeEventListener("pointerup", handleResizePointerUp);
    };
  }, [handleResizePointerMove, handleResizePointerUp]);

  const handleResizeReset = () => {
    setWidth(SIDEBAR_DEFAULT_WIDTH);
    try {
      panelStore.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT_WIDTH));
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    if (!active || tree.length === 0) return;
    const path = folderPathToActive(tree, active);
    if (!path || path.length === 0) return;
    setOpenIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of path) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [active, tree]);

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (orientation === "horizontal") {
    return (
      <nav className="mx-2.5 mt-2 flex flex-wrap items-center gap-1.5 rounded-2xl px-2.5 py-2 glass-bar">
        {tree.map((node) => {
          const isActive = active === node.id;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              aria-pressed={isActive}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                isActive
                  ? "border-0 pill-brand font-semibold"
                  : "border-[rgb(42,36,64)] bg-[rgb(14,12,26)]/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="whitespace-nowrap">{node.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                  isActive
                    ? "bg-background/60 text-foreground"
                    : "bg-secondary/70 text-muted-foreground",
                )}
              >
                {node.count}
              </span>
            </button>
          );
        })}
      </nav>
    );
  }

  const favoritesActive = Boolean(favoritesId && active === favoritesId);

  return (
    <aside
      className={cn(
        "relative flex shrink-0 border-r border-[rgb(42,36,64)]",
        IS_GAL && "sidebar-tree--gal",
      )}
      style={{ width }}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {tools ? (
          <div className="shrink-0 border-b border-[rgb(42,36,64)] px-1.5 py-2">
            {tools}
          </div>
        ) : null}
        <nav className="sidebar-tree__nav min-w-0 flex-1 overflow-y-auto flex flex-col gap-0.5 px-1 py-2">
          {favoritesId ? (
            <button
              type="button"
              onClick={() => onSelect(favoritesId)}
              aria-pressed={favoritesActive}
              className={cn(
                "group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                IS_GAL && "rounded-full py-2.5",
                favoritesActive
                  ? IS_GAL
                    ? "sidebar-tree__row is-root is-root-active font-semibold text-foreground"
                    : "bg-[#7c4dff]/15 font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Star
                className={cn(
                  "size-3.5 shrink-0",
                  favoritesActive ? "text-primary" : "text-muted-foreground",
                )}
                fill={favoritesActive ? "currentColor" : "none"}
              />
              <span className="min-w-0 flex-1 truncate">Favorites</span>
              {typeof favoritesCount === "number" ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                    favoritesActive
                      ? "bg-background/60 text-foreground"
                      : "bg-secondary/70 text-muted-foreground",
                  )}
                >
                  {favoritesCount}
                </span>
              ) : null}
            </button>
          ) : null}
          {tree.length === 0 ? (
            loading ? (
              <div
                className="flex flex-col items-center justify-center gap-2 px-2 py-8 text-muted-foreground"
                aria-busy="true"
                aria-label="Loading categories"
              >
                <Loader2 className="size-4 animate-spin text-primary" />
                <p className="text-[11px]">Loading…</p>
              </div>
            ) : (
              <p className="px-2 py-3 text-[11px] text-muted-foreground">
                No pack loaded
              </p>
            )
          ) : (
            tree.map((node) => (
              <TreeNodeRow
                key={node.id}
                node={node}
                active={active}
                onSelect={onSelect}
                depth={0}
                openIds={openIds}
                onToggleOpen={toggleOpen}
                showNewBadges={showNewBadges}
                ancestorIds={ancestorIds}
              />
            ))
          )}
        </nav>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={handleResizePointerDown}
        onDoubleClick={handleResizeReset}
        data-tooltip="Drag to resize · double-click to reset"
        className={cn(
          "absolute left-full top-0 z-10 h-full w-1.5 cursor-col-resize touch-none",
          "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors",
          "hover:after:bg-primary/50",
          resizing && "after:bg-primary",
        )}
      />
    </aside>
  );
}
