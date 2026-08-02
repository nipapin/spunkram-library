import { useEffect, useRef } from "react";

export function useDebounce(callback: () => void, delay: number, deps: unknown[]) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(callback, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
