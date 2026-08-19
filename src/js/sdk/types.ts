/** Shared MotionFlow SDK result type. */
export type MfResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export type MfHost = "AE" | "PPRO";

export type ImportDestination = "project" | "timeline";

export type ApplyPackItemPayload = {
  ctype: "PROJECT" | "MOGRT" | "AUDIO" | "FOOTAGE";
  filePath: string;
  itemName: string;
  binName: string;
  compName?: string;
  /** Seconds — used by Premiere free-track placement (from pack `duration_ticks`). */
  durationSeconds?: number;
  /** AE composer context — when set, host uses full `applyComp` pipeline. */
  composer?: {
    itemId: string;
    instanceGroup: string;
    argsObject: Record<string, unknown>;
    extraArguments: Record<string, unknown>;
    templatesDir: string;
    packName: string;
    packOptions: Record<string, unknown>;
  };
};

export type ApplyPackItemResult =
  | { applied: true; ctype: string }
  | { applied: false; reason: string };

export type CreateCompOptions = {
  name: string;
  width: number;
  height: number;
  duration?: number;
  frameRate?: number;
  pixelAspect?: number;
};

export type CreateTextOptions = {
  text: string;
  compId?: number;
  fontSize?: number;
  fontFamily?: string;
  fillColor?: [number, number, number];
  position?: [number, number];
};

export type ResponsiveBackgroundOptions = {
  compId?: number;
  /** RGB 0–1 */
  color?: [number, number, number];
  name?: string;
};

export type AddMogrtOptions = {
  filePath: string;
  itemName?: string;
  trackIndex?: number;
  startTicks?: string;
};

export type PackBindContext = {
  packObject?: unknown;
  packInsideOptions?: unknown;
  shortAppID?: string;
  packFileDir?: string;
  [key: string]: unknown;
};
