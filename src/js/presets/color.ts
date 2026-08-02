/** Цвет из AE/MOGRT: [r,g,b,a] 0–1 → #rrggbb. */
export const rgbaToHex = (rgba: number[]): string => {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)));
  const r = clamp(rgba[0] ?? 0);
  const g = clamp(rgba[1] ?? 0);
  const b = clamp(rgba[2] ?? 0);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

/** #rrggbb → [r,g,b,a] 0–1. */
export const hexToRgba = (hex: string, prevAlpha = 1): number[] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0, prevAlpha];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, prevAlpha];
};
