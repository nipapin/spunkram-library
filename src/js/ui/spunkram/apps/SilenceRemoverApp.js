import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { Scissors } from "lucide-react";
import { getUserIdentity } from "@/api";
import { reportSupportError } from "@/api/support";
import { useWorkRangeCost } from "@/hooks/useWorkRangeCost";
import { fs } from "@/lib/cep/node";
import { usePanelUI } from "@/lib/panel-ui-context";
import { Motionflow } from "@/sdk";
import { isAfterEffectsAsync } from "@/lib/utils/host-identity";
import { authErrorMessage } from "@/styles";
import { getBundledAudioPresetPath } from "@/utils/audioPreset";
import { describeForExport } from "@/utils/describeForExport";
import { convertToMp3 } from "@/utils/ffmpeg";
import { withGenerationCostLabel } from "@/utils/generationCost";
import { rangeFillStyle } from "@/utils/rangeFillStyle";
import { silenceRangesFromTokens } from "@/utils/silence-ranges";
import { normalize, transcribe } from "@/utils/transcribe";
import { friendlyErrorMessage, isAbortLikeError, isSoftHostError } from "@/utils/user-error";
import { ProgressDialog, } from "@/components/ProgressDialog";
import "./SilenceRemoverApp.scss";
const MIN_GAP_MIN = 0.2;
const MIN_GAP_MAX = 2;
const PAD_MIN = 0;
const PAD_MAX = 0.3;
const PROGRESS_STEPS = [
    { stage: "rendering", label: "Rendering", hint: "Exporting the In/Out range" },
    { stage: "converting", label: "Converting audio", hint: "Transcoding to mp3" },
    { stage: "transcribing", label: "Transcribing", hint: "Finding pauses between words" },
    { stage: "creating", label: "Cutting", hint: "Razor and close the gaps on the timeline" },
];
const throwIfCancelled = (signal) => {
    if (!signal.aborted)
        return;
    const err = new Error("Cancelled");
    err.name = "AbortError";
    throw err;
};
const tokensFromTranscription = (result) => {
    const raw = result.raw?.words;
    if (raw?.length) {
        return raw.map((word) => ({
            start: word.start,
            end: word.end,
            type: word.type,
            text: word.text,
        }));
    }
    return (result.words?.chunks ?? []).map((chunk) => ({
        start: chunk.timestamp[0],
        end: chunk.timestamp[1],
        type: "word",
        text: chunk.text,
    }));
};
const cleanupTempAudio = (paths) => {
    for (const filePath of paths) {
        if (!filePath)
            continue;
        try {
            if (fs.existsSync(filePath))
                fs.unlinkSync(filePath);
        }
        catch {
            // host may still hold the file
        }
    }
};
export const SilenceRemoverApp = ({ generationsLeft = 0, }) => {
    const { showStatus } = usePanelUI();
    const workRange = useWorkRangeCost(true);
    const [minGap, setMinGap] = useState(0.5);
    const [pad, setPad] = useState(0.1);
    const [progress, setProgress] = useState(null);
    const [summary, setSummary] = useState(null);
    const abortRef = useRef(null);
    const showError = (err) => {
        const msg = friendlyErrorMessage(err);
        if (!msg || isAbortLikeError(err))
            return;
        showStatus(msg, "error", 7000);
    };
    const run = async (signal) => {
        await Motionflow.ready();
        throwIfCancelled(signal);
        if (await isAfterEffectsAsync()) {
            const err = new Error("Silence Remover cuts clips in Premiere Pro. Open the sequence there and try again.");
            err.soft = true;
            throw err;
        }
        const user = getUserIdentity();
        setProgress({ stage: "rendering" });
        const exported = await describeForExport(getBundledAudioPresetPath() || undefined);
        throwIfCancelled(signal);
        let source = exported.source;
        let dest = exported.dest;
        try {
            setProgress({ stage: "converting" });
            const mp3Path = await convertToMp3(exported.source, exported.dest);
            dest = mp3Path;
            throwIfCancelled(signal);
            setProgress({ stage: "transcribing" });
            let transcription;
            try {
                transcription = await transcribe(mp3Path, {
                    language: "auto",
                    signal,
                    durationSeconds: exported.durationSeconds > 0 ? exported.durationSeconds : undefined,
                    userId: user.id || undefined,
                    email: user.email,
                    token: user.token,
                });
            }
            catch (e) {
                const authMsg = authErrorMessage(e);
                if (authMsg)
                    throw new Error(authMsg);
                throw e;
            }
            throwIfCancelled(signal);
            const normalized = normalize(transcription);
            const tokens = tokensFromTranscription(normalized);
            const hasSpeech = tokens.some((token) => token.type !== "spacing" &&
                typeof token.start === "number" &&
                typeof token.end === "number" &&
                token.end > token.start);
            if (!hasSpeech) {
                const err = new Error("No speech found in the In/Out range. Check the audio and try again.");
                err.soft = true;
                throw err;
            }
            const ranges = silenceRangesFromTokens(tokens, {
                minGapSec: minGap,
                padSec: pad,
                durationSec: exported.durationSeconds > 0 ? exported.durationSeconds : undefined,
            });
            if (!ranges.length) {
                setSummary(`No pauses longer than ${minGap.toFixed(1)}s.`);
                showStatus(`No pauses longer than ${minGap.toFixed(1)}s.`, "info", 5000);
                try {
                    window.dispatchEvent(new Event("aitools-credits-changed"));
                }
                catch {
                    // ignore
                }
                return;
            }
            setProgress({ stage: "creating" });
            throwIfCancelled(signal);
            const cut = await Motionflow.PPRO.removeSilences({
                ranges,
                offset: exported.offset ?? 0,
            });
            if (!cut.ok) {
                throw new Error(cut.error || "Could not cut silence on the timeline.");
            }
            const data = cut.data;
            if (data && data.ok === false) {
                const err = new Error(data.message || "Could not cut silence on the timeline.");
                if (data.reason === "NO_ACTIVE_SEQUENCE" || data.reason === "PPRO_ONLY") {
                    err.soft = true;
                    err.reason = data.reason;
                }
                throw err;
            }
            const removed = data?.removed ?? 0;
            if (removed <= 0) {
                const detail = data?.message ||
                    `Found ${ranges.length} pauses, but Premiere did not cut the clips.`;
                setSummary(detail);
                showStatus(detail, "error", 7000);
                return;
            }
            const label = removed === 1 ? "1 pause" : `${removed} pauses`;
            setSummary(`Cut ${label}.`);
            showStatus(`Cut ${label}.`, "success", 5000);
            try {
                window.dispatchEvent(new Event("aitools-credits-changed"));
            }
            catch {
                // ignore
            }
        }
        finally {
            cleanupTempAudio([source, dest]);
        }
    };
    const handleCancel = () => {
        abortRef.current?.abort();
    };
    const handleRemove = async () => {
        if (progress)
            return;
        const range = await workRange.refresh();
        if (range.error) {
            showError(range.error);
            return;
        }
        if (generationsLeft < range.cost) {
            showError("No generations left. Upgrade your plan or buy extra credits.");
            return;
        }
        try {
            const controller = new AbortController();
            abortRef.current = controller;
            await run(controller.signal);
        }
        catch (e) {
            if (!isAbortLikeError(e)) {
                showError(e);
                if (!isSoftHostError(e))
                    reportSupportError("silence.remove", e);
            }
        }
        finally {
            abortRef.current = null;
            setProgress(null);
        }
    };
    return (_jsxs("div", { className: "silence-app", children: [_jsx("div", { className: "silence-app__body thin-scroll", children: _jsxs("div", { className: "card silence-app__card", children: [_jsx("div", { className: "silence-app__card-head", children: _jsxs("p", { className: "silence-app__card-title", children: [_jsx(Scissors, { className: "size-3.5", strokeWidth: 2.25 }), "Silence Remover"] }) }), _jsx("p", { className: "silence-app__lead", children: "Transcribes the sequence In/Out, finds pauses between words, and cuts them with the razor on every unlocked track." }), _jsxs("div", { className: "silence-app__sliders", children: [_jsxs("div", { className: "field-row silence-app__slider-row", children: [_jsx("span", { className: "field-row__label", children: "Pause" }), _jsx("input", { type: "range", className: "range", min: MIN_GAP_MIN, max: MIN_GAP_MAX, step: 0.1, value: minGap, onChange: (e) => setMinGap(Number(e.target.value)), "aria-label": "Minimum pause to cut", style: rangeFillStyle(minGap, MIN_GAP_MIN, MIN_GAP_MAX) }), _jsxs("span", { className: "silence-app__value", children: [minGap.toFixed(1), "s"] })] }), _jsxs("div", { className: "field-row silence-app__slider-row", children: [_jsx("span", { className: "field-row__label", children: "Pad" }), _jsx("input", { type: "range", className: "range", min: PAD_MIN, max: PAD_MAX, step: 0.02, value: pad, onChange: (e) => setPad(Number(e.target.value)), "aria-label": "Padding kept around each word", style: rangeFillStyle(pad, PAD_MIN, PAD_MAX) }), _jsxs("span", { className: "silence-app__value", children: [pad.toFixed(2), "s"] })] })] }), summary ? _jsx("p", { className: "silence-app__summary", children: summary }) : null] }) }), _jsxs("div", { className: "silence-app__footer", children: [_jsx("button", { type: "button", className: "btn btn--primary silence-app__run", disabled: !!progress || generationsLeft <= 0, onClick: () => void handleRemove(), children: withGenerationCostLabel("Remove silence", workRange.cost) }), _jsx("p", { className: "silence-app__hint", children: "Set In and Out around the section you want tightened." })] }), _jsx(ProgressDialog, { progress: progress, onCancel: handleCancel, title: "Removing silence", steps: PROGRESS_STEPS })] }));
};
