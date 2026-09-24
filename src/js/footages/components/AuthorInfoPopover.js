import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { csi } from "../../lib/utils/bolt";
import { cn } from "@/lib/utils";
export { hasAuthorDetails } from "../utils/mediaAuthor";
function openProfileUrl(url) {
    csi.openURLInDefaultBrowser(url);
}
export default function AuthorInfoPopover({ user, anchorEl, onClose, }) {
    const open = Boolean(anchorEl);
    const panelRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const name = user.name?.trim() ?? "";
    const profileUrl = user.url?.trim() ?? "";
    const hasName = Boolean(name);
    const hasUsername = Boolean(user.username);
    const avatarOpensProfile = !hasName && Boolean(profileUrl) && Boolean(user.avatarUrl);
    const showProfileFallbackLink = !hasName && Boolean(profileUrl) && !user.avatarUrl && !hasUsername;
    const showNickAsProfileLink = !hasName && hasUsername && Boolean(profileUrl) && !user.avatarUrl;
    const showPlainNickname = hasUsername &&
        !showNickAsProfileLink &&
        (hasName || !profileUrl || Boolean(user.avatarUrl));
    useLayoutEffect(() => {
        if (!open || !anchorEl)
            return;
        const rect = anchorEl.getBoundingClientRect();
        const width = panelRef.current?.offsetWidth ?? 220;
        setPos({
            top: rect.bottom + 4,
            left: Math.max(8, rect.right - width),
        });
    }, [open, anchorEl]);
    useEffect(() => {
        if (!open)
            return;
        const onPointerDown = (e) => {
            const target = e.target;
            if (panelRef.current?.contains(target) || anchorEl?.contains(target))
                return;
            onClose();
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [open, anchorEl, onClose]);
    const handleOpenProfile = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (profileUrl)
            openProfileUrl(profileUrl);
    };
    if (!open)
        return null;
    return createPortal(_jsx("div", { ref: panelRef, className: "fixed z-[1000] max-w-[280px] rounded-lg border border-white/10 bg-popover p-3 text-popover-foreground shadow-lg shadow-black/40", style: { top: pos.top, left: pos.left }, onClick: (e) => e.stopPropagation(), children: _jsxs("div", { className: "flex items-start gap-2", children: [user.avatarUrl ? (_jsx("button", { type: "button", onClick: avatarOpensProfile ? handleOpenProfile : undefined, className: cn("size-10 shrink-0 overflow-hidden rounded-full border border-white/10", avatarOpensProfile && "cursor-pointer hover:opacity-90"), children: _jsx("img", { src: user.avatarUrl, alt: "", className: "size-full object-cover" }) })) : null, _jsxs("div", { className: "min-w-0 flex-1", children: [hasName ? (profileUrl ? (_jsx("button", { type: "button", onClick: handleOpenProfile, className: "block text-xs font-bold text-foreground hover:opacity-90", children: name })) : (_jsx("span", { className: "block text-xs font-bold text-foreground", children: name }))) : null, showNickAsProfileLink ? (_jsxs("button", { type: "button", onClick: handleOpenProfile, className: "block text-xs font-semibold text-muted-foreground hover:text-foreground", children: ["@", user.username] })) : null, showPlainNickname ? (_jsxs("span", { className: cn("block text-[10px] font-medium text-muted-foreground", (hasName || (user.avatarUrl && profileUrl)) && "mt-0.5"), children: ["@", user.username] })) : null, showProfileFallbackLink ? (_jsx("button", { type: "button", onClick: handleOpenProfile, className: "block text-xs font-bold text-foreground hover:opacity-90", children: "Profile" })) : null] })] }) }), document.body);
}
