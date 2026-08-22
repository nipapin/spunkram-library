import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { MediaItem } from "../types";
import CardChip from "./CardChip";
import AutorCredential from "./AutorCredential";
import ShadowOverlay from "./ShadowOverlay";

interface MediaPreviewDialogProps {
  open: boolean;
  media: MediaItem | null;
  onClose: () => void;
}

function getHighestQualityVideoUrl(item: MediaItem): string {
  if (!item.videoFiles?.length) return "";
  return item.videoFiles[item.videoFiles.length - 1].link;
}

export default function MediaPreviewDialog({
  open,
  media,
  onClose,
}: MediaPreviewDialogProps) {
  if (!open || !media) return null;

  const isVideo = media.type === "video";

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-background/90 p-2"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[min(92vh,calc(100%-16px))] max-w-[min(96vw,calc(100%-16px))] items-center justify-center overflow-hidden rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={getHighestQualityVideoUrl(media)}
            poster={media.preview}
            controls
            controlsList="nodownload nofullscreen"
            autoPlay
            className="block h-auto max-h-[min(85vh,1200px)] w-full object-contain"
          />
        ) : (
          <>
            <ShadowOverlay />
            <AutorCredential user={media.user} provider={media.provider} />
            <img
              src={media.preview}
              alt={media.alt}
              className="block h-auto max-h-[min(85vh,1200px)] w-auto max-w-full object-contain"
            />
          </>
        )}

        <CardChip
          className="right-2 top-2 z-[3] flex aspect-square cursor-pointer p-2"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="size-3" strokeWidth={2} />
        </CardChip>
      </div>
    </div>,
    document.body,
  );
}
