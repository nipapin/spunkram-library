import { useCallback, useEffect, useRef, useState } from "react";
import { useFiltersContext } from "../context/FiltersContext";
import { useMediaContext } from "../context/MediaContext";
import { MediaItem } from "../types";
import {
  getAspectFromOrientation,
  getColumnsFromOrientation,
} from "../utils/math";
import GalleryCard from "./GalleryCard";
import MediaPreviewDialog from "./MediaPreviewDialog";
import SkeletonGrid from "./SkeletonGrid";
import { useImportMedia } from "../hooks/useImportMedia";

export default function Gallery() {
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const { orientation } = useFiltersContext();
  const { media, page, setPage, totalPages, loading } = useMediaContext();
  const { importMedia } = useImportMedia();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const MAX_PAGES = 10;
  const hasMore = page < totalPages && page < MAX_PAGES;
  const columns = getColumnsFromOrientation(orientation);
  const aspect = getAspectFromOrientation(orientation);
  const showOrientation = orientation === "";
  const masonry = orientation === "";
  const masonryColumns = 3;

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !loading) {
        setPage((prev) => prev + 1);
      }
    },
    [hasMore, loading, setPage],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: scrollContainerRef.current,
      rootMargin: "200px",
      threshold: 0,
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleObserver]);

  const handleImport = (item: MediaItem) => {
    void importMedia(item);
  };

  if (media.length === 0 && !loading) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="gallery-container min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        {masonry ? (
          <div
            className="gap-2 p-2"
            style={{ columnCount: masonryColumns, columnGap: "8px" }}
          >
            {media.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                showOrientation={showOrientation}
                aspect={aspect}
                masonry
                onDownload={() => handleImport(item)}
                onImportUrl={importMedia}
                onView={() => setSelectedMedia(item)}
              />
            ))}
          </div>
        ) : (
          <div
            className="grid gap-2 p-2"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {media.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                showOrientation={showOrientation}
                aspect={aspect}
                onDownload={() => handleImport(item)}
                onImportUrl={importMedia}
                onView={() => setSelectedMedia(item)}
              />
            ))}
          </div>
        )}
        {loading && (
          <SkeletonGrid
            columns={masonry ? masonryColumns : columns}
            aspect={aspect}
            masonry={masonry}
          />
        )}
        {hasMore && <div ref={sentinelRef} className="h-px" />}
      </div>

      <MediaPreviewDialog
        open={!!selectedMedia}
        media={selectedMedia}
        onClose={() => setSelectedMedia(null)}
      />
    </div>
  );
}
