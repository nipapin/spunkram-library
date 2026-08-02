import { createContext, useContext, useState } from "react";

type ProgressContextType = {
  progress: number;
  setProgress: (progress: number) => void;
  pending: boolean;
  setPending: (pending: boolean) => void;
};

const ProgressContext = createContext<ProgressContextType | null>(null);

export const ProgressProvider = ({ children }: { children: React.ReactNode }) => {
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(false);

  return (
    <ProgressContext.Provider
      value={{
        progress,
        pending,
        setProgress,
        setPending,
      }}
    >
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgressContext = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error("useProgressContext must be used within a ProgressProvider");
  }
  return context;
};
