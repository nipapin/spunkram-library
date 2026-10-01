import { useState, type ComponentProps } from "react";
import { ArrowLeft, FolderTree, Search } from "lucide-react";
import { AiToolsPanel } from "@/components/ai-tools-panel";
import { OdinObserver } from "./observer/OdinObserver";

export function OdinAiToolsPanel(props: ComponentProps<typeof AiToolsPanel>) {
  const [observer, setObserver] = useState(false);
  const [query, setQuery] = useState("");

  if (observer) {
    return (
      <div className="ai-tools-scope tool-shell odin-observer-tool">
        <header className="tool-shell__header">
          <button type="button" className="tool-shell__back" aria-label="Back to AI Tools" onClick={() => setObserver(false)}>
            <ArrowLeft size={16} />
          </button>
          <span className="tool-shell__title">Observer</span>
          <label className="odin-search">
            <Search size={16} />
            <input aria-label="Find folders" placeholder="Find folders" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </header>
        <OdinObserver query={query} />
      </div>
    );
  }

  return (
    <AiToolsPanel
      {...props}
      additionalTools={
        <button type="button" className="ai-hub__card ai-hub__card--tool ai-hub__card--click" onClick={() => setObserver(true)}>
          <span className="ai-hub__sheen" aria-hidden />
          <span className="ai-hub__inner ai-hub__tool">
            <span className="ai-hub__icon"><FolderTree className="size-4" strokeWidth={2.25} /></span>
            <span className="ai-hub__tool-copy">
              <span className="ai-hub__tool-title">Observer</span>
              <span className="ai-hub__tool-desc">Quick access to your local folders</span>
            </span>
          </span>
        </button>
      }
    />
  );
}
