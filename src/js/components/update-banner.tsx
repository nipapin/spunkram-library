import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpCircle, Info, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  version: string;
  localVersion?: string;
  changelog?: string;
  busy: boolean;
  progressLabel?: string;
  error?: string | null;
  onUpdate: () => void;
};

function formatChangelog(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .replace(/^#+\s*/, "")
        .replace(/^[-*•]\s+/, "")
        .replace(/^\d+\.\s+/, ""),
    )
    .filter(Boolean)
    .slice(0, 12);
}

export function UpdateBanner({
  version,
  localVersion,
  changelog = "",
  busy,
  progressLabel,
  error,
  onUpdate,
}: Props) {
  const [infoOpen, setInfoOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const notes = formatChangelog(changelog);

  useEffect(() => {
    if (!infoOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setInfoOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [infoOpen]);

  return (
    <div ref={rootRef} className="relative mx-2.5 mt-2.5">
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-primary/35",
          "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent",
          "shadow-md shadow-primary/15 ring-1 ring-inset ring-white/10",
        )}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              "bg-primary text-primary-foreground shadow-md shadow-primary/40",
            )}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold leading-tight text-foreground">
              {busy ? "Updating Spunkram" : "Update available"}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {busy
                ? progressLabel || `Installing v${version}…`
                : localVersion
                  ? `v${localVersion} → v${version}`
                  : `Version ${version} is ready`}
            </p>
          </div>

          {!busy && (
            <button
              type="button"
              aria-label="What's new"
              aria-expanded={infoOpen}
              aria-controls={panelId}
              title="What's new"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                infoOpen
                  ? "border-primary/50 bg-primary/20 text-primary"
                  : "border-white/10 bg-black/20 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
              onClick={() => setInfoOpen((v) => !v)}
            >
              <Info className="size-3.5" />
            </button>
          )}

          {!busy && (
            <button
              type="button"
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5",
                "bg-gradient-to-b from-primary to-primary/70 text-[11px] font-semibold text-primary-foreground",
                "border border-primary/60 shadow-md shadow-primary/40",
                "ring-1 ring-inset ring-white/15 transition-opacity hover:opacity-95",
              )}
              onClick={onUpdate}
            >
              <ArrowUpCircle className="size-3.5" />
              Update
            </button>
          )}
        </div>

        {busy && (
          <div className="h-0.5 w-full overflow-hidden bg-primary/15">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70" />
          </div>
        )}
      </div>

      {infoOpen && !busy ? (
        <div
          id={panelId}
          role="region"
          aria-label="Release notes"
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-xl",
            "border border-white/10 bg-card/95 shadow-xl backdrop-blur-md",
            "ring-1 ring-inset ring-white/5",
          )}
        >
          <div className="border-b border-white/10 px-3 py-2">
            <p className="text-[11px] font-semibold text-foreground">
              What&apos;s new in v{version}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Changes included in this update
            </p>
          </div>
          <div className="max-h-40 overflow-y-auto px-3 py-2">
            {notes.length > 0 ? (
              <ul className="space-y-1.5">
                {notes.map((line, i) => (
                  <li
                    key={`${i}-${line.slice(0, 24)}`}
                    className="flex gap-2 text-[11px] leading-snug text-foreground/90"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No release notes for this version yet. The update still includes
                the latest fixes and improvements.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-1.5 px-1 text-[10px] text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
