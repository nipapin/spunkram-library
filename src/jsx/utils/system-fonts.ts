/** PostScript font names available in the host app (AE / PPro). */
export const getSystemFonts = (): string[] => {
  const names: string[] = [];
  try {
    // @ts-ignore — app.fonts is available in After Effects; may exist in Premiere.
    if (typeof app !== "undefined" && app.fonts && app.fonts.allFonts) {
      const all = app.fonts.allFonts;
      for (let i = 0; i < all.length; i++) {
        try {
          const n = all[i].name;
          if (n) names.push(String(n));
        } catch {
          // skip bad font entry
        }
      }
    }
  } catch {
    // ignore
  }

  const seen: Record<string, boolean> = {};
  const unique: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (!seen[n]) {
      seen[n] = true;
      unique.push(n);
    }
  }
  unique.sort((a, b) => {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    if (al < bl) return -1;
    if (al > bl) return 1;
    return 0;
  });
  return unique;
};
