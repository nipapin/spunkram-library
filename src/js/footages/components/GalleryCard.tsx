import { MoreVertical } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { Blurhash } from "react-blurhash";
import { cepHostFileDragEnabled } from "@/lib/utils/cep-file-drag";
import { cn } from "@/lib/utils";
import { MediaItem } from "../types";
import { formatDuration } from "../utils/math";
import CardChip from "./CardChip";
import QualityMenu from "./QualityMenu";
import ShadowOverlay from "./ShadowOverlay";
import AutorCredential from "./AutorCredential";

const MAX_RETRIES = 2;

interface GalleryCardProps {
  item: MediaItem;
  showOrientation: boolean;
  aspect: string;
  masonry?: boolean;
  onDownload: (e: React.MouseEvent) => void;
  onImportUrl: (item: MediaItem) => void;
  onView: (e: React.MouseEvent) => void;
  onHostDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onHostDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
}

function GalleryCard({
  item,
  onDownload,
  onImportUrl,
  onView,
  onHostDragStart,
  onHostDragEnd,
  aspect = "1/1",
  masonry = false,
}: GalleryCardProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [hovered, setHovered] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const retryCount = useRef(0);
  const suppressDragRef = useRef(false);
  const suppressClickRef = useRef(false);
  const canDrag = cepHostFileDragEnabled && Boolean(onHostDragStart);
  const open = Boolean(anchorEl);
  const isVideo = item.type === "video";

  const handleImageError = useCallback(() => {
    const img = imgRef.current;
    if (!img || retryCount.current >= MAX_RETRIES) return;
    retryCount.current += 1;
    const separator = img.src.includes("?") ? "&" : "?";
    img.src = `${item.thumbnail}${separator}_cb=${Date.now()}`;
  }, [item.thumbnail]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const capture = () => {
      setImageLoaded(true);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };

    if (img.complete && img.naturalWidth > 0) {
      capture();
      return;
    }

    img.addEventListener("load", capture);
    return () => img.removeEventListener("load", capture);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hovered && isVideo && item.videoPreviewUrl) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [hovered, isVideo, item.videoPreviewUrl]);

  const handleMoreMenu = (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAnchorEl(e.currentTarget as HTMLButtonElement);
  };

  const naturalAspect = naturalSize
    ? `${naturalSize.w}/${naturalSize.h}`
    : item.width && item.height
      ? `${item.width}/${item.height}`
      : aspect;

  return (
    <div
      style={{ aspectRatio: masonry ? naturalAspect : aspect }}
      draggable={canDrag}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        const target = event.target;
        suppressDragRef.current =
          target instanceof Element && Boolean(target.closest("button"));
      }}
      onDragStart={(event) => {
        if (!canDrag || suppressDragRef.current) {
          suppressDragRef.current = false;
          event.preventDefault();
          return;
        }
        suppressClickRef.current = true;
        onHostDragStart?.(event);
      }}
      onDragEnd={(event) => {
        suppressDragRef.current = false;
        onHostDragEnd?.(event);
      }}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onView(event);
      }}
      className={cn(
        "gallery-card relative cursor-pointer overflow-hidden rounded-md",
        canDrag && "cursor-grab active:cursor-grabbing",
        masonry
          ? "mb-2 inline-block w-full break-inside-avoid"
          : "min-w-0",
      )}
    >
      {!imageLoaded && item.blurHash && (
        <div className="absolute inset-0">
          <Blurhash
            hash={item.blurHash}
            width={"100%"}
            height={"100%"}
            resolutionX={32}
            resolutionY={32}
            punch={1}
          />
        </div>
      )}
      <img
        ref={imgRef}
        src={item.thumbnail}
        alt={item.alt}
        loading="lazy"
        draggable={false}
        onError={handleImageError}
        className="block size-full object-cover"
      />
      {isVideo && item.videoPreviewUrl && (
        <video
          ref={videoRef}
          src={hovered ? item.videoPreviewUrl : undefined}
          muted
          loop
          playsInline
          draggable={false}
          className={cn(
            "pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-200",
            hovered ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      <CardChip className="left-1 top-1 flex items-center rounded-md px-1.5 py-0.5 leading-none">
        <span className="text-[8px] font-medium leading-none text-white">
          {[item.width, item.height].join("x")}
          {isVideo && item.duration != null && ` | ${formatDuration(item.duration)}`}
        </span>
      </CardChip>
      <div className="absolute right-1 top-1 flex items-start gap-1">
        <CardChip
          onClick={handleMoreMenu}
          className="relative top-auto right-auto flex aspect-square cursor-pointer rounded-md p-2"
        >
          <MoreVertical className="size-3" strokeWidth={2} />
        </CardChip>
      </div>
      <ShadowOverlay />
      <AutorCredential hovered={hovered} user={item.user} provider={item.provider} />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex w-full gap-1 p-2 transition-opacity",
          hovered || open ? "opacity-100" : "opacity-0",
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(e);
          }}
          className={cn(
            "w-full cursor-pointer rounded-xl border border-white/10 bg-card/90 px-2 py-1",
            "text-[11px] font-light text-foreground",
            "hover:border-primary/40 hover:bg-primary/20 active:scale-[0.97]",
            (hovered || open) && "backdrop-blur-md",
          )}
        >
          Import
        </button>
      </div>
      <QualityMenu
        item={item}
        anchorEl={anchorEl}
        onClose={(e) => {
          if (e && "stopPropagation" in e) e.stopPropagation();
          setAnchorEl(null);
        }}
        onImport={onImportUrl}
      />
    </div>
  );
}

export default memo(GalleryCard, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.showOrientation === next.showOrientation &&
    prev.aspect === next.aspect &&
    prev.masonry === next.masonry &&
    prev.onDownload === next.onDownload &&
    prev.onImportUrl === next.onImportUrl &&
    prev.onHostDragStart === next.onHostDragStart &&
    prev.onHostDragEnd === next.onHostDragEnd
  );
});
