/**
 * Footage / stock download destination from Settings.
 * - Assets path (`customStockLocation`) is required unless overridden.
 * - "Use project location" overrides the download dir for footage only;
 *   it does not clear or replace the stored assets path.
 */
import { asBool, readPrefSettings, writePrefSettings, } from "../api/preferences";
import { selectFolderAsync } from "./bolt";
import { Motionflow } from "@/sdk";
import { BRAND } from "@brands";
import { fs, os, path } from "../cep/node";
export function hasConfiguredAssetsPath() {
    try {
        return Boolean((readPrefSettings().customStockLocation || "").trim());
    }
    catch {
        return false;
    }
}
function persistAssetsPath(folder) {
    const prefs = readPrefSettings();
    writePrefSettings({
        ...prefs,
        customStockLocation: folder,
        // Keep legacy flag in sync for older readers; UI no longer exposes it.
        useCustomPathForAssets: 1,
    });
}
/**
 * Ensure an assets download folder is configured (folder picker if empty).
 * Does not run when "Use project location" will override — caller decides.
 */
export async function ensureAssetsPathChosen() {
    const existing = (readPrefSettings().customStockLocation || "").trim();
    if (existing)
        return { ok: true, path: existing };
    const folder = await selectFolderAsync("", `Choose where ${BRAND.authorName} should download footage`);
    if (!folder) {
        return {
            ok: false,
            message: "Choose an assets folder in the dialog (or set it in Settings) to download footage.",
        };
    }
    persistAssetsPath(folder);
    return { ok: true, path: folder };
}
/** Last dir resolved for a footage download, including the project folder. */
let rememberedFootageDir = "";
export function rememberFootageDownloadDir(dir) {
    const trimmed = dir.trim();
    if (trimmed)
        rememberedFootageDir = trimmed;
}
function syncFootageDir() {
    try {
        const prefs = readPrefSettings();
        if (asBool(prefs.useCurrentProjectLocation))
            return rememberedFootageDir;
        const existing = (prefs.customStockLocation || "").trim();
        if (existing)
            return existing;
    }
    catch {
        // fall through
    }
    if (rememberedFootageDir)
        return rememberedFootageDir;
    try {
        if (typeof os?.tmpdir === "function")
            return os.tmpdir();
    }
    catch {
        // ignore
    }
    return "";
}
/** Absolute path when this footage file is already on disk. */
export function peekExistingFootageFile(fileName) {
    if (!fileName || typeof path?.join !== "function")
        return null;
    const dir = syncFootageDir();
    if (!dir)
        return null;
    const filePath = path.join(dir, fileName);
    try {
        if (typeof fs?.existsSync === "function" && fs.existsSync(filePath))
            return filePath;
    }
    catch {
        return null;
    }
    return null;
}
/**
 * Download dir for Import — never opens a native folder picker.
 * A picker behind After Effects looks like a dead click (Network stays empty).
 * Falls back to the OS temp directory, same as spunkram-assets.
 */
export async function resolveFootageDownloadDirSilent() {
    let dir = "";
    try {
        const prefs = readPrefSettings();
        if (asBool(prefs.useCurrentProjectLocation)) {
            const projectDir = await Motionflow.getProjectFolderPath();
            if (projectDir.ok && projectDir.data)
                dir = projectDir.data;
        }
        if (!dir) {
            const existing = (prefs.customStockLocation || "").trim();
            if (existing)
                dir = existing;
        }
    }
    catch {
        // fall through to temp
    }
    if (!dir) {
        try {
            if (typeof os?.tmpdir === "function")
                dir = os.tmpdir();
        }
        catch {
            // ignore
        }
    }
    if (dir)
        rememberFootageDownloadDir(dir);
    return dir;
}
export async function resolveFootageDownloadDir() {
    const prefs = readPrefSettings();
    if (asBool(prefs.useCurrentProjectLocation)) {
        const projectDir = await Motionflow.getProjectFolderPath();
        if (!projectDir.ok || !projectDir.data) {
            return {
                ok: false,
                message: "Save the project first to download footage next to it (or turn off “Use project location”).",
            };
        }
        const dir = projectDir.data;
        try {
            if (typeof fs?.existsSync === "function" && !fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        catch {
            // host path may still be writable
        }
        return { ok: true, dir };
    }
    const ensured = await ensureAssetsPathChosen();
    if (!ensured.ok)
        return ensured;
    const dir = path.normalize(ensured.path);
    try {
        if (typeof fs?.existsSync === "function" && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    catch {
        // continue; download will surface IO errors
    }
    return { ok: true, dir };
}
