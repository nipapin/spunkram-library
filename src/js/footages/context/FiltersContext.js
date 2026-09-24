import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from "react";
/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const FILTERS_CONTEXT_KEY = "__spunkram_filters_context__";
const FiltersContext = globalThis[FILTERS_CONTEXT_KEY] ??
    createContext(null);
globalThis[FILTERS_CONTEXT_KEY] = FiltersContext;
export const FiltersProvider = ({ children }) => {
    const [type, setType] = useState("image");
    const [destination, setDestination] = useState("timeline");
    const [orientation, setOrientation] = useState("");
    const [search, setSearch] = useState("");
    return (_jsx(FiltersContext.Provider, { value: {
            type, setType,
            destination, setDestination,
            orientation, setOrientation,
            search, setSearch,
        }, children: children }));
};
export const useFiltersContext = () => {
    const context = useContext(FiltersContext);
    if (!context) {
        throw new Error("useFiltersContext must be used within a FiltersProvider");
    }
    return context;
};
