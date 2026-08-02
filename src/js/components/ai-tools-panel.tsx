import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { AiToolsList } from "@/components/ai-tools-list";
import { CaptionsApp } from "@/main/apps/CaptionsApp";
import { ChaptersApp } from "@/main/apps/ChaptersApp";
import { VoiceoverApp } from "@/main/apps/VoiceoverApp";
import "@/ai-tools.scss";

type ActiveTool = "hub" | "captions" | "chapters" | "voiceover";

const TOOL_KEY = "spunkram-library-ai-active-tool";

const loadTool = (): ActiveTool => {
  try {
    const stored = localStorage.getItem(TOOL_KEY);
    if (stored === "captions" || stored === "chapters" || stored === "voiceover") return stored;
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
  onBuyExtra,
}: {
  monthly: number;
  extra: number;
  monthlyLimit: number;
  isFreeUser?: boolean;
  onUse: () => void;
  onBuyExtra: (amount: number) => void;
}) {
  const [activeTool, setActiveTool] = useState<ActiveTool>(loadTool);
  const totalLeft = monthly + extra;
  const onUseRef = useRef(onUse);
  onUseRef.current = onUse;

  useEffect(() => {
    localStorage.setItem(TOOL_KEY, activeTool);
  }, [activeTool]);

  useEffect(() => {
    const onCreditsChanged = () => onUseRef.current();
    window.addEventListener("aitools-credits-changed", onCreditsChanged);
    return () => window.removeEventListener("aitools-credits-changed", onCreditsChanged);
  }, []);

  const openTool = (id: string) => {
    if (totalLeft <= 0) return;
    if (id === "captions") setActiveTool("captions");
    else if (id === "chapter" || id === "chapters") setActiveTool("chapters");
    else if (id === "voiceover") setActiveTool("voiceover");
  };

  if (activeTool === "captions" || activeTool === "chapters" || activeTool === "voiceover") {
    const title =
      activeTool === "captions"
        ? "Captions"
        : activeTool === "chapters"
          ? "Chapter"
          : "Voiceover";
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
            <CaptionsApp />
          ) : activeTool === "chapters" ? (
            <ChaptersApp />
          ) : (
            <VoiceoverApp />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <AiToolsList
        monthly={monthly}
        extra={extra}
        monthlyLimit={monthlyLimit}
        isFreeUser={isFreeUser}
        onOpenTool={openTool}
        onBuyExtra={onBuyExtra}
      />
    </div>
  );
}
