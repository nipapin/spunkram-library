/**
 * Temporary Gal root-category icon map (by lowercase label).
 * Later this will be driven from pack / catalog JSON.
 */
import type { LucideIcon } from "lucide-react";
import {
  Aperture,
  Box,
  Clock,
  Film,
  Folder,
  Grid2x2,
  Image,
  Layers,
  LayoutTemplate,
  MessageCircle,
  Monitor,
  Music2,
  Palette,
  PanelTop,
  Share2,
  Shapes,
  Smile,
  Sparkles,
  SplitSquareHorizontal,
  Type,
  Zap,
} from "lucide-react";

const GAL_ROOT_ICONS: Record<string, LucideIcon> = {
  backgrounds: Aperture,
  "back...": Aperture,
  color: Palette,
  colors: Palette,
  "color grading": Palette,
  "color presets": Palette,
  emoji: Smile,
  emojis: Smile,
  effects: Zap,
  fx: Zap,
  lower: PanelTop,
  "lower thirds": PanelTop,
  "lower third": PanelTop,
  mogrt: LayoutTemplate,
  mp4: Film,
  social: Share2,
  "sound fx": Music2,
  sfx: Music2,
  audio: Music2,
  timers: Clock,
  titles: Type,
  transitions: Shapes,
  slides: LayoutTemplate,
  stories: Share2,
  "call-outs": Sparkles,
  callouts: Sparkles,
  interface: Monitor,
  "interface items": Monitor,
  "logo reveals": Sparkles,
  "text animation": Type,
  typography: Type,
  y2k: Sparkles,
  "split frames": SplitSquareHorizontal,
  textures: Image,
  "thought bubbles": MessageCircle,
  infographics: Grid2x2,
  shapes: Shapes,
  "youtube endscreens": Monitor,
  frames: Box,
};

/** Loose keyword fallback when an exact label is missing. */
const GAL_ROOT_ICON_HINTS: Array<{ test: RegExp; icon: LucideIcon }> = [
  { test: /color|grading|lut|grade/, icon: Palette },
  { test: /emoji|smiley/, icon: Smile },
  { test: /\bfx\b|effect/, icon: Zap },
  { test: /timer|clock|countdown/, icon: Clock },
  { test: /title|type|text|typo/, icon: Type },
  { test: /transition|wipe|dissolve/, icon: Shapes },
  { test: /sound|audio|sfx|music/, icon: Music2 },
  { test: /background|bg\b/, icon: Aperture },
  { test: /lower|thirds?/, icon: PanelTop },
  { test: /social|story|stories/, icon: Share2 },
  { test: /call[\s-]?out|sparkle/, icon: Sparkles },
  { test: /interface|ui\b|hud/, icon: Monitor },
  { test: /mogrt|template|slide/, icon: LayoutTemplate },
  { test: /mp4|video|footage|film/, icon: Film },
  { test: /split|frame/, icon: SplitSquareHorizontal },
  { test: /texture|grain|noise/, icon: Image },
  { test: /bubble|thought|speech/, icon: MessageCircle },
  { test: /info|chart|graph|data/, icon: Grid2x2 },
  { test: /y2k|retro|neon/, icon: Sparkles },
  { test: /shape|geo/, icon: Shapes },
  { test: /layer|stack/, icon: Layers },
];

export function resolveGalRootCategoryIcon(label: string): LucideIcon {
  const key = label.trim().toLowerCase();
  const exact = GAL_ROOT_ICONS[key];
  if (exact) return exact;
  for (const hint of GAL_ROOT_ICON_HINTS) {
    if (hint.test.test(key)) return hint.icon;
  }
  return Folder;
}
