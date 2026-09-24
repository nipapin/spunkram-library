import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import CardChip from "./CardChip";
import AutorCredential from "./AutorCredential";
import ShadowOverlay from "./ShadowOverlay";
function getHighestQualityVideoUrl(item) {
    if (!item.videoFiles?.length)
        return "";
    return item.videoFiles[item.videoFiles.length - 1].link;
}
export default function MediaPreviewDialog({ open, media, onClose, }) {
    if (!open || !media)
        return null;
    const isVideo = media.type === "video";
    return createPortal(_jsx("div", { className: "fixed inset-0 z-[1100] flex items-center justify-center bg-background/90 p-2", onClick: onClose, children: _jsxs("div", { className: "relative flex max-h-[min(92vh,calc(100%-16px))] max-w-[min(96vw,calc(100%-16px))] items-center justify-center overflow-hidden rounded-lg", onClick: (e) => e.stopPropagation(), children: [isVideo ? (_jsx("video", { src: getHighestQualityVideoUrl(media), poster: media.preview, controls: true, controlsList: "nodownload nofullscreen", autoPlay: true, className: "block h-auto max-h-[min(85vh,1200px)] w-full object-contain" })) : (_jsxs(_Fragment, { children: [_jsx(ShadowOverlay, {}), _jsx(AutorCredential, { user: media.user, provider: media.provider }), _jsx("img", { src: media.preview, alt: media.alt, className: "block h-auto max-h-[min(85vh,1200px)] w-auto max-w-full object-contain" })] })), _jsx(CardChip, { className: "right-2 top-2 z-[3] flex aspect-square cursor-pointer p-2", onClick: (e) => {
                        e.stopPropagation();
                        onClose();
                    }, children: _jsx(X, { className: "size-3", strokeWidth: 2 }) })] }) }), document.body);
}
