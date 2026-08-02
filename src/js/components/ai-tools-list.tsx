import { Captions, ListOrdered, Mic, Sparkles, Plus, Infinity as InfinityIcon, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const AI_TOOLS = [
  { id: "captions", label: "Captions", desc: "Auto-generate subtitles", icon: Captions, soon: false },
  { id: "chapter", label: "Chapter", desc: "Split into chapters", icon: ListOrdered, soon: false },
  { id: "voiceover", label: "Voiceover", desc: "AI narration with Minimax", icon: Mic, soon: false },
] as const;

const EXTRA_PACKS = [
  { id: "pack-25", amount: 25, price: 7 },
  { id: "pack-50", amount: 50, price: 12 },
  { id: "pack-100", amount: 100, price: 19 },
] as const;

export function AiToolsList({
  monthly,
  extra,
  monthlyLimit,
  isFreeUser,
  onOpenTool,
  onBuyExtra,
}: {
  monthly: number;
  extra: number;
  monthlyLimit: number;
  isFreeUser?: boolean;
  onOpenTool: (id: string) => void;
  onBuyExtra: (amount: number) => void;
}) {
  const [showExtra, setShowExtra] = useState(false);
  const totalLeft = monthly + extra;
  const pct = Math.max(0, Math.min(100, monthlyLimit > 0 ? (monthly / monthlyLimit) * 100 : 0));

  return (
    <div className="relative flex flex-col gap-3 p-2.5">
      <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Sparkles className="size-3.5 text-primary" strokeWidth={2.25} />
            Generations left
          </span>
          <span className="text-sm font-semibold text-foreground">{totalLeft}</span>
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {monthly}/{monthlyLimit} {isFreeUser ? "free plan" : "monthly"}
              {isFreeUser ? "" : " · resets each month"}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <InfinityIcon className="size-3" />
                {extra} extra
              </span>
              <button
                type="button"
                onClick={() => setShowExtra(true)}
                className="flex items-center gap-0.5 rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/30"
              >
                <Plus className="size-3" strokeWidth={2.5} />
                Add Extra
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
                "flex items-center gap-3 rounded-xl border border-white/10 bg-card/60 px-3 py-3 text-left transition-colors",
                disabled ? "cursor-not-allowed opacity-50" : "hover:border-primary/50 hover:bg-primary/10",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  tool.soon ? "bg-secondary text-muted-foreground" : "bg-primary/20 text-primary",
                )}
              >
                <Icon className="size-4.5" strokeWidth={2.25} />
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

      {showExtra && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-xl border border-white/10 bg-card p-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Plus className="size-4 text-primary" strokeWidth={2.5} />
                  Buy extra generations
                </h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Extra generations never expire and are used after your monthly quota.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExtra(false)}
                aria-label="Close"
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {EXTRA_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => {
                    onBuyExtra(pack.amount);
                    setShowExtra(false);
                  }}
                  className="flex flex-col items-center gap-0.5 rounded-lg border border-white/10 bg-background/50 px-2 py-2.5 transition-colors hover:border-primary/60 hover:bg-primary/10"
                >
                  <span className="text-sm font-semibold text-foreground">{pack.amount}</span>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">gens</span>
                  <span className="mt-1 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    ${pack.price}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
