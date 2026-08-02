import { Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../utils/clipboard";
import "./GeneratedTextSection.scss";

interface GeneratedTextSectionProps {
  label: string;
  value: string;
  placeholder: string;
  rows?: number;
  onChange: (value: string) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

/** Переиспользуемая секция "заголовок + Regenerate + textarea + Copy" для Description и Tags. */
export const GeneratedTextSection = ({
  label,
  value,
  placeholder,
  rows = 3,
  onChange,
  onRegenerate,
  regenerating,
}: GeneratedTextSectionProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value.trim()) return;
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="generated-text-section">
      <div className="generated-text-section__head">
        <span className="chapters-tab__section-label">{label}</span>
        <button
          type="button"
          className="btn btn--ghost generated-text-section__regenerate"
          onClick={onRegenerate}
          disabled={regenerating}
        >
          {regenerating ? <span className="spinner" /> : <RefreshCw size={12} />}
          Regenerate
        </button>
      </div>

      <textarea
        className="generated-text-section__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-label={label}
      />

      <div className="generated-text-section__footer">
        <button
          type="button"
          className="btn btn--ghost generated-text-section__copy"
          onClick={handleCopy}
          disabled={!value.trim()}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
};
