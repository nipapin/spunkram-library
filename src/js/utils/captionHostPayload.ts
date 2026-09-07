import { fs, os, path } from "../lib/cep/node";

export {
  captionsRawJsonToChunks,
  segmentTypeIndex,
  groupingModeFromSegmentType,
  toFullCaptionsRawData,
  toCaptionsRawData,
  captionBreaks,
  chunksToScribeWords,
  syncRawWordsFromChunks,
  withSyncedRawWords,
  packTranscriptionToChunks,
  patchCaptionsRawData,
  buildRelativeWordTimings,
  toHostCaptionPayload,
} from "motionflow-ai";
export type { CaptionWordTiming, HostCaptionPayload } from "motionflow-ai";

/**
 * CEP-only: write payload to a temp JSON (ASCII + \\uXXXX) for ExtendScript.
 */
export const withHostJsonFile = async <T>(
  data: unknown,
  run: (filePath: string) => Promise<T>,
): Promise<T> => {
  const dir = path.join(os.tmpdir(), "aitools-cep");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(
    dir,
    `host-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  const asciiJson = JSON.stringify(data).replace(/[\u007f-\uffff]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${hex}`;
  });
  fs.writeFileSync(filePath, asciiJson, "utf8");
  try {
    return await run(filePath.replace(/\\/g, "/"));
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // temp cleanup best-effort
    }
  }
};
