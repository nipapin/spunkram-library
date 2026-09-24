/**
 * PNG Premiere inserts while a pack item is dragged onto the timeline.
 * The host reads that clip's start, then the normal apply replaces it.
 */
import { fs, os, path } from "../cep/node";
import { evalTS } from "./bolt";
export const DRAG_PLACEHOLDER_NAME = "Spunkram-Drop.png";
/** 64×36 solid still. Premiere's still duration makes it a timeline clip. */
const PLACEHOLDER_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAAU0lEQVR4nO3PwQkAIBDAsBvUURzdh0P4CEKhA6Sz1/m64YIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga04LEL2LZ08T95f6oAAAAASUVORK5CYII=";
export function ensureDragPlaceholderFile() {
    try {
        if (typeof fs?.writeFileSync !== "function" || typeof os?.tmpdir !== "function")
            return null;
        const filePath = path.join(os.tmpdir(), DRAG_PLACEHOLDER_NAME);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, Buffer.from(PLACEHOLDER_PNG_BASE64, "base64"));
        }
        return filePath;
    }
    catch {
        return null;
    }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function adoptMessage(reason) {
    if (reason === "NO_ACTIVE_SEQUENCE") {
        return "Open a sequence, then drop the item on the timeline.";
    }
    if (reason === "NOT_ON_TIMELINE" || reason == null || reason === "") {
        return "Drop the item on the timeline.";
    }
    return String(reason);
}
/**
 * Wait until Premiere has inserted the stub, then ask the host to take its
 * start time and remove it. A miss does not fall back to the playhead.
 */
/** Drop a leftover drop-track hint if apply returned before the host could use it. */
export async function releaseDragAnchor() {
    try {
        await evalTS("clearDragAnchorVideoTrack");
    }
    catch {
        // The next apply falls back to the lowest free track.
    }
}
export async function adoptTimelinePlaceholder() {
    const first = await evalTS("adoptDragPlaceholder", DRAG_PLACEHOLDER_NAME, false);
    if (first && first.ok)
        return { ok: true };
    if (first && (first.reason === "NO_ACTIVE_SEQUENCE" || first.reason === "NO_PROJECT")) {
        return { ok: false, message: adoptMessage(first.reason) };
    }
    await sleep(350);
    const second = await evalTS("adoptDragPlaceholder", DRAG_PLACEHOLDER_NAME, true);
    if (second && second.ok)
        return { ok: true };
    return { ok: false, message: adoptMessage(second && second.reason) };
}
