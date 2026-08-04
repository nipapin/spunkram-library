/**
 * Pack / engine context binding (port of Beta engine.jsx transfer triggers).
 * Legacy `engine.jsx` still owns full applyItem dispatch when loaded;
 * this module keeps a typed mirror for TS hosts.
 */

export type PackBindContext = {
  packObject?: unknown;
  packInsideOptions?: unknown;
  shortAppID?: string;
  packFileDir?: string;
  [key: string]: unknown;
};

let packContext: PackBindContext = {};
let engineType: string | null = null;

export const bindPack = (ctx: PackBindContext): { ok: true } => {
  packContext = ctx || {};
  return { ok: true };
};

export const setEngine = (type: string): { ok: true; engine: string } => {
  engineType = type;
  return { ok: true, engine: type };
};

export const getPackContext = (): PackBindContext => packContext;

export const getEngine = (): string | null => engineType;
