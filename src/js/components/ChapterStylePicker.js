import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CHAPTER_STYLES } from "../data/chapter-styles";
import "./ChapterStylePicker.scss";
export const ChapterStylePicker = ({ value, onChange, disabled = false, }) => {
    const selected = CHAPTER_STYLES.find((style) => style.id === value) ?? CHAPTER_STYLES[0];
    return (_jsxs("div", { className: "chapter-style", children: [_jsx("span", { className: "chapters-tab__section-label", children: "Title style" }), _jsx("div", { className: "chapter-style__grid", role: "radiogroup", "aria-label": "Title style", children: CHAPTER_STYLES.map((style) => {
                    const active = style.id === value;
                    return (_jsxs("button", { type: "button", role: "radio", "aria-checked": active, className: `chapter-style__option${active ? " chapter-style__option--active" : ""}`, disabled: disabled, onClick: () => onChange(style.id), children: [_jsx("span", { className: "chapter-style__label", children: style.label }), _jsx("span", { className: "chapter-style__tagline", children: style.tagline })] }, style.id));
                }) }), _jsx("p", { className: "chapter-style__description", children: selected.description })] }));
};
