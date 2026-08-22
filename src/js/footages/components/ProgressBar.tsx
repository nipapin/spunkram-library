import { XCircle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useProgressContext } from "../context/ProgressContext";

export default function ProgressBar() {
  const { progress, pending, setPending, error, clearError } = useProgressContext();

  if (!pending && !error) return null;

  if (error) {
    return createPortal(
      <div className="pointer-events-none fixed bottom-3 left-1/2 z-[1100] flex w-[min(100%-1.25rem,360px)] -translate-x-1/2 items-start gap-2 rounded-xl border border-rose-400/35 bg-[#1a1014]/95 px-3 py-2.5 text-[12px] font-medium leading-snug shadow-xl backdrop-blur-md text-rose-100">
        <XCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
        <span className="min-w-0 flex-1 pt-px">{error}</span>
        <button
          type="button"
          aria-label="Dismiss"
          className="pointer-events-auto mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white"
          onClick={clearError}
        >
          <X className="size-3.5" strokeWidth={2.5} />
        </button>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex flex-col items-center justify-center bg-background/70 px-12 backdrop-blur-[10px]"
      onClick={() => setPending(false)}
    >
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-xs font-light text-foreground">
          {progress >= 100 ? "Importing into After Effects…" : "Downloading..."}
        </p>
        <div className="h-1 w-full overflow-hidden rounded bg-secondary">
          {progress > 0 ? (
            <div
              className="h-full rounded bg-primary transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          ) : (
            <div className="h-full w-1/3 animate-pulse rounded bg-primary/60" />
          )}
        </div>
        {progress > 0 && (
          <p className="mt-1 text-right text-[10px] font-medium text-muted-foreground">
            {progress}%
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
