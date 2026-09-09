/**
 * Temporary Gal root-category icon map (by lowercase label).
 * Later this will be driven from pack / catalog JSON.
 */
import type { ComponentType } from "react";
import {
  Aperture,
  Box,
  Film,
  Folder,
  Image,
  Layers,
  LayoutTemplate,
  MessageCircle,
  Monitor,
  Music2,
  Palette,
  Share2,
  Shapes,
  Smile,
  SplitSquareHorizontal,
  Type,
} from "lucide-react";
import {
  ChartPieIcon,
  ContrastIcon,
  LayoutPanelTopIcon,
  MapPinIcon,
  MessageCircleCheckIcon,
  SquaresSubtractIcon,
  TimerIcon,
  ToggleRightIcon,
  TypeIcon,
  WebhookIcon,
  Y2kIcon,
} from "./gal-local-category-icons";

export type GalCategoryIcon = ComponentType<{ className?: string }>;

const GAL_ROOT_ICONS: Record<string, GalCategoryIcon> = {
  backgrounds: Aperture,
  "back...": Aperture,
  color: Palette,
  colors: Palette,
  "color grading": Palette,
  "color presets": Palette,
  emoji: Smile,
  emojis: Smile,
  effects: ContrastIcon,
  fx: ContrastIcon,
  lower: TypeIcon,
  "lower thirds": TypeIcon,
  "lower third": TypeIcon,
  mogrt: LayoutTemplate,
  mp4: Film,
  social: Share2,
  "sound fx": Music2,
  sfx: Music2,
  audio: Music2,
  timers: TimerIcon,
  titles: Type,
  transitions: LayoutPanelTopIcon,
  slides: LayoutTemplate,
  stories: Share2,
  "call-outs": MapPinIcon,
  callouts: MapPinIcon,
  "call outs": MapPinIcon,
  interface: ToggleRightIcon,
  "interface items": ToggleRightIcon,
  "logo reveals": WebhookIcon,
  overlays: SquaresSubtractIcon,
  overlay: SquaresSubtractIcon,
  messages: MessageCircleCheckIcon,
  message: MessageCircleCheckIcon,
  "text animation": Type,
  typography: Type,
  y2k: Y2kIcon,
  "split frames": SplitSquareHorizontal,
  textures: Image,
  "thought bubbles": MessageCircle,
  infographics: ChartPieIcon,
  shapes: Shapes,
  "youtube endscreens": Monitor,
  frames: Box,
};

/** Loose keyword fallback when an exact label is missing. */
const GAL_ROOT_ICON_HINTS: Array<{ test: RegExp; icon: GalCategoryIcon }> = [
  { test: /color|grading|lut|grade/, icon: Palette },
  { test: /emoji|smiley/, icon: Smile },
  { test: /\bfx\b|effect/, icon: ContrastIcon },
  { test: /timer|clock|countdown/, icon: TimerIcon },
  { test: /title|type|text|typo/, icon: Type },
  { test: /transition|wipe|dissolve/, icon: LayoutPanelTopIcon },
  { test: /sound|audio|sfx|music/, icon: Music2 },
  { test: /background|bg\b/, icon: Aperture },
  { test: /lower|thirds?/, icon: TypeIcon },
  { test: /social|story|stories/, icon: Share2 },
  { test: /call[\s-]?out/, icon: MapPinIcon },
  { test: /interface|ui\b|hud/, icon: ToggleRightIcon },
  { test: /logo.?reveal/, icon: WebhookIcon },
  { test: /overlay/, icon: SquaresSubtractIcon },
  { test: /message/, icon: MessageCircleCheckIcon },
  { test: /mogrt|template|slide/, icon: LayoutTemplate },
  { test: /mp4|video|footage|film/, icon: Film },
  { test: /split|frame/, icon: SplitSquareHorizontal },
  { test: /texture|grain|noise/, icon: Image },
  { test: /bubble|thought|speech/, icon: MessageCircle },
  { test: /info|chart|graph|data/, icon: ChartPieIcon },
  { test: /y2k|retro|neon/, icon: Y2kIcon },
  { test: /shape|geo/, icon: Shapes },
  { test: /layer|stack/, icon: Layers },
];

export function resolveGalRootCategoryIcon(label: string): GalCategoryIcon {
  const key = label.trim().toLowerCase();
  const exact = GAL_ROOT_ICONS[key];
  if (exact) return exact;
  for (const hint of GAL_ROOT_ICON_HINTS) {
    if (hint.test.test(key)) return hint.icon;
  }
  return Folder;
}
