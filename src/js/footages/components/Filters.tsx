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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-white/5 bg-background px-2.5 py-2">
      <TypeFilter />
      <DestinationFilter />
      <OrientationFilter />
      <div className="ml-auto">
        <SearchInput
          placeholder="Find footage"
          value={inputValue}
          onChange={handleSearchChange}
        />
      </div>
    </div>
  );
}
