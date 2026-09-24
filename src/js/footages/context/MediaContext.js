import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from "react";
/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const MEDIA_CONTEXT_KEY = "__spunkram_media_context__";
const MediaContext = globalThis[MEDIA_CONTEXT_KEY] ??
    createContext(null);
globalThis[MEDIA_CONTEXT_KEY] = MediaContext;
export const MediaProvider = ({ children }) => {
    const [media, setMedia] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    return (_jsx(MediaContext.Provider, { value: {
            media, setMedia,
            page, setPage,
            totalPages, setTotalPages,
            loading, setLoading,
        }, children: children }));
};
export const useMediaContext = () => {
    const context = useContext(MediaContext);
    if (!context) {
        throw new Error("useMediaContext must be used within a MediaProvider");
    }
    return context;
};
