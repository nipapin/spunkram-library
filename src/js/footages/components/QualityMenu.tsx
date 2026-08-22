import { ImageUrls, MediaItem, VideoFile } from "../types";
import { formatFileSize, getWidthFromQuality } from "../utils/math";
import GlassMenu, { GlassMenuItem } from "./GlassMenu";

type ImageQuality = "full" | "regular" | "small" | "thumb";

const imageQualityOptions: ImageQuality[] = ["full", "regular", "small", "thumb"];
const imageQualityLabels: Record<ImageQuality, string> = {
  full: "Full",
  regular: "Regular",
  small: "Small",
  thumb: "Thumb",
};

function getExtension(name: string, fallback: string): string {
  const idx = name.lastIndexOf(".");
  return idx !== -1 ? name.substring(idx) : fallback;
}

interface QualityMenuProps {
  item: MediaItem;
  anchorEl: HTMLElement | null;
  onClose: (e?: React.MouseEvent | KeyboardEvent) => void;
  /** Stock download goes through Motionflow proxy (provider + id). */
  onImport: (item: MediaItem) => void;
}

export default function QualityMenu({
  item,
  anchorEl,
  onClose,
  onImport,
}: QualityMenuProps) {
  const open = Boolean(anchorEl);

  const handleImageQualitySelect = (quality: ImageQuality) => {
    const ext = getExtension(item.name, ".jpg");
    // Pass quality to download proxy for correct resolution selection.
    onImport({ ...item, name: `${item.id}_${quality}${ext}`, quality });
    onClose();
  };

  const handleVideoQualitySelect = (file: VideoFile) => {
    const ext = getExtension(item.name, ".mp4");
    const resolution = `${file.width}x${file.height}`;
    // Pass resolution to download proxy for correct quality selection.
    onImport({
      ...item,
      name: `${item.id}_${resolution}${ext}`,
      resolution,
    });
    onClose();
  };

  return (
    <GlassMenu open={open} anchorEl={anchorEl} onClose={onClose}>
      {item.type === "image"
        ? renderImageOptions(item, handleImageQualitySelect)
        : renderVideoOptions(item, handleVideoQualitySelect)}
    </GlassMenu>
  );
}

function renderImageOptions(
  item: MediaItem,
  onSelect: (quality: ImageQuality) => void,
) {
  if (!item.imageUrls) {
    return (
      <GlassMenuItem onClick={() => onSelect("full")}>
        <span>Import</span>
      </GlassMenuItem>
    );
  }
  const urls = item.imageUrls as ImageUrls;
  return imageQualityOptions.map((quality) => {
    const width = getWidthFromQuality(urls[quality]) || item.width;
    const ratio = width / item.width;
    const height = Math.round(item.height * ratio);
    return (
      <GlassMenuItem key={quality} onClick={() => onSelect(quality)}>
        <span>{imageQualityLabels[quality]}</span>
        <span className="ml-1.5 text-muted-foreground">
          [{width}x{height}]
        </span>
      </GlassMenuItem>
    );
  });
}

function renderVideoOptions(
  item: MediaItem,
  onSelect: (file: VideoFile) => void,
) {
  if (!item.videoFiles?.length) {
    return (
      <GlassMenuItem onClick={() => onSelect({
        id: 0,
        width: item.width,
        height: item.height,
        fps: 0,
        link: item.downloadUrl || "",
        size: 0,
      })}>
        <span>Import</span>
      </GlassMenuItem>
    );
  }
  return [...item.videoFiles].reverse().map((file) => (
    <GlassMenuItem key={file.id || `${file.width}x${file.height}`} onClick={() => onSelect(file)}>
      <span>
        {file.width}x{file.height}
      </span>
      <span className="ml-1.5 text-muted-foreground">
        {file.fps ? `${file.fps}fps · ` : ""}
        {formatFileSize(file.size)}
      </span>
    </GlassMenuItem>
  ));
}
