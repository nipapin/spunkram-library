/**
 * Premiere: footage and audio are the file Premiere inserts at the drop point.
 * Projects and mogrts drag a PNG stub; the apply replaces that stub.
 * After Effects keeps the playhead apply (a PNG drop would land in the comp).
 */
import { fs } from "../cep/node";
import { cepHostAppId } from "./bolt";
import { resolveItemSourceFile } from "./pack-apply-paths";
function fileExists(file) {
    try {
        return Boolean(file) && typeof fs?.existsSync === "function" && fs.existsSync(file);
    }
    catch {
        return false;
    }
}
export function planPackItemDrag(item, packFilePath, settings) {
    const appId = cepHostAppId();
    if (!appId) {
        return {
            kind: "blocked",
            message: "Open this panel inside Premiere Pro or After Effects.",
        };
    }
    if (!packFilePath)
        return { kind: "missing" };
    let resolved;
    try {
        resolved = resolveItemSourceFile(item, packFilePath, appId, settings);
    }
    catch (error) {
        return {
            kind: "blocked",
            message: error instanceof Error ? error.message : "Could not resolve this item.",
        };
    }
    if (!resolved || resolved.ctype === "UNSUPPORTED") {
        return {
            kind: "blocked",
            message: "This item can't be dragged. Double-click to apply it.",
        };
    }
    if (resolved.ctype === "MOGRT" && appId === "AEFT") {
        return {
            kind: "blocked",
            message: "This item's format (.mogrt) isn't supported in After Effects.",
        };
    }
    if (!fileExists(resolved.file))
        return { kind: "missing" };
    if (appId === "PPRO" && (resolved.ctype === "FOOTAGE" || resolved.ctype === "AUDIO")) {
        return { kind: "file", file: resolved.file };
    }
    if (appId === "PPRO")
        return { kind: "placeholder" };
    return { kind: "apply" };
}
