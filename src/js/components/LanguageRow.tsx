import { ArrowRight, Globe } from "lucide-react";
import { SRC_LANGS, TRANSLATE_TARGETS } from "../data/languages";
import { StyledSelect } from "./StyledSelect";
import "./LanguageRow.scss";

export const LanguageRow = ({
  srcLang,
  translateTo,
  onSrcLang,
  onTranslateTo,
  showArrow = false,
  className,
}: {
  srcLang: string;
  translateTo: string;
  onSrcLang: (value: string) => void;
  onTranslateTo: (value: string) => void;
  showArrow?: boolean;
  className?: string;
}) => (
  <div className={`card language-row ${className ?? ""}`.trim()}>
    <Globe size={15} />
    <StyledSelect
      value={srcLang}
      options={SRC_LANGS}
      onChange={onSrcLang}
      ariaLabel="Source language"
    />
    {showArrow ? <ArrowRight size={13} className="language-row__arrow" /> : null}
    <StyledSelect
      value={translateTo}
      options={TRANSLATE_TARGETS}
      onChange={onTranslateTo}
      ariaLabel="Translation target"
      accent={translateTo !== "off"}
    />
  </div>
);
