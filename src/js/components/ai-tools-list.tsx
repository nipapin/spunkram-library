import { Type, BookOpen, AudioLines, Sparkles, Plus, Infinity as InfinityIcon } from "lucide-react";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";

const AI_TOOLS = [
  { id: "captions", label: "Captions", desc: "Auto-generate subtitles", icon: Type, soon: false },
  { id: "chapter", label: "Chapters", desc: "Split into chapters", icon: BookOpen, soon: false },
  { id: "voiceover", label: "Voiceover", desc: "AI narration with Minimax", icon: AudioLines, soon: false },
] as const;

function Sheen() {
  return <span className="ai-hub__sheen" aria-hidden />;
}

export function AiToolsList({
  monthly,
  extra,
  monthlyLimit,
  isFreeUser,
  onOpenTool,
}: {
  monthly: number;
  extra: number;
  monthlyLimit: number | null;
  isFreeUser?: boolean;
  onOpenTool: (id: string) => void;
  /** @deprecated Local fake extras removed — quota is server-owned. */
  onBuyExtra?: (amount: number) => void;
}) {
  const totalLeft = monthly + extra;
  const limitLabel = monthlyLimit != null ? String(monthlyLimit) : "—";
  const capacity = Math.max(0, (monthlyLimit ?? 0) + extra);
  const monthlyPct = capacity > 0 ? Math.max(0, Math.min(100, (Math.max(monthly, 0) / capacity) * 100)) : 0;
  const extraPct = capacity > 0 ? Math.max(0, Math.min(100, (Math.max(extra, 0) / capacity) * 100)) : 0;

  return (
    <div className="ai-tools-scope ai-hub">
      <div className="ai-hub__mesh" />
      <div className="ai-hub__grid" />

      <div className="ai-hub__body">
        <div className="ai-hub__scroll">
          <div className="ai-hub__stack">
            <section className="ai-hub__card">
              <Sheen />
              <div className="ai-hub__inner">
                <div className="ai-hub__row">
                  <p className="ai-hub__kicker">
                    <Sparkles className="size-3.5" strokeWidth={2.25} />
                    Generations left
                  </p>
                  <span className="ai-hub__count">{totalLeft}</span>
                </div>

                <div
                  className="ai-hub__track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={capacity || undefined}
                  aria-valuenow={totalLeft}
                  aria-label={`${monthly} monthly and ${extra} extra generations left`}
                >
                  {monthlyPct > 0 ? (
                    <div
                      className="ai-hub__fill ai-hub__fill--monthly"
                      style={{ width: `${monthlyPct}%` }}
                      title={`${monthly} monthly`}
                    />
                  ) : null}
                  {extraPct > 0 ? (
                    <div
                      className="ai-hub__fill ai-hub__fill--extra"
                      style={{ width: `${extraPct}%` }}
                      title={`${extra} extra`}
                    />
                  ) : null}
                </div>

                <div className="ai-hub__legend">
                  <span className="ai-hub__legend-item">
                    <span className="ai-hub__dot ai-hub__dot--monthly" aria-hidden />
                    {monthly}/{limitLabel} {isFreeUser ? "free plan" : "monthly"}
                    {isFreeUser ? "" : " · resets each month"}
                  </span>
                  <div className="ai-hub__legend-right">
                    <span className="ai-hub__legend-item">
                      <span className="ai-hub__dot ai-hub__dot--extra" aria-hidden />
                      <InfinityIcon className="size-3" />
                      {extra} extra
                    </span>
                    <button
                      type="button"
                      className="ai-hub-btn ai-hub-btn--primary ai-hub-btn--tiny"
                      onClick={() => openMotionflowSubscribe()}
                    >
                      <Plus className="size-3" strokeWidth={2.5} />
                      Get more
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div className="ai-hub__tools">
              {AI_TOOLS.map((tool) => {
                const Icon = tool.icon;
                const disabled = tool.soon || totalLeft <= 0;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onOpenTool(tool.id)}
                    className={
                      disabled
                        ? "ai-hub__card ai-hub__card--tool ai-hub__card--disabled"
                        : "ai-hub__card ai-hub__card--tool ai-hub__card--click"
                    }
                  >
                    <Sheen />
                    <span className="ai-hub__inner ai-hub__tool">
                      <span className={tool.soon ? "ai-hub__icon ai-hub__icon--muted" : "ai-hub__icon"}>
                        <Icon className="size-4" strokeWidth={2.25} />
                      </span>
                      <span className="ai-hub__tool-copy">
                        <span className="ai-hub__tool-title">
                          {tool.label}
                          {tool.soon && <span className="ai-hub__soon">Coming soon</span>}
                        </span>
                        <span className="ai-hub__tool-desc">{tool.desc}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
