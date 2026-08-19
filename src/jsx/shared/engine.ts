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

/** Sync legacy `engine.jsx` globals when composers are still loaded (removed in phase 8). */
function syncLegacyPackContext(ctx: PackBindContext): void {
  try {
    // @ts-ignore — defined in legacy engine.jsx after loadLegacyJsx
    if (typeof transferExeSwitchTrigger === "function") {
      transferExeSwitchTrigger(ctx);
    }
  } catch {
    // legacy optional
  }
}

function syncLegacyEngineType(type: string): void {
  try {
    // @ts-ignore — legacy expects `{ engine: string }` (Beta parity)
    if (typeof transferExeEngineSwitchTrigger === "function") {
      transferExeEngineSwitchTrigger({ engine: type });
    }
  } catch {
    // legacy optional
  }
}

export const bindPack = (ctx: PackBindContext): { ok: true } => {
  packContext = ctx || {};
  syncLegacyPackContext(packContext);
  return { ok: true };
};

export const setEngine = (type: string): { ok: true; engine: string } => {
  engineType = type;
  syncLegacyEngineType(type);
  return { ok: true, engine: type };
};

export const getPackContext = (): PackBindContext => packContext;

export const getEngine = (): string | null => engineType;
