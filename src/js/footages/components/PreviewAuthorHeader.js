import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { hasAuthorDetails } from "../utils/mediaAuthor";
export default function PreviewAuthorHeader({ user }) {
    if (!hasAuthorDetails(user))
        return null;
    return (_jsxs("p", { className: "absolute bottom-2 left-2 text-[10px] font-normal text-foreground", children: [_jsx("span", { className: "text-[8px] font-extralight text-muted-foreground", children: "Photo by" }), _jsx("br", {}), _jsx("span", { className: "cursor-pointer text-[9px] underline", children: user.name }), " on ", _jsx("span", { className: "cursor-pointer text-[9px] underline", children: "Unsplash" })] }));
}
