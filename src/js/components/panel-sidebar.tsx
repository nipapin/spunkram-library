import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Folder, Layers, Film, Music, Package, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePanelUI } from "@/lib/panel-ui-context";
import type { PackTreeIcon, PackTreeNode } from "@/lib/utils/pack-types";

const SIDEBAR_WIDTH_KEY = "spunkram.sidebarWidth";
const SIDEBAR_MIN_WIDTH = 140;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 192;

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function loadSidebarWidth(): number {
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(stored) && stored > 0) return clampSidebarWidth(stored);
  } catch {
    // ignore storage errors
  }
  return SIDEBAR_DEFAULT_WIDTH;
}

function TreeIcon({ icon, active }: { icon: PackTreeIcon; active?: boolean }) {
  const className = cn(
    "size-3.5 shrink-0",
    active ? "text-primary" : "text-muted-foreground",
  );
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
}: {
  node: PackTreeNode;
  active: string;
  onSelect: (id: string) => void;
  depth: number;
  openIds: Set<string>;
  onToggleOpen: (id: string) => void;
  showNewBadges: boolean;
}) {
  const isFolder = node.kind === "folder";
  const isActive = active === node.id;
  const open = isFolder && openIds.has(node.id);

  return (
    <div>
      <div
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-lg py-1.5 text-left text-xs transition-colors",
          isActive
            ? "bg-primary/10 font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        style={{ paddingLeft: 8 + depth * 10, paddingRight: 8 }}
      >
        {isFolder ? (
          <button
            type="button"
            onClick={() => onToggleOpen(node.id)}
            className="flex size-3 shrink-0 items-center justify-center"
            aria-label={open ? "Collapse" : "Expand"}
            aria-expanded={open}
          >
            <ChevronRight
              className={cn(
                "size-3 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          aria-pressed={isActive}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <TreeIcon icon={node.icon} active={isActive} />
          <span className="min-w-0 flex-1 truncate">{node.label}</span>
          {showNewBadges && node.newCount > 0 && (
            <span className="rounded px-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
              NEW
            </span>
          )}
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
      </div>

      {isFolder && open && (
        <div>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PanelSidebar({
  tree,
  active,
  onSelect,
  packName,
  orientation = "vertical",
}: {
  tree: PackTreeNode[];
  active: string;
  onSelect: (id: string) => void;
  /** Display name of the currently loaded pack (shown above the tree). */
  packName?: string;
  orientation?: "vertical" | "horizontal";
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [width, setWidth] = useState(loadSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const { showNewBadges } = usePanelUI();

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
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
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
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(SIDEBAR_DEFAULT_WIDTH));
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
      <nav className="flex flex-wrap items-center gap-1.5 border-b border-white/5 px-2.5 py-2">
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
                  ? "border-primary/50 bg-primary/20 font-semibold text-foreground"
                  : "border-white/10 bg-card/50 text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
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

  return (
    <aside
      className="relative flex shrink-0 border-r border-white/5"
      style={{ width }}
    >
      <nav className="min-w-0 flex-1 overflow-y-auto flex flex-col gap-0.5 px-1 py-2">
        {packName ? (
          <div
            className="mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-foreground"
            title={packName}
          >
            <Package className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">{packName}</span>
          </div>
        ) : null}
        {tree.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-muted-foreground">
            No pack loaded
          </p>
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
            />
          ))
        )}
      </nav>
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
