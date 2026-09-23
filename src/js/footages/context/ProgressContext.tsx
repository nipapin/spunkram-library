import { createContext, useCallback, useContext, useRef, useState } from "react";

type ProgressContextType = {
  progress: number;
  setProgress: (progress: number) => void;
  pending: boolean;
  setPending: (pending: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  clearError: () => void;
  notice: string | null;
  setNotice: (notice: string | null) => void;
};

/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const PROGRESS_CONTEXT_KEY = "__spunkram_progress_context__";
type ProgressGlobal = typeof globalThis & {
  [PROGRESS_CONTEXT_KEY]?: ReturnType<typeof createContext<ProgressContextType | null>>;
};

const ProgressContext =
  (globalThis as ProgressGlobal)[PROGRESS_CONTEXT_KEY] ??
  createContext<ProgressContextType | null>(null);
(globalThis as ProgressGlobal)[PROGRESS_CONTEXT_KEY] = ProgressContext;

export const ProgressProvider = ({ children }: { children: React.ReactNode }) => {
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const [notice, setNoticeState] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNoticeTimer = () => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  };

  const setError = useCallback((err: string | null) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    if (err) {
      clearNoticeTimer();
      setNoticeState(null);
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

  const setNotice = useCallback((text: string | null) => {
    clearNoticeTimer();
    if (text) {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      setErrorState(null);
    }
    setNoticeState(text);
    if (text) {
      noticeTimerRef.current = setTimeout(() => {
        setNoticeState(null);
        noticeTimerRef.current = null;
      }, 5000);
    }
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
        notice,
        setNotice,
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
