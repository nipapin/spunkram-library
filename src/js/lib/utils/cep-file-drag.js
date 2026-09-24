/**
 * Drag out of the Spunkram panel into Premiere.
 *
 * A real media file is handed to the host with `com.adobe.cep.dnd.file.0`, so
 * Premiere inserts it where the pointer is released. Pack projects and mogrts
 * drag a small PNG stub instead: on release outside the panel the host reads
 * that clip's start and track, deletes it, and the existing apply replaces it.
 * The card itself is never the drag image.
 */
import { BRAND } from "@brands";
import { os } from "../cep/node";
export const cepHostFileDragEnabled = BRAND.id === "spunkram";
const GHOST_SRC = "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";
let ghost = null;
let armed = false;
let kind = null;
let leftPanel = false;
let droppedOnPanel = false;
let cancelled = false;
let unbind = null;
function dragGhost() {
    if (!ghost) {
        ghost = new Image(1, 1);
        ghost.src = GHOST_SRC;
        ghost.alt = "";
        ghost.draggable = false;
        ghost.style.position = "fixed";
        ghost.style.left = "-100px";
        ghost.style.top = "0";
        ghost.style.width = "1px";
        ghost.style.height = "1px";
        ghost.style.pointerEvents = "none";
        if (typeof document !== "undefined")
            document.documentElement.appendChild(ghost);
    }
    return ghost;
}
function hideDragGhost(transfer) {
    try {
        transfer.setDragImage(dragGhost(), 0, 0);
    }
    catch {
        // A missing ghost still leaves the file drop; Premiere draws its own.
    }
}
function hostDragPath(filePath) {
    try {
        if (os.platform() === "win32")
            return filePath.replace(/\//g, "\\");
    }
    catch {
        // Vite preview has no CEP node.
    }
    return filePath.replace(/\\/g, "/");
}
function resetSession() {
    unbind?.();
    unbind = null;
    armed = false;
    kind = null;
    leftPanel = false;
    droppedOnPanel = false;
    cancelled = false;
}
function bindApplyListeners() {
    const onOver = (event) => {
        const x = event.clientX;
        const y = event.clientY;
        if (x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight) {
            leftPanel = false;
        }
    };
    const onLeave = (event) => {
        if (event.relatedTarget == null)
            leftPanel = true;
    };
    const onEnter = (event) => {
        if (event.relatedTarget == null && event.target === document.documentElement) {
            leftPanel = false;
        }
    };
    const onDrop = () => {
        droppedOnPanel = true;
    };
    const onKey = (event) => {
        if (event.key === "Escape")
            cancelled = true;
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("drop", onDrop);
    window.addEventListener("keydown", onKey);
    unbind = () => {
        window.removeEventListener("dragover", onOver);
        window.removeEventListener("dragleave", onLeave);
        window.removeEventListener("dragenter", onEnter);
        window.removeEventListener("drop", onDrop);
        window.removeEventListener("keydown", onKey);
    };
}
function armSession(event, next, filePath) {
    const transfer = event.dataTransfer;
    resetSession();
    if (!transfer)
        return false;
    armed = true;
    kind = next;
    bindApplyListeners();
    transfer.effectAllowed = "copy";
    hideDragGhost(transfer);
    if (filePath)
        transfer.setData("com.adobe.cep.dnd.file.0", hostDragPath(filePath));
    else
        transfer.setData("application/x-spunkram-pack-item", "apply");
    return true;
}
/** Premiere places this file itself. No second apply on drag end. */
export function beginHostFileDrag(event, filePath) {
    const transfer = event.dataTransfer;
    resetSession();
    if (!transfer || !filePath)
        return false;
    transfer.effectAllowed = "copy";
    hideDragGhost(transfer);
    transfer.setData("com.adobe.cep.dnd.file.0", hostDragPath(filePath));
    return true;
}
/** Drag the PNG stub. `finishHostDrag` returns `"placeholder"` when it lands outside. */
export function beginPlaceholderDrag(event, filePath) {
    if (!filePath)
        return false;
    return armSession(event, "placeholder", filePath);
}
/** After Effects: release outside the panel applies at the current time. */
export function beginApplyOnDropOutside(event) {
    armSession(event, "apply");
}
/**
 * Call from `dragend`. `"placeholder"` means the PNG was released on the host
 * and should be replaced. `"apply"` is the After Effects playhead path.
 */
export function finishHostDrag(event) {
    const sessionKind = kind;
    const should = armed;
    const outside = leftPanel;
    const escaped = cancelled;
    const droppedHere = droppedOnPanel;
    const x = event.clientX;
    const y = event.clientY;
    const releasedOutside = outside || x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight;
    resetSession();
    if (!should || !sessionKind || escaped || droppedHere || !releasedOutside)
        return null;
    return sessionKind;
}
if (typeof document !== "undefined")
    dragGhost();
