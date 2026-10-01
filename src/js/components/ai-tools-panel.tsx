import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { AiToolsList } from "@/components/ai-tools-list";
import { CaptionsApp } from "@/ui/spunkram/apps/CaptionsApp";
import { ChaptersApp } from "@/ui/spunkram/apps/ChaptersApp";
import { SilenceRemoverApp } from "@/ui/spunkram/apps/SilenceRemoverApp";
import * as panelStore from "@/lib/userdata-store";
import { BRAND } from "@brands";
import "@/ai-tools.scss";

type ActiveTool = "hub" | "captions" | "chapters" | "silence";

const TOOL_KEY = BRAND.id === "odin" ? "odin-ai-active-tool" : "spunkram-library-ai-active-tool";

const loadTool = (): ActiveTool => {
  try {
    const stored = panelStore.getItem(TOOL_KEY);
    if (stored === "captions" || stored === "chapters" || stored === "silence") return stored;
  } catch {
    // ignore
  }
  return "hub";
};

export function AiToolsPanel({
  monthly,
  extra,
  monthlyLimit,
  isFreeUser,
  onUse,
  onNoCredits,
  additionalTools,
}: {
  monthly: number;
  extra: number;
  monthlyLimit: number | null;
  isFreeUser?: boolean;
  onUse: () => void;
  onNoCredits?: (tool: string) => void;
  onBuyExtra?: (amount: number) => void;
  additionalTools?: ReactNode;
}) {
  const [activeTool, setActiveTool] = useState<ActiveTool>(() => BRAND.id === "odin" ? "hub" : loadTool());
  const totalLeft = monthly + extra;
  const onUseRef = useRef(onUse);
  onUseRef.current = onUse;

  useEffect(() => {
    panelStore.setItem(TOOL_KEY, activeTool);
  }, [activeTool]);

  useEffect(() => {
    const onCreditsChanged = () => onUseRef.current();
    window.addEventListener("aitools-credits-changed", onCreditsChanged);
    return () => window.removeEventListener("aitools-credits-changed", onCreditsChanged);
  }, []);

  const openTool = (id: string) => {
    if (totalLeft <= 0 && !onNoCredits) return;
    if (id === "captions") setActiveTool("captions");
    else if (id === "chapter" || id === "chapters") setActiveTool("chapters");
    else if (id === "silence") setActiveTool("silence");
  };

  if (activeTool === "captions" || activeTool === "chapters" || activeTool === "silence") {
    const title =
      activeTool === "captions"
        ? "Captions"
        : activeTool === "chapters"
          ? "Chapters"
          : "Silence Remover";
    return (
      <div className="ai-tools-scope tool-shell">
        <header className="tool-shell__header">
          <button
            type="button"
            className="tool-shell__back"
            onClick={() => setActiveTool("hub")}
            aria-label="Back to tools"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="tool-shell__title">{title}</span>
          <span className="tool-shell__gens" title="Generations left">
            <Sparkles size={12} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
            {totalLeft}
          </span>
        </header>
        <div className="tool-shell__body">
          {activeTool === "captions" ? (
            <CaptionsApp generationsLeft={totalLeft} onNoCredits={onNoCredits ? () => onNoCredits(title) : undefined} />
          ) : activeTool === "chapters" ? (
            <ChaptersApp generationsLeft={totalLeft} onNoCredits={onNoCredits ? () => onNoCredits(title) : undefined} />
          ) : (
            <SilenceRemoverApp generationsLeft={totalLeft} onNoCredits={onNoCredits ? () => onNoCredits(title) : undefined} />
          )}
        </div>
      </div>
    );
  }

  return (
    <AiToolsList
      monthly={monthly}
      extra={extra}
      monthlyLimit={monthlyLimit}
      isFreeUser={isFreeUser}
      onOpenTool={openTool}
      allowOpenWithoutCredits={Boolean(onNoCredits)}
      showGetMore={!onNoCredits}
      additionalTools={additionalTools}
    />
  );
}
