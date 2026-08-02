import { CircleAlert } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message = "Failed to load media",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
      <CircleAlert className="size-10 opacity-60" strokeWidth={1.5} />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-white/10 bg-secondary/60 px-3 py-1 text-xs text-foreground hover:bg-secondary"
        >
          Retry
        </button>
      )}
    </div>
  );
}
