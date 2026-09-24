export const CHAPTER_STYLES = [
  {
    id: "balanced",
    label: "Balanced",
    tagline: "Clear & engaging",
    description: "Clear, engaging and natural titles suitable for most YouTube videos.",
  },
  {
    id: "viral",
    label: "Viral",
    tagline: "Bold & high-CTR",
    description: "Bold, curiosity-driven titles designed to maximize clicks and attention.",
  },
  {
    id: "professional",
    label: "Professional",
    tagline: "Clean & authoritative",
    description: "Polished, credible titles for tutorials, businesses, products and educational content.",
  },
  {
    id: "search",
    label: "Search",
    tagline: "SEO & discoverability",
    description: "Keyword-focused titles optimized for YouTube search and evergreen discovery.",
  },
] as const;

export type ChapterStyleId = (typeof CHAPTER_STYLES)[number]["id"];

export function isChapterStyleId(value: unknown): value is ChapterStyleId {
  return CHAPTER_STYLES.some((style) => style.id === value);
}
