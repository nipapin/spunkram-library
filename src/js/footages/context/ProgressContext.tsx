import { createContext, useCallback, useContext, useRef, useState } from "react";

type ProgressContextType = {
  progress: number;
  setProgress: (progress: number) => void;
  pending: boolean;
  setPending: (pending: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  clearError: () => void;
};

const ProgressContext = createContext<ProgressContextType | null>(null);

export const ProgressProvider = ({ children }: { children: React.ReactNode }) => {
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setError = useCallback((err: string | null) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setErrorState(err);
    if (err) {
      errorTimerRef.current = setTimeout(() => {
        setErrorState(null);
        errorTimerRef.current = null;
      }, 6000);
    }
  }, []);

  const clearError = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setErrorState(null);
  }, []);

  return (
    <ProgressContext.Provider
      value={{
        progress,
        pending,
        setProgress,
        setPending,
        error,
        setError,
        clearError,
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
