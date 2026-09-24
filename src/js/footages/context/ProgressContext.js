import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useRef, useState } from "react";
/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const PROGRESS_CONTEXT_KEY = "__spunkram_progress_context__";
const ProgressContext = globalThis[PROGRESS_CONTEXT_KEY] ??
    createContext(null);
globalThis[PROGRESS_CONTEXT_KEY] = ProgressContext;
export const ProgressProvider = ({ children }) => {
    const [progress, setProgress] = useState(0);
    const [pending, setPending] = useState(false);
    const [error, setErrorState] = useState(null);
    const [notice, setNoticeState] = useState(null);
    const errorTimerRef = useRef(null);
    const noticeTimerRef = useRef(null);
    const clearNoticeTimer = () => {
        if (noticeTimerRef.current) {
            clearTimeout(noticeTimerRef.current);
            noticeTimerRef.current = null;
        }
    };
    const setError = useCallback((err) => {
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
    const setNotice = useCallback((text) => {
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
    return (_jsx(ProgressContext.Provider, { value: {
            progress,
            pending,
            setProgress,
            setPending,
            error,
            setError,
            clearError,
            notice,
            setNotice,
        }, children: children }));
};
export const useProgressContext = () => {
    const context = useContext(ProgressContext);
    if (!context) {
        throw new Error("useProgressContext must be used within a ProgressProvider");
    }
    return context;
};
