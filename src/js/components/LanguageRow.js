import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArrowRight, Globe } from "lucide-react";
import { SRC_LANGS, TRANSLATE_TARGETS } from "../data/languages";
import { StyledSelect } from "./StyledSelect";
import "./LanguageRow.scss";
export const LanguageRow = ({ srcLang, translateTo, onSrcLang, onTranslateTo, showArrow = false, className, }) => (_jsxs("div", { className: `card language-row ${className ?? ""}`.trim(), children: [_jsx(Globe, { size: 15 }), _jsx(StyledSelect, { value: srcLang, options: SRC_LANGS, onChange: onSrcLang, ariaLabel: "Source language" }), showArrow ? _jsx(ArrowRight, { size: 13, className: "language-row__arrow" }) : null, _jsx(StyledSelect, { value: translateTo, options: TRANSLATE_TARGETS, onChange: onTranslateTo, ariaLabel: "Translation target", accent: translateTo !== "off" })] }));
