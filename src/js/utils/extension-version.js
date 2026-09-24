import { fs, path } from "@/lib/cep/node";
import { compareVersions } from "@/api/update";
import { csi } from "@/lib/utils/bolt";
import * as panelStore from "@/lib/userdata-store";
import { BRAND, storageKey } from "@brands";
import { version as BUILD_VERSION } from "../../shared/shared";
import { APPLIED_VERSION_STAMP_FILE, parseAppliedVersionStamp, } from "./cross-host-update";
import { INSTALLED_UPDATE_FILE } from "./update-swap-page";
const APPLIED_STORE_KEY = storageKey("appliedExtensionUpdate");
function extRoot() {
    try {
        return csi.getSystemPath("extension") || "";
    }
    catch {
        return "";
    }
}
/** Parse `ExtensionBundleVersion` (or Extension `Version`) from CSXS/manifest.xml. */
export function readInstalledBundleVersion() {
    const root = extRoot();
    if (!root || typeof fs?.existsSync !== "function")
        return null;
    const candidates = [
        path.join(root, "CSXS", "manifest.xml"),
        path.join(root, "csxs", "manifest.xml"),
        path.join(root, "manifest.xml"),
    ];
    for (const file of candidates) {
        try {
            if (!fs.existsSync(file))
                continue;
            const xml = fs.readFileSync(file, { encoding: "utf8" }).toString();
            const bundle = xml.match(/\bExtensionBundleVersion\s*=\s*["']([^"']+)["']/i)?.[1] ||
                xml.match(/<Extension\b[^>]*\bVersion\s*=\s*["']([^"']+)["']/i)?.[1];
            if (bundle?.trim())
                return bundle.trim().replace(/^v/i, "");
        }
        catch {
            /* try next */
        }
    }
    return null;
}
function readStampFile(file) {
    if (!file || typeof fs?.existsSync !== "function")
        return null;
    try {
        if (!fs.existsSync(file))
            return null;
        const raw = JSON.parse(fs.readFileSync(file, { encoding: "utf8" }).toString());
        return parseAppliedVersionStamp(raw);
    }
    catch {
        return null;
    }
}
function readDiskUpdateStamp() {
    const root = extRoot();
    if (!root)
        return null;
    return readStampFile(path.join(root, INSTALLED_UPDATE_FILE));
}
/** AppData/Roaming handshake — shared by AE and Premiere, outside the extension folder. */
export function getAppliedVersionStampPath() {
    const dir = panelStore.getPanelUserDataDir();
    return dir ? path.join(dir, APPLIED_VERSION_STAMP_FILE) : "";
}
function readRoamingAppliedStamp() {
    return readStampFile(getAppliedVersionStampPath());
}
function writeRoamingAppliedStamp(version, appliedAt) {
    const file = getAppliedVersionStampPath();
    if (!file || typeof fs?.writeFileSync !== "function")
        return;
    try {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        const payload = { version, appliedAt };
        fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
    }
    catch {
        /* ignore */
    }
}
/**
 * Fresh disk read of the version another host successfully applied.
 * Prefers the Roaming handshake (written only after apply finished).
 */
export function readCrossHostAppliedVersion() {
    return readRoamingAppliedStamp() || readDiskUpdateStamp();
}
function readStoreAppliedVersion() {
    try {
        const v = panelStore.getItem(APPLIED_STORE_KEY);
        return v?.trim() ? v.trim().replace(/^v/i, "") : null;
    }
    catch {
        return null;
    }
}
/** Newest among build embed, CSXS manifest, apply stamp (disk + panel store). */
export function getEffectiveLocalVersion(buildVersion = BUILD_VERSION) {
    const candidates = [
        buildVersion,
        readInstalledBundleVersion(),
        readDiskUpdateStamp(),
        readStoreAppliedVersion(),
    ].filter((v) => Boolean(v && v.trim()));
    let best = candidates[0] || buildVersion;
    for (let i = 1; i < candidates.length; i++) {
        if (compareVersions(candidates[i], best) > 0)
            best = candidates[i];
    }
    return best;
}
/** Persist that this remote version was successfully applied (survives CEF JS cache). */
export function markExtensionUpdateApplied(version) {
    const clean = version.trim().replace(/^v/i, "");
    if (!clean)
        return;
    const appliedAt = new Date().toISOString();
    const payload = { version: clean, appliedAt };
    try {
        panelStore.setItem(APPLIED_STORE_KEY, clean);
    }
    catch {
        /* ignore */
    }
    writeRoamingAppliedStamp(clean, appliedAt);
    const root = extRoot();
    if (!root || typeof fs?.writeFileSync !== "function")
        return;
    try {
        fs.writeFileSync(path.join(root, INSTALLED_UPDATE_FILE), JSON.stringify(payload, null, 2), "utf8");
    }
    catch {
        /* ignore — roaming stamp still wakes the other host */
    }
}
/** Reload panel HTML with a cache-bust query so CEF does not serve stale main.js. */
export function reloadPanelHard() {
    if (typeof window === "undefined" || !window.location)
        return;
    try {
        const url = new URL(window.location.href);
        const filePath = url.pathname.replace(/\\/g, "/");
        const onLegacyEntry = /\/main\/index\.html$/i.test(filePath) ||
            /\/ui\/spunkram\/index\.html$/i.test(filePath);
        if (onLegacyEntry && BRAND.panelMainPath) {
            const dest = new URL(BRAND.panelMainPath, url);
            dest.searchParams.set("_cep_upd", String(Date.now()));
            window.location.replace(dest.toString());
            return;
        }
        url.searchParams.set("_cep_upd", String(Date.now()));
        window.location.replace(url.toString());
    }
    catch {
        try {
            window.location.reload();
        }
        catch {
            /* ignore */
        }
    }
}
