import { child_process, fs, os, path } from "@/lib/cep/node";

/** PostScript name stored in MOGRT Caption Font control. */
export type FontFace = {
  id: string;
  family: string;
  style: string;
};

export type FontFamilyGroup = {
  name: string;
  faces: FontFace[];
};

export type FontCatalog = {
  families: FontFamilyGroup[];
  byId: Map<string, FontFace>;
};

const FONT_EXT = new Set([".ttf", ".otf", ".ttc"]);

const nameTableIds = {
  family: 1,
  subfamily: 2,
  postscript: 6,
  typographicFamily: 16,
  typographicSubfamily: 17,
} as const;

const readU16 = (buf: Buffer, off: number) => buf.readUInt16BE(off);
const readU32 = (buf: Buffer, off: number) => buf.readUInt32BE(off);

const readNameRecord = (
  buf: Buffer,
  stringOffset: number,
  recordOffset: number,
): string => {
  const platformId = readU16(buf, recordOffset);
  const encodingId = readU16(buf, recordOffset + 2);
  const length = readU16(buf, recordOffset + 4);
  const offset = readU16(buf, recordOffset + 6);
  const start = stringOffset + offset;
  const end = start + length;
  if (start < 0 || end > buf.length) return "";

  if (platformId === 3 || (platformId === 0 && encodingId === 1)) {
    return buf.toString("utf16le", start, end).replace(/\0/g, "").trim();
  }
  if (platformId === 1) {
    return buf.toString("latin1", start, end).replace(/\0/g, "").trim();
  }
  return buf.toString("utf8", start, end).replace(/\0/g, "").trim();
};

const parseNameTable = (buf: Buffer, tableOffset: number): Record<number, string> => {
  const out: Record<number, string> = {};
  const count = readU16(buf, tableOffset + 2);
  const stringOffset = tableOffset + readU16(buf, tableOffset + 4);
  const recordBase = tableOffset + 6;
  for (let i = 0; i < count; i++) {
    const rec = recordBase + i * 12;
    const nameId = readU16(buf, rec + 6);
    if (out[nameId]) continue;
    const value = readNameRecord(buf, stringOffset, rec);
    if (value) out[nameId] = value;
  }
  return out;
};

const findTableOffset = (buf: Buffer, tag: string, ttcIndex = 0): number => {
  if (buf.length < 12) return -1;

  let base = 0;
  if (buf.toString("ascii", 0, 4) === "ttcf") {
    const numFonts = readU32(buf, 8);
    if (ttcIndex < 0 || ttcIndex >= numFonts) return -1;
    base = readU32(buf, 12 + ttcIndex * 4);
    if (base >= buf.length) return -1;
  }

  const numTables = readU16(buf, base + 4);
  for (let i = 0; i < numTables; i++) {
    const rec = base + 12 + i * 16;
    if (buf.toString("ascii", rec, rec + 4) !== tag) continue;
    return base + readU32(buf, rec + 8);
  }
  return -1;
};

const faceFromBuffer = (buf: Buffer, ttcIndex = 0): FontFace | null => {
  const nameOffset = findTableOffset(buf, "name", ttcIndex);
  if (nameOffset < 0) return null;
  const names = parseNameTable(buf, nameOffset);

  const id = names[nameTableIds.postscript]?.trim();
  if (!id) return null;

  const family =
    names[nameTableIds.typographicFamily]?.trim() ||
    names[nameTableIds.family]?.trim() ||
    id.split("-")[0]?.trim() ||
    id;
  const style =
    names[nameTableIds.typographicSubfamily]?.trim() ||
    names[nameTableIds.subfamily]?.trim() ||
    inferStyleFromId(id, family);

  return { id, family, style: normalizeStyleLabel(style) };
};

const inferStyleFromId = (id: string, family: string): string => {
  if (id === family) return "Regular";
  const prefix = `${family}-`;
  if (id.startsWith(prefix)) return id.slice(prefix.length) || "Regular";
  const dash = id.lastIndexOf("-");
  if (dash > 0) return id.slice(dash + 1) || "Regular";
  return "Regular";
};

const normalizeStyleLabel = (style: string): string => {
  const s = style.trim();
  if (!s) return "Regular";
  const lower = s.toLowerCase();
  if (lower === "regular" || lower === "normal" || lower === "book") return "Regular";
  if (lower === "bold") return "Bold";
  if (lower === "italic") return "Italic";
  if (lower === "bold italic" || lower === "bolditalic") return "Bold Italic";
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
};

const styleSortKey = (style: string): number => {
  const s = style.toLowerCase();
  if (s === "regular") return 0;
  if (s === "italic") return 1;
  if (s === "bold") return 2;
  if (s === "bold italic") return 3;
  return 10;
};

const collectFontFiles = (): string[] => {
  if (typeof fs?.readdirSync !== "function" || typeof os?.platform !== "function") return [];

  const files = new Set<string>();
  const dirs: string[] = [];

  if (os.platform() === "win32") {
    dirs.push(path.join(os.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts"));
    dirs.push(path.join(process.env.WINDIR || "C:\\Windows", "Fonts"));
    collectWindowsRegistryFontFiles(files);
  } else {
    dirs.push(path.join(os.homedir(), "Library", "Fonts"));
    dirs.push("/Library/Fonts");
    dirs.push("/System/Library/Fonts");
    dirs.push("/System/Library/Fonts/Supplemental");
  }

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        const ext = path.extname(entry).toLowerCase();
        if (!FONT_EXT.has(ext)) continue;
        files.add(path.join(dir, entry));
      }
    } catch {
      // skip unreadable dir
    }
  }
  return [...files];
};

const collectWindowsRegistryFontFiles = (files: Set<string>) => {
  if (typeof child_process?.execSync !== "function") return;
  try {
    const out = child_process
      .execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"', {
        encoding: "utf8",
      })
      .toString();
    const fontsDir = path.join(process.env.WINDIR || "C:\\Windows", "Fonts");
    for (const line of out.split(/\r?\n/)) {
      const match = line.match(/REG_SZ\s+(.+?)\s*$/);
      if (!match) continue;
      const fileName = match[1].trim();
      if (!fileName) continue;
      const full = path.isAbsolute(fileName) ? fileName : path.join(fontsDir, fileName);
      if (fs.existsSync(full)) files.add(full);
    }
  } catch {
    // registry unavailable
  }
};

const readFacesFromFile = (filePath: string): FontFace[] => {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 12) return [];
    if (buf.toString("ascii", 0, 4) === "ttcf") {
      const numFonts = readU32(buf, 8);
      const faces: FontFace[] = [];
      for (let i = 0; i < numFonts; i++) {
        const face = faceFromBuffer(buf, i);
        if (face) faces.push(face);
      }
      return faces;
    }
    const face = faceFromBuffer(buf, 0);
    return face ? [face] : [];
  } catch {
    return [];
  }
};

export const buildFontCatalog = (): FontCatalog => {
  const byId = new Map<string, FontFace>();
  const familyMap = new Map<string, FontFace[]>();

  for (const file of collectFontFiles()) {
    for (const face of readFacesFromFile(file)) {
      if (byId.has(face.id)) continue;
      byId.set(face.id, face);
      const list = familyMap.get(face.family) ?? [];
      list.push(face);
      familyMap.set(face.family, list);
    }
  }

  const families: FontFamilyGroup[] = [...familyMap.entries()]
    .map(([name, faces]) => ({
      name,
      faces: [...faces].sort(
        (a, b) =>
          styleSortKey(a.style) - styleSortKey(b.style) ||
          a.style.localeCompare(b.style, undefined, { sensitivity: "base" }),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return { families, byId };
};

export const findFaceInCatalog = (catalog: FontCatalog, id: string): FontFace | null =>
  catalog.byId.get(id) ?? null;

export const fallbackFaceFromId = (id: string): FontFace => {
  const trimmed = id.trim();
  if (!trimmed) return { id: "", family: "", style: "Regular" };
  const dash = trimmed.lastIndexOf("-");
  if (dash <= 0) return { id: trimmed, family: trimmed, style: "Regular" };
  const family = trimmed.slice(0, dash);
  const style = normalizeStyleLabel(trimmed.slice(dash + 1));
  return { id: trimmed, family, style };
};
