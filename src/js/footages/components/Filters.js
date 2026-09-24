import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useFiltersContext } from "../context/FiltersContext";
import { useDebounce } from "../hooks/useDebounce";
import DestinationFilter from "./DestinationFilter";
import OrientationFilter from "./OrientationFilter";
import SearchInput from "./SearchInput";
import TypeFilter from "./TypeFilter";
export default function Filters() {
    const { setSearch } = useFiltersContext();
    const [inputValue, setInputValue] = useState("");
    useDebounce(() => setSearch(inputValue.trim()), 500, [inputValue]);
    const handleSearchChange = (e) => {
        setInputValue(e.target.value);
    };
    return (_jsxs("div", { className: "mx-2.5 mt-2 flex shrink-0 items-center gap-3 rounded-2xl px-2.5 py-2 glass-bar", children: [_jsx(TypeFilter, {}), _jsx(DestinationFilter, {}), _jsx(OrientationFilter, {}), _jsx("div", { className: "ml-auto", children: _jsx(SearchInput, { placeholder: "Find footage", value: inputValue, onChange: handleSearchChange }) })] }));
}
