/**
 * Download caption fonts from R2 and install them the same way pack `Fonts/` are installed.
 *
 * Expected later on CDN (`{Brand} Captions/…`), same layout as the local override folder:
 *   {Pack}/{Style}/Fonts/*.{ttf,otf}
 *   {Pack}/{Style}/fonts.json          — `["Inter-SemiBold.ttf"]` or `{ "files": [...] }`
 *   {Pack}/Fonts/ and {Pack}/fonts.json — shared by every style in the pack
 *
 * If `fonts.json` is missing, try `{Caption Font}.ttf` and `.otf` from those Fonts folders.
 * Missing files are a no-op so apply still works before fonts land on R2.
 */
import { fs, os, path } from "../lib/cep/node";
import { installFontsFromDirectory, userFontFileInstalled } from "../lib/utils/pack-fonts";
import { invalidateFontCatalog } from "../lib/utils/system-fonts";
import { fontIdFromValue, findFontControl } from "../presets";
import { getActiveBrand } from "../lib/utils/brandTheme";
import { publicCaptionFileUrl } from "./api";
import { captionsLocalFile, isCaptionsLocalOverrideActive } from "./localSource";
import { packIdFromStyleId } from "./paths";
const FONT_EXT = new Set([".ttf", ".otf"]);
const safeBaseName = (name) => {
    const base = path.basename(String(name || "").replace(/\\/g, "/")).trim();
    if (!base || base === "." || base === "..")
        return "";
    return base;
};
const fontIdsFromDefinition = (definition) => {
    if (!definition)
        return [];
    const ids = [];
    const push = (raw) => {
        const id = fontIdFromValue(raw);
        if (id && !ids.includes(id))
            ids.push(id);
    };
    const control = findFontControl(definition);
    if (control)
        push(control.value);
    for (const entry of definition.init ?? []) {
        const name = String(entry.name || "").trim().toLowerCase();
        if (name === "caption font" || name === "font")
            push(entry.value);
    }
    return ids;
};
const parseFontList = (text) => {
    try {
        const data = JSON.parse(text);
        const list = Array.isArray(data)
            ? data
            : data && typeof data === "object" && Array.isArray(data.files)
                ? data.files
                : [];
        const out = [];
        for (const item of list) {
            if (typeof item !== "string")
                continue;
            const base = safeBaseName(item);
            if (!base || !FONT_EXT.has(path.extname(base).toLowerCase()))
                continue;
            if (!out.includes(base))
                out.push(base);
        }
        return out;
    }
    catch {
        return [];
    }
};
const isDir = (dir) => {
    if (!dir || typeof fs?.statSync !== "function")
        return false;
    try {
        return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    }
    catch {
        return false;
    }
};
const fetchText = async (url) => {
    try {
        const response = await fetch(url, { method: "GET", cache: "no-store" });
        if (!response.ok)
            return null;
        return await response.text();
    }
    catch {
        return null;
    }
};
const fetchBytes = async (url) => {
    try {
        const response = await fetch(url, {
            method: "GET",
            cache: "no-store",
            headers: { Accept: "application/octet-stream" },
        });
        if (!response.ok)
            return null;
        const buffer = await response.arrayBuffer();
        return buffer.byteLength ? buffer : null;
    }
    catch {
        return null;
    }
};
const fileNamesForFontId = (fontId) => {
    const base = safeBaseName(fontId);
    if (!base)
        return [];
    const ext = path.extname(base).toLowerCase();
    if (FONT_EXT.has(ext))
        return [base];
    return [`${base}.ttf`, `${base}.otf`];
};
/**
 * Install fonts for this caption before the mogrt is applied.
 * Local `Fonts/` folders win. Otherwise download from the public captions CDN.
 */
export const ensureCaptionFontsInstalled = async (styleId, definition) => {
    if (!styleId || typeof fs?.writeFileSync !== "function")
        return 0;
    const brand = getActiveBrand();
    const packId = packIdFromStyleId(styleId);
    const styleFontsDir = captionsLocalFile(styleId, "Fonts", brand);
    const packFontsDir = packId ? captionsLocalFile(packId, "Fonts", brand) : null;
    if (isCaptionsLocalOverrideActive(brand)) {
        let installed = 0;
        if (isDir(styleFontsDir))
            installed += await installFontsFromDirectory(styleFontsDir);
        if (isDir(packFontsDir))
            installed += await installFontsFromDirectory(packFontsDir);
        if (installed > 0)
            invalidateFontCatalog();
        return installed;
    }
    const wanted = new Set();
    const manifestUrls = [
        styleId ? publicCaptionFileUrl(styleId, "fonts.json", brand) : "",
        packId ? publicCaptionFileUrl(packId, "fonts.json", brand) : "",
    ].filter(Boolean);
    for (const url of manifestUrls) {
        const text = await fetchText(url);
        if (!text)
            continue;
        for (const name of parseFontList(text))
            wanted.add(name);
    }
    if (wanted.size === 0) {
        for (const fontId of fontIdsFromDefinition(definition)) {
            for (const name of fileNamesForFontId(fontId))
                wanted.add(name);
        }
    }
    const pending = [...wanted].filter((name) => !userFontFileInstalled(name));
    if (pending.length === 0)
        return 0;
    const staging = path.join(os.tmpdir(), "motionflow-caption-fonts", String(Date.now()));
    try {
        fs.mkdirSync(staging, { recursive: true });
    }
    catch {
        return 0;
    }
    const scopes = [styleId, packId].filter((id) => !!id);
    for (const name of pending) {
        if (userFontFileInstalled(name))
            continue;
        let bytes = null;
        for (const scope of scopes) {
            bytes = await fetchBytes(publicCaptionFileUrl(`${scope}/Fonts`, name, brand));
            if (bytes)
                break;
        }
        if (!bytes)
            continue;
        try {
            fs.writeFileSync(path.join(staging, name), new Uint8Array(bytes));
        }
        catch {
            // skip one file
        }
    }
    const installed = await installFontsFromDirectory(staging);
    try {
        fs.rmSync(staging, { recursive: true, force: true });
    }
    catch {
        // best-effort
    }
    if (installed > 0)
        invalidateFontCatalog();
    return installed;
};
