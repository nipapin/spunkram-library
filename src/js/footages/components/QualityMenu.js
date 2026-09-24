import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatFileSize, getWidthFromQuality } from "../utils/math";
import GlassMenu, { GlassMenuItem } from "./GlassMenu";
const imageQualityOptions = ["full", "regular", "small", "thumb"];
const imageQualityLabels = {
    full: "Full",
    regular: "Regular",
    small: "Small",
    thumb: "Thumb",
};
function getExtension(name, fallback) {
    const idx = name.lastIndexOf(".");
    return idx !== -1 ? name.substring(idx) : fallback;
}
export default function QualityMenu({ item, anchorEl, onClose, onImport, }) {
    const open = Boolean(anchorEl);
    const handleImageQualitySelect = (quality) => {
        const ext = getExtension(item.name, ".jpg");
        // Pass quality to download proxy for correct resolution selection.
        onImport({ ...item, name: `${item.id}_${quality}${ext}`, quality });
        onClose();
    };
    const handleVideoQualitySelect = (file) => {
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
    return (_jsx(GlassMenu, { open: open, anchorEl: anchorEl, onClose: onClose, children: item.type === "image"
            ? renderImageOptions(item, handleImageQualitySelect)
            : renderVideoOptions(item, handleVideoQualitySelect) }));
}
function renderImageOptions(item, onSelect) {
    if (!item.imageUrls) {
        return (_jsx(GlassMenuItem, { onClick: () => onSelect("full"), children: _jsx("span", { children: "Import" }) }));
    }
    const urls = item.imageUrls;
    return imageQualityOptions.map((quality) => {
        const width = getWidthFromQuality(urls[quality]) || item.width;
        const ratio = width / item.width;
        const height = Math.round(item.height * ratio);
        return (_jsxs(GlassMenuItem, { onClick: () => onSelect(quality), children: [_jsx("span", { children: imageQualityLabels[quality] }), _jsxs("span", { className: "ml-1.5 text-muted-foreground", children: ["[", width, "x", height, "]"] })] }, quality));
    });
}
function renderVideoOptions(item, onSelect) {
    if (!item.videoFiles?.length) {
        return (_jsx(GlassMenuItem, { onClick: () => onSelect({
                id: 0,
                width: item.width,
                height: item.height,
                fps: 0,
                link: item.downloadUrl || "",
                size: 0,
            }), children: _jsx("span", { children: "Import" }) }));
    }
    return [...item.videoFiles].reverse().map((file) => (_jsxs(GlassMenuItem, { onClick: () => onSelect(file), children: [_jsxs("span", { children: [file.width, "x", file.height] }), _jsxs("span", { className: "ml-1.5 text-muted-foreground", children: [file.fps ? `${file.fps}fps · ` : "", formatFileSize(file.size)] })] }, file.id || `${file.width}x${file.height}`)));
}
