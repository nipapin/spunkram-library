import { Captions, ListOrdered, Mic, Sparkles, Plus, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";

const AI_TOOLS = [
  { id: "captions", label: "Captions", desc: "Auto-generate subtitles", icon: Captions, soon: false },
  { id: "chapter", label: "Chapter", desc: "Split into chapters", icon: ListOrdered, soon: false },
  { id: "voiceover", label: "Voiceover", desc: "AI narration with Minimax", icon: Mic, soon: false },
] as const;

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

export function AiToolsList({
  monthly,
  extra,
  monthlyLimit,
  isFreeUser,
  onOpenTool,
}: {
  monthly: number;
  extra: number;
  monthlyLimit: number;
  isFreeUser?: boolean;
  onOpenTool: (id: string) => void;
  /** @deprecated Local fake extras removed — quota is server-owned. */
  onBuyExtra?: (amount: number) => void;
}) {
  const totalLeft = monthly + extra;
  // Capacity = monthly allotment + current extra balance. Empty track = used monthly.
  const capacity = Math.max(monthlyLimit, 0) + Math.max(extra, 0);
  const monthlyPct =
    capacity > 0 ? Math.max(0, Math.min(100, (Math.max(monthly, 0) / capacity) * 100)) : 0;
  const extraPct =
    capacity > 0 ? Math.max(0, Math.min(100 - monthlyPct, (Math.max(extra, 0) / capacity) * 100)) : 0;

  return (
    <div className="relative flex flex-col gap-3 p-2.5">
      <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 shadow-md shadow-primary/10 ring-1 ring-inset ring-white/5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Sparkles className="size-3.5 text-primary" strokeWidth={2.25} />
            Generations left
          </span>
          <span className="text-sm font-semibold text-foreground">{totalLeft}</span>
        </div>

        <div className="mt-2.5 space-y-2">
          <div
            className="flex h-1.5 w-full overflow-hidden rounded-full bg-background/60"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={capacity}
            aria-valuenow={totalLeft}
            aria-label={`${totalLeft} generations left (${monthly} monthly, ${extra} extra)`}
          >
            {monthlyPct > 0 ? (
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/75 transition-[width]"
                style={{ width: `${monthlyPct}%` }}
                title={`${monthly} monthly`}
              />
            ) : null}
            {extraPct > 0 ? (
              <div
                className="h-full bg-gradient-to-r from-cyan-400/90 to-teal-400/70 transition-[width]"
                style={{ width: `${extraPct}%` }}
                title={`${extra} extra`}
              />
            ) : null}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              {monthly}/{monthlyLimit} {isFreeUser ? "free plan" : "monthly"}
              {isFreeUser ? "" : " · resets each month"}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="inline-block size-1.5 shrink-0 rounded-full bg-cyan-400" aria-hidden />
                <InfinityIcon className="size-3" />
                {extra} extra
              </span>
              <button
                type="button"
                onClick={() => openMotionflowSubscribe()}
                className={cn(
                  "flex items-center gap-0.5 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-opacity hover:opacity-95",
                  ACCENT_PILL,
                )}
              >
                <Plus className="size-3" strokeWidth={2.5} />
                Get more
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {AI_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const disabled = tool.soon || totalLeft <= 0;
          return (
            <button
              key={tool.id}
              type="button"
              disabled={disabled}
              onClick={() => onOpenTool(tool.id)}
              className={cn(
                "group flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all",
                "border-white/10 bg-card/60 shadow-sm ring-1 ring-inset ring-white/5",
                disabled
                  ? "cursor-not-allowed opacity-50"
                  : "hover:border-primary/50 hover:bg-card/80 hover:shadow-md hover:shadow-primary/15",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full transition-transform",
                  tool.soon
                    ? "bg-secondary text-muted-foreground"
                    : cn(ACCENT_PILL, !disabled && "group-hover:scale-105"),
                )}
              >
                <Icon className="size-4" strokeWidth={2.25} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{tool.label}</span>
                  {tool.soon && (
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">{tool.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
