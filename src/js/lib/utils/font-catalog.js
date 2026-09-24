import { cepProcessEnv, fs, os, path } from "@/lib/cep/node";
const FONT_EXT = new Set([".ttf", ".otf", ".ttc"]);
const nameTableIds = {
    family: 1,
    subfamily: 2,
    postscript: 6,
    typographicFamily: 16,
    typographicSubfamily: 17,
};
const readU16 = (buf, off) => buf.readUInt16BE(off);
const readU32 = (buf, off) => buf.readUInt32BE(off);
/** Windows/Unicode name strings are UTF-16BE, not LE. */
const decodeUtf16Be = (buf, start, end) => {
    const len = end - start;
    if (len < 2 || len % 2)
        return "";
    const copy = Buffer.from(buf.subarray(start, end));
    copy.swap16();
    return copy.toString("utf16le").replace(/\0/g, "").trim();
};
const decodeNameBytes = (buf, start, end, platformId, encodingId) => {
    if (start < 0 || end > buf.length || end <= start)
        return "";
    if (platformId === 3 || platformId === 0) {
        if (encodingId === 0 && platformId === 3) {
            return buf.toString("latin1", start, end).replace(/\0/g, "").trim();
        }
        return decodeUtf16Be(buf, start, end);
    }
    if (platformId === 1) {
        return buf.toString("latin1", start, end).replace(/\0/g, "").trim();
    }
    return buf.toString("utf8", start, end).replace(/\0/g, "").trim();
};
const nameRecordScore = (platformId, encodingId, languageId) => {
    const unicode = encodingId === 1 || encodingId === 10;
    if (platformId === 3 && unicode && languageId === 0x0409)
        return 100;
    if (platformId === 3 && unicode)
        return 80;
    if (platformId === 0 && unicode)
        return 50;
    if (platformId === 1)
        return 20;
    return 10;
};
const parseNameTable = (buf, tableOffset) => {
    const out = {};
    const score = {};
    const count = readU16(buf, tableOffset + 2);
    const stringOffset = tableOffset + readU16(buf, tableOffset + 4);
    const recordBase = tableOffset + 6;
    for (let i = 0; i < count; i++) {
        const rec = recordBase + i * 12;
        const platformId = readU16(buf, rec);
        const encodingId = readU16(buf, rec + 2);
        const languageId = readU16(buf, rec + 4);
        const nameId = readU16(buf, rec + 6);
        const length = readU16(buf, rec + 8);
        const offset = readU16(buf, rec + 10);
        const nextScore = nameRecordScore(platformId, encodingId, languageId);
        if ((score[nameId] ?? -1) >= nextScore)
            continue;
        const value = decodeNameBytes(buf, stringOffset + offset, stringOffset + offset + length, platformId, encodingId);
        if (!value)
            continue;
        out[nameId] = value;
        score[nameId] = nextScore;
    }
    return out;
};
const findTableOffset = (buf, tag, ttcIndex = 0) => {
    if (buf.length < 12)
        return -1;
    let base = 0;
    if (buf.toString("ascii", 0, 4) === "ttcf") {
        const numFonts = readU32(buf, 8);
        if (ttcIndex < 0 || ttcIndex >= numFonts)
            return -1;
        base = readU32(buf, 12 + ttcIndex * 4);
        if (base >= buf.length)
            return -1;
    }
    const numTables = readU16(buf, base + 4);
    for (let i = 0; i < numTables; i++) {
        const rec = base + 12 + i * 16;
        if (buf.toString("ascii", rec, rec + 4) !== tag)
            continue;
        return base + readU32(buf, rec + 8);
    }
    return -1;
};
const faceFromBuffer = (buf, ttcIndex = 0) => {
    const nameOffset = findTableOffset(buf, "name", ttcIndex);
    if (nameOffset < 0)
        return null;
    const names = parseNameTable(buf, nameOffset);
    const id = names[nameTableIds.postscript]?.trim();
    if (!id)
        return null;
    const family = names[nameTableIds.typographicFamily]?.trim() ||
        names[nameTableIds.family]?.trim() ||
        id.split("-")[0]?.trim() ||
        id;
    const style = names[nameTableIds.typographicSubfamily]?.trim() ||
        names[nameTableIds.subfamily]?.trim() ||
        inferStyleFromId(id, family);
    return { id, family, style: normalizeStyleLabel(style) };
};
const inferStyleFromId = (id, family) => {
    if (id === family)
        return "Regular";
    const prefix = `${family}-`;
    if (id.startsWith(prefix))
        return id.slice(prefix.length) || "Regular";
    const dash = id.lastIndexOf("-");
    if (dash > 0)
        return id.slice(dash + 1) || "Regular";
    return "Regular";
};
const normalizeStyleLabel = (style) => {
    const s = style.trim();
    if (!s)
        return "Regular";
    const lower = s.toLowerCase();
    if (lower === "regular" || lower === "normal" || lower === "book")
        return "Regular";
    if (lower === "bold")
        return "Bold";
    if (lower === "italic")
        return "Italic";
    if (lower === "bold italic" || lower === "bolditalic")
        return "Bold Italic";
    const spaced = s
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return spaced.replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
};
const styleSortKey = (style) => {
    const s = style.toLowerCase();
    if (s === "regular")
        return 0;
    if (s === "italic")
        return 1;
    if (s === "bold")
        return 2;
    if (s === "bold italic")
        return 3;
    return 10;
};
const collectFontFiles = (scope = "quick") => {
    if (typeof fs?.readdirSync !== "function" || typeof os?.platform !== "function")
        return [];
    const files = new Set();
    const dirs = [];
    if (os.platform() === "win32") {
        if (scope === "system")
            return [];
        dirs.push(path.join(os.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts"));
        dirs.push(path.join(cepProcessEnv().WINDIR || "C:\\Windows", "Fonts"));
    }
    else {
        if (scope === "system") {
            dirs.push("/System/Library/Fonts");
            dirs.push("/System/Library/Fonts/Supplemental");
        }
        else {
            dirs.push(path.join(os.homedir(), "Library", "Fonts"));
            dirs.push("/Library/Fonts");
        }
    }
    for (const dir of dirs) {
        try {
            if (!fs.existsSync(dir))
                continue;
            for (const entry of fs.readdirSync(dir)) {
                const ext = path.extname(entry).toLowerCase();
                if (!FONT_EXT.has(ext))
                    continue;
                files.add(path.join(dir, entry));
            }
        }
        catch {
            // skip unreadable dir
        }
    }
    return [...files];
};
const readFacesFromFile = (filePath) => {
    try {
        const buf = fs.readFileSync(filePath);
        if (buf.length < 12)
            return [];
        if (buf.toString("ascii", 0, 4) === "ttcf") {
            const numFonts = readU32(buf, 8);
            const faces = [];
            for (let i = 0; i < numFonts; i++) {
                const face = faceFromBuffer(buf, i);
                if (face)
                    faces.push(face);
            }
            return faces;
        }
        const face = faceFromBuffer(buf, 0);
        return face ? [face] : [];
    }
    catch {
        return [];
    }
};
const yieldUi = () => new Promise((resolve) => setTimeout(resolve, 0));
const assembleCatalog = (byId, familyMap) => {
    const families = [...familyMap.entries()]
        .map(([name, faces]) => ({
        name,
        faces: [...faces].sort((a, b) => styleSortKey(a.style) - styleSortKey(b.style) ||
            a.style.localeCompare(b.style, undefined, { numeric: true, sensitivity: "base" })),
    }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return { families, byId };
};
/** Parse fonts in chunks so CEP/Premiere stay responsive. */
export const mergeFontCatalogs = (base, extra) => {
    const byId = new Map(base.byId);
    const familyMap = new Map();
    for (const group of base.families)
        familyMap.set(group.name, group.faces.slice());
    extra.byId.forEach((face) => {
        if (byId.has(face.id))
            return;
        byId.set(face.id, face);
        const list = familyMap.get(face.family) ?? [];
        list.push(face);
        familyMap.set(face.family, list);
    });
    return assembleCatalog(byId, familyMap);
};
export const buildFontCatalogAsync = async (scope = "quick") => {
    const byId = new Map();
    const familyMap = new Map();
    const files = collectFontFiles(scope);
    const chunk = 6;
    for (let i = 0; i < files.length; i++) {
        for (const face of readFacesFromFile(files[i])) {
            if (byId.has(face.id))
                continue;
            byId.set(face.id, face);
            const list = familyMap.get(face.family) ?? [];
            list.push(face);
            familyMap.set(face.family, list);
        }
        if (i % chunk === chunk - 1)
            await yieldUi();
    }
    return assembleCatalog(byId, familyMap);
};
export const findFaceInCatalog = (catalog, id) => {
    const trimmed = id.trim();
    if (!trimmed)
        return null;
    const exact = catalog.byId.get(trimmed);
    if (exact)
        return exact;
    const lower = trimmed.toLowerCase();
    const compact = lower.replace(/[\s_-]+/g, "");
    for (const face of catalog.byId.values()) {
        const key = face.id.toLowerCase();
        if (key === lower)
            return face;
        if (key.replace(/[\s_-]+/g, "") === compact)
            return face;
    }
    return null;
};
export const pickFaceForFamily = (group, preferredStyle) => {
    if (!group?.faces.length)
        return null;
    if (preferredStyle) {
        const exact = group.faces.find((f) => f.style === preferredStyle);
        if (exact)
            return exact;
        const lower = preferredStyle.toLowerCase();
        const fuzzy = group.faces.find((f) => f.style.toLowerCase() === lower);
        if (fuzzy)
            return fuzzy;
    }
    return group.faces.find((f) => f.style === "Regular") ?? group.faces[0];
};
export const cssFontFamily = (family) => {
    const name = family.trim();
    if (!name)
        return "inherit";
    if (/^[a-zA-Z][\w-]*$/.test(name))
        return name;
    return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};
/** Symbol/icon fonts turn their own name into dingbats — keep UI font for those. */
const SYMBOL_FAMILY = /^(wingdings|webdings|marlett|symbol|zapf dingbats|mt extra|ms outlook|segoe mdl2|segoe fluent icons|holomdl2|fabric mdl2|bookshelvesymbol)/i;
export const canPreviewFamily = (family) => {
    const name = family.trim();
    if (!name || SYMBOL_FAMILY.test(name))
        return false;
    return /[A-Za-z\u00C0-\u024F]/.test(name);
};
export const fallbackFaceFromId = (id) => {
    const trimmed = id.trim();
    if (!trimmed)
        return { id: "", family: "", style: "Regular" };
    const dash = trimmed.lastIndexOf("-");
    if (dash <= 0)
        return { id: trimmed, family: trimmed, style: "Regular" };
    const family = trimmed.slice(0, dash);
    const style = normalizeStyleLabel(trimmed.slice(dash + 1));
    return { id: trimmed, family, style };
};
