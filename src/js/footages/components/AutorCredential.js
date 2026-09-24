import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { csi } from "../../lib/utils/bolt";
import { cn } from "@/lib/utils";
import { BRAND } from "@brands";
const utm = `?utm_source=${encodeURIComponent(BRAND.displayName)}&utm_medium=referral`;
export default function AutorCredential({ hovered, user, provider = "unsplash" }) {
    const providerName = provider === "pexels" ? "Pexels" : "Unsplash";
    const providerUrl = provider === "pexels" ? "https://pexels.com" : "https://unsplash.com";
    const mediaLabel = provider === "pexels" ? "Video by" : "Photo by";
    const handleOpenProfile = (e) => {
        e.stopPropagation();
        csi.openURLInDefaultBrowser(`${user.url}${utm}`);
    };
    const handleOpenProvider = (e) => {
        e.stopPropagation();
        csi.openURLInDefaultBrowser(`${providerUrl}${utm}`);
    };
    return (_jsxs("p", { className: cn("absolute bottom-2 left-2 text-[10px] font-normal text-foreground transition-transform", hovered && "-translate-y-[30px]"), children: [_jsx("span", { className: "text-[8px] font-extralight text-muted-foreground", children: mediaLabel }), _jsx("br", {}), _jsx("button", { type: "button", onClick: handleOpenProfile, className: "cursor-pointer text-[9px] underline", children: user.name }), " on ", _jsx("button", { type: "button", onClick: handleOpenProvider, className: "cursor-pointer text-[9px] underline", children: providerName })] }));
}
