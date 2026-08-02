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

const FiltersContext = createContext<FiltersContextType | null>(null);

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
