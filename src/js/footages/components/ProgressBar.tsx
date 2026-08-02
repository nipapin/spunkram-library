import { createPortal } from "react-dom";
import { useProgressContext } from "../context/ProgressContext";

export default function ProgressBar() {
  const { progress, pending, setPending } = useProgressContext();

  if (!pending) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex flex-col items-center justify-center bg-background/70 px-12 backdrop-blur-[10px]"
      onClick={() => setPending(false)}
    >
      <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-xs font-light text-foreground">Downloading...</p>
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
