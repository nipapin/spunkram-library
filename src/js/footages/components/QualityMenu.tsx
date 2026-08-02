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
  onImport: (
    url: string,
    fileName: string,
    duration: number,
    downloadLocation: string,
  ) => void;
}

export default function QualityMenu({
  item,
  anchorEl,
  onClose,
  onImport,
}: QualityMenuProps) {
  const open = Boolean(anchorEl);

  const handleImageQualitySelect = (quality: ImageQuality, url: string) => {
    const ext = getExtension(item.name, ".jpg");
    onImport(
      url,
      `${item.id}_${quality}${ext}`,
      5,
      item.links?.download_location ?? "",
    );
    onClose();
  };

  const handleVideoQualitySelect = (file: VideoFile) => {
    const ext = getExtension(item.name, ".mp4");
    onImport(
      file.link,
      `${item.id}_${file.width}x${file.height}${ext}`,
      item.duration ?? 0,
      item.links?.download_location ?? "",
    );
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
  onSelect: (quality: ImageQuality, url: string) => void,
) {
  if (!item.imageUrls) return null;
  const urls = item.imageUrls as ImageUrls;
  return imageQualityOptions.map((quality) => {
    const width = getWidthFromQuality(urls[quality]) || item.width;
    const ratio = width / item.width;
    const height = Math.round(item.height * ratio);
    return (
      <GlassMenuItem key={quality} onClick={() => onSelect(quality, urls[quality])}>
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
  if (!item.videoFiles) return null;
  return [...item.videoFiles].reverse().map((file) => (
    <GlassMenuItem key={file.id} onClick={() => onSelect(file)}>
      <span>
        {file.width}x{file.height}
      </span>
      <span className="ml-1.5 text-muted-foreground">
        {file.fps}fps · {formatFileSize(file.size)}
      </span>
    </GlassMenuItem>
  ));
}
