/**
 * System EP names — must match definition.json clientControls uiName (en_US).
 * CEP writes the CEP_WRITTEN set; Pause Gap / Hold Duration stay in Styles.
 */
export const CAPTION_SYSTEM = {
  group: "System",
  rawData: "Captions_Raw_Data",
  segmentType: "Segment Type",
  pauseGap: "Pause Gap",
  holdDuration: "Hold Duration",
  lineCount: "Line Count",
  charsPerLine: "Chars Per Line",
  compositionHeight: "Composition Height",
} as const;

/** Segment Type menucontent order (1-based, as in AE / definition value). */
export const SEGMENT_TYPE_INDEX = {
  words: 1,
  sentence: 2,
  custom: 3,
} as const;

/** CEP fills these on create / resegment / live-edit. Not user style. */
export const CEP_WRITTEN_SYSTEM_NAMES: readonly string[] = [
  CAPTION_SYSTEM.rawData,
  CAPTION_SYSTEM.segmentType,
  CAPTION_SYSTEM.lineCount,
  CAPTION_SYSTEM.charsPerLine,
  CAPTION_SYSTEM.compositionHeight,
];

export const STYLES_TRAILING_SYSTEM_NAMES = [
  CAPTION_SYSTEM.pauseGap,
  CAPTION_SYSTEM.holdDuration,
] as const;
