import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import ErrorState from "./components/ErrorState";
import Filters from "./components/Filters";
import Gallery from "./components/Gallery";
import Preload from "./components/Preload";
import ProgressBar from "./components/ProgressBar";
import { useFiltersContext } from "./context/FiltersContext";
import { useMediaContext } from "./context/MediaContext";
import "./global.css";
import { useMediaLoader } from "./hooks/useMediaLoader";
export const App = () => {
    const { type } = useFiltersContext();
    const { media, page, loading } = useMediaContext();
    const { didInitialLoad, error, retry } = useMediaLoader(type);
    const showPreload = (!didInitialLoad || loading || media.length === 0) && page === 1 && !error;
    return (_jsxs("div", { className: "flex h-full w-full flex-col overflow-hidden text-foreground", children: [_jsx(Filters, {}), _jsx(ProgressBar, {}), error && media.length === 0 ? (_jsx(ErrorState, { onRetry: retry })) : showPreload ? (_jsx(Preload, {})) : (_jsx(Gallery, {}))] }));
};
