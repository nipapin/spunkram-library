import { jsx as _jsx } from "react/jsx-runtime";
import { FiltersProvider, useFiltersContext } from "./FiltersContext";
import { MediaProvider, useMediaContext } from "./MediaContext";
import { ProgressProvider, useProgressContext } from "./ProgressContext";
export const AppProvider = ({ children }) => {
    return (_jsx(FiltersProvider, { children: _jsx(MediaProvider, { children: _jsx(ProgressProvider, { children: children }) }) }));
};
export const useAppContext = () => {
    return {
        ...useFiltersContext(),
        ...useMediaContext(),
        ...useProgressContext(),
    };
};
