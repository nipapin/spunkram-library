import { FiltersProvider, useFiltersContext } from "./FiltersContext";
import { MediaProvider, useMediaContext } from "./MediaContext";
import { ProgressProvider, useProgressContext } from "./ProgressContext";

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <FiltersProvider>
      <MediaProvider>
        <ProgressProvider>{children}</ProgressProvider>
      </MediaProvider>
    </FiltersProvider>
  );
};

export const useAppContext = () => {
  return {
    ...useFiltersContext(),
    ...useMediaContext(),
    ...useProgressContext(),
  };
};
