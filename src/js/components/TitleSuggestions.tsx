import { Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../utils/clipboard";
import "./TitleSuggestions.scss";

interface TitleSuggestionsProps {
  titles: string[];
  onEditTitle: (index: number, title: string) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

export const TitleSuggestions = ({
  titles,
  onEditTitle,
  onRegenerate,
  regenerating,
}: TitleSuggestionsProps) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (index: number, title: string) => {
    if (!title.trim()) return;
    const ok = await copyToClipboard(title);
    if (!ok) return;
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1500);
  };

  return (
    <div className="title-suggestions">
      <div className="title-suggestions__head">
        <span className="chapters-tab__section-label">VIDEO TITLES</span>
        <button
          type="button"
          className="btn btn--ghost title-suggestions__regenerate"
          onClick={onRegenerate}
          disabled={regenerating}
        >
          {regenerating ? <span className="spinner" /> : <RefreshCw size={12} />}
          Regenerate
        </button>
      </div>

      <div className="title-suggestions__options">
        {titles.map((title, i) => (
          <div className="title-suggestions__row" key={i}>
            <input
              className="title-suggestions__input"
              value={title}
              onChange={(e) => onEditTitle(i, e.target.value)}
              placeholder={`Title option ${i + 1}`}
              aria-label={`Video title option ${i + 1}`}
            />
            <button
              type="button"
              className="icon-btn title-suggestions__copy"
              onClick={() => handleCopy(i, title)}
              disabled={!title.trim()}
              data-tooltip={copiedIndex === i ? "Copied!" : "Copy title"}
              aria-label={`Copy title option ${i + 1}`}
            >
              {copiedIndex === i ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
