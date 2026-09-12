import { resolvePreviewAspectRatio, type PackContentSection } from "./pack-tree";

export const GRID_GAP_PX = 4;
export const SECTION_GAP_PX = 16;
/** Sticky Gal title: min-height 44px + margin-bottom 6px. */
export const STICKY_TITLE_HEIGHT_PX = 50;
/** Non-sticky h3 (~11px line + mb-1.5). */
export const PLAIN_TITLE_HEIGHT_PX = 24;
/** `.gal-footage-section .grid { padding: 0 8px }` */
export const GAL_GRID_PAD_X_PX = 8;
/** Extra space above/below the viewport so fast CEP flicks don't hole-punch. */
export const WINDOW_BUFFER_PX = 600;

export type GridWindowMetrics = {
  columns: number;
  width: number;
  gap: number;
  sectionGap: number;
  titleHeight: number;
  gridPadX: number;
};

export type SectionLayout = {
  id: string;
  top: number;
  height: number;
  titleHeight: number;
  rowHeight: number;
  stride: number;
  rows: number;
  itemCount: number;
};

export type GridLayout = {
  totalHeight: number;
  columns: number;
  gap: number;
  sections: SectionLayout[];
};

export type SectionWindow = {
  sectionIndex: number;
  startRow: number;
  endRow: number;
  padTop: number;
  padBottom: number;
};

export function parseAspectRatio(aspect: string): number {
  const parts = aspect.split("/").map((part) => Number(part.trim()));
  const w = parts[0];
  const h = parts[1];
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h)) return 16 / 9;
  return w / h;
}

export function cardWidthPx(metrics: GridWindowMetrics): number {
  const cols = Math.max(1, metrics.columns);
  const inner = Math.max(0, metrics.width - metrics.gridPadX * 2);
  return Math.max(1, (inner - metrics.gap * (cols - 1)) / cols);
}

export function layoutGridSections(
  sections: PackContentSection[],
  metrics: GridWindowMetrics,
): GridLayout {
  const cols = Math.max(1, metrics.columns);
  const cardWidth = cardWidthPx(metrics);
  const out: SectionLayout[] = [];
  let top = 0;

  for (const section of sections) {
    const itemCount = section.items.length;
    if (itemCount === 0) continue;
    const titleHeight = section.title ? metrics.titleHeight : 0;
    const aspect = parseAspectRatio(
      resolvePreviewAspectRatio(section.items[0].group),
    );
    const rowHeight = cardWidth / Math.max(0.01, aspect);
    const stride = rowHeight + metrics.gap;
    const rows = Math.ceil(itemCount / cols);
    const gridHeight =
      rows === 0 ? 0 : rows * rowHeight + Math.max(0, rows - 1) * metrics.gap;
    const height = titleHeight + gridHeight;
    out.push({
      id: section.id,
      top,
      height,
      titleHeight,
      rowHeight,
      stride,
      rows,
      itemCount,
    });
    top += height + metrics.sectionGap;
  }

  return {
    totalHeight: out.length === 0 ? 0 : top - metrics.sectionGap,
    columns: cols,
    gap: metrics.gap,
    sections: out,
  };
}

/** Inclusive startRow, exclusive endRow. Empty when the section is outside the window. */
export function visibleRowsForSection(
  layout: SectionLayout,
  viewTop: number,
  viewBottom: number,
): { startRow: number; endRow: number } {
  const gridTop = layout.top + layout.titleHeight;
  const gridBottom = layout.top + layout.height;
  if (layout.rows === 0 || viewBottom <= gridTop || viewTop >= gridBottom) {
    return { startRow: 0, endRow: 0 };
  }
  const stride = Math.max(1, layout.stride);
  const startRow = Math.max(0, Math.floor((viewTop - gridTop) / stride));
  const endRow = Math.min(
    layout.rows,
    Math.max(startRow + 1, Math.ceil((viewBottom - gridTop) / stride)),
  );
  return { startRow, endRow };
}

export function windowGridSections(
  layout: GridLayout,
  scrollTop: number,
  viewportHeight: number,
  bufferPx = WINDOW_BUFFER_PX,
): SectionWindow[] {
  const viewTop = scrollTop - bufferPx;
  const viewBottom = scrollTop + Math.max(1, viewportHeight) + bufferPx;
  return layout.sections.map((section, sectionIndex) => {
    const { startRow, endRow } = visibleRowsForSection(
      section,
      viewTop,
      viewBottom,
    );
    return {
      sectionIndex,
      startRow,
      endRow,
      padTop: startRow * section.stride,
      padBottom: Math.max(0, section.rows - endRow) * section.stride,
    };
  });
}

export function mountedCardCount(
  layout: GridLayout,
  windows: SectionWindow[],
): number {
  const cols = Math.max(1, layout.columns);
  let count = 0;
  for (const win of windows) {
    const section = layout.sections[win.sectionIndex];
    if (!section || win.endRow <= win.startRow) continue;
    const start = win.startRow * cols;
    const end = Math.min(section.itemCount, win.endRow * cols);
    count += Math.max(0, end - start);
  }
  return count;
}

export function windowRangeKey(windows: SectionWindow[]): string {
  let key = "";
  for (const win of windows) {
    if (win.endRow <= win.startRow) continue;
    key += `${win.sectionIndex}:${win.startRow}-${win.endRow};`;
  }
  return key;
}
