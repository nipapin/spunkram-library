import { CHAPTER_STYLES, type ChapterStyleId } from "../data/chapter-styles";
import "./ChapterStylePicker.scss";

export const ChapterStylePicker = ({
  value,
  onChange,
  disabled = false,
}: {
  value: ChapterStyleId;
  onChange: (value: ChapterStyleId) => void;
  disabled?: boolean;
}) => {
  const selected =
    CHAPTER_STYLES.find((style) => style.id === value) ??
    CHAPTER_STYLES.find((style) => style.id === "viral")!;

  return (
    <div className="chapter-style">
      <span className="chapters-tab__section-label">Title style</span>
      <div className="chapter-style__grid" role="radiogroup" aria-label="Title style">
        {CHAPTER_STYLES.map((style) => {
          const active = style.id === value;
          return (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`chapter-style__option${active ? " chapter-style__option--active" : ""}`}
              disabled={disabled}
              onClick={() => onChange(style.id)}
            >
              <span className="chapter-style__label">{style.label}</span>
              <span className="chapter-style__tagline">{style.tagline}</span>
            </button>
          );
        })}
      </div>
      <p className="chapter-style__description">{selected.description}</p>
    </div>
  );
};
