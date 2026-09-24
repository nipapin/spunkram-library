import { useEffect, useRef } from "react";
export function useDebounce(callback, delay, deps) {
    const timerRef = useRef(null);
    useEffect(() => {
        timerRef.current = setTimeout(callback, delay);
        return () => {
            if (timerRef.current)
                clearTimeout(timerRef.current);
        };
    }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
