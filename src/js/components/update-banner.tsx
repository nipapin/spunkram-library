import { Download, Loader2, X } from "lucide-react";

type Props = {
  version: string;
  busy: boolean;
  progressLabel?: string;
  error?: string | null;
  onUpdate: () => void;
  onDismiss: () => void;
};

export function UpdateBanner({
  version,
  busy,
  progressLabel,
  error,
  onUpdate,
  onDismiss,
}: Props) {
  return (
    <div className="mx-2.5 mt-2.5 flex flex-col gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-2 text-[11px] text-sky-100">
      <div className="flex items-center gap-2">
        {busy ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <Download className="size-3.5 shrink-0" />
        )}
        <span className="flex-1">
          {busy
            ? progressLabel || `Updating to v${version}…`
            : `Update available: v${version}`}
        </span>
        {!busy && (
          <button
            type="button"
            className="rounded bg-sky-500/80 px-2 py-0.5 font-medium text-white hover:bg-sky-400"
            onClick={onUpdate}
          >
            Update
          </button>
        )}
        {!busy && (
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded p-0.5 text-sky-200/80 hover:bg-sky-500/20 hover:text-white"
            onClick={onDismiss}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {error ? <p className="text-[10px] text-red-300">{error}</p> : null}
    </div>
  );
}
