import { useEffect, useState } from "react";
import { hexToRgba, rgbaToHex } from "../presets";
import "./ColorField.scss";

interface ColorFieldProps {
  rgba: number[];
  onChange: (rgba: number[]) => void;
}

const normalizeHex = (raw: string): string | null => {
  let s = raw.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) {
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s.toLowerCase()}`;
  return null;
};

/** Native color picker + редактируемый hex. */
export const ColorField = ({ rgba, onChange }: ColorFieldProps) => {
  const hex = rgbaToHex(rgba);
  const alpha = rgba[3] ?? 1;
  const [draft, setDraft] = useState(hex);

  useEffect(() => {
    setDraft(hex);
  }, [hex]);

  const commitHex = (raw: string) => {
    const next = normalizeHex(raw);
    if (!next) {
      setDraft(hex);
      return;
    }
    setDraft(next);
    onChange(hexToRgba(next, alpha));
  };

  return (
    <div className="color-field color-field--compact">
      <input
        type="color"
        value={hex}
        aria-label="Color picker"
        onChange={(e) => {
          const next = e.target.value.toLowerCase();
          setDraft(next);
          onChange(hexToRgba(next, alpha));
        }}
      />
      <input
        className="color-field__hex"
        value={draft}
        spellCheck={false}
        aria-label="Hex color"
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          const next = normalizeHex(v);
          if (next) onChange(hexToRgba(next, alpha));
        }}
        onBlur={() => commitHex(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitHex(draft);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
};
