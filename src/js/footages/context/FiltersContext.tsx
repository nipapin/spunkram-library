import { createContext, useContext, useState } from "react";
import { MediaType } from "../types";

type FiltersContextType = {
  type: MediaType;
  setType: (type: MediaType) => void;
  destination: string;
  setDestination: (destination: string) => void;
  orientation: string;
  setOrientation: (orientation: string) => void;
  search: string;
  setSearch: (search: string) => void;
};

/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const FILTERS_CONTEXT_KEY = "__spunkram_filters_context__";
type FiltersGlobal = typeof globalThis & {
  [FILTERS_CONTEXT_KEY]?: ReturnType<typeof createContext<FiltersContextType | null>>;
};

const FiltersContext =
  (globalThis as FiltersGlobal)[FILTERS_CONTEXT_KEY] ??
  createContext<FiltersContextType | null>(null);
(globalThis as FiltersGlobal)[FILTERS_CONTEXT_KEY] = FiltersContext;

export const FiltersProvider = ({ children }: { children: React.ReactNode }) => {
  const [type, setType] = useState<MediaType>("image");
  const [destination, setDestination] = useState("timeline");
  const [orientation, setOrientation] = useState("");
  const [search, setSearch] = useState("");

  return (
    <FiltersContext.Provider
      value={{
        type, setType,
        destination, setDestination,
        orientation, setOrientation,
        search, setSearch,
      }}
    >
      {children}
    </FiltersContext.Provider>
  );
};

export const useFiltersContext = () => {
  const context = useContext(FiltersContext);
  if (!context) {
    throw new Error("useFiltersContext must be used within a FiltersProvider");
  }
  return context;
};
