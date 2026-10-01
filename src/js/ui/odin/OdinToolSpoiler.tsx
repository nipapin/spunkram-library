import { Fragment, useState } from "react";
import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyEnd,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Bookmark,
  BookmarkPlus,
  Copy,
  Crosshair,
  Languages,
  MoveHorizontal,
  Proportions,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Timer,
  Trash2,
  Trash,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { MotionFlow } from "@/sdk";
import { usePanelUI } from "@/lib/panel-ui-context";
import type { OdinHost } from "./use-odin-host";

type Tool = readonly [id: string, label: string, icon: LucideIcon];
const aeTools: Tool[] = [
  ["time_remap_loop_aa", "Time Loop", Repeat2],
  ["time_remap_simple", "Time Stretch", MoveHorizontal],
  ["time_remap_in_out_reverse", "Timing: IN/OUT", Timer],
  ["reverse_timing", "Time Reverse", Undo2],
  ["resize_items", "Resize Items", Proportions],
  ["fix_arabic_lang", "Fix to Arabic Glyphs", Languages],
  ["remove_unused", "Remove Unused [Odin Pro]", Trash],
  ["remove_unused_selection", "Remove Unused [Selected]", Trash2],
];
const prTools: Tool[] = [
  ["consolidate_dups", "Consolidate Duplicates", Copy],
  ["resize_items", "Resize Items", Proportions],
];
const presetTools: Tool[] = [
  ["open_anchor_point", "Anchor Point", Crosshair],
  ["add_in_marker", "Add In Marker", Bookmark],
  ["add_in_marker_plus", "Add In Marker with Duration", BookmarkPlus],
  ["add_middle_marker", "Add Middle Marker", Bookmark],
  ["add_out_marker", "Add Out Marker", Bookmark],
  [
    "align_in_play_head",
    "Align In Point to Play Head",
    AlignHorizontalJustifyStart,
  ],
  [
    "align_out_play_head",
    "Align Out Point to Play Head",
    AlignHorizontalJustifyEnd,
  ],
  ["shift_in_forward", "Shift In Points Forward", ArrowRightFromLine],
  ["shift_in_backward", "Shift In Points Backward", ArrowLeftToLine],
  ["shift_out_forward", "Shift Out Points Forward", ArrowRightToLine],
  ["shift_out_backward", "Shift Out Points Backward", ArrowLeftFromLine],
  ["stagger_layers_backward", "Stagger Layers Backward", SkipBack],
  ["stagger_layers_forward", "Stagger Layers Forward", SkipForward],
  ["stagger_layers_random", "Stagger Layers Random", Shuffle],
];

export function OdinToolSpoiler({
  host,
  engine,
  packName,
}: {
  host: OdinHost;
  engine?: string;
  packName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState(1);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const { showStatus } = usePanelUI();
  const normalizedEngine = (engine || "_COMPOSER").toUpperCase();
  const presetManager =
    normalizedEngine === "_PRESET_MANAGER" ||
    normalizedEngine === "_CM_PRESET_MANAGER";

  async function run(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      if (host === "AEFT" && id === "remove_unused") {
        const root = await MotionFlow.AE.setComposerRootFolder(
          packName || "Odin Pro",
        );
        if (!root.ok) throw new Error(root.error);
      }
      const result = await (host === "AEFT"
        ? MotionFlow.AE.tools.run(id)
        : MotionFlow.PPRO.tools.run(id));
      if (!result.ok) throw new Error(result.error);
      showStatus("Done", "success");
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Could not run this tool",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="odin-tool-spoiler" aria-label="Host tools">
      {normalizedEngine === "_COMPOSER" &&
        (host === "AEFT" ? aeTools : prTools).map(([id, label, Icon]) => (
          <Fragment key={id}>
            {id === "remove_unused" && (
              <span className="odin-tools__divider" role="separator" />
            )}
            <button
              type="button"
              className="odin-tool"
              aria-label={label}
              data-tooltip={label}
              disabled={busy}
              onClick={() => void run(id)}
            >
              <Icon size={18} />
            </button>
          </Fragment>
        ))}
      {host === "AEFT" && presetManager && (
        <>
          {presetTools.map(([id, label, Icon], index) => (
            <Fragment key={id}>
              {[1, 7, 9, 11].includes(index) && (
                <span className="odin-tools__divider" role="separator" />
              )}
              <div className="odin-preset-tool">
                <button
                  type="button"
                  className="odin-tool"
                  aria-label={label}
                  data-tooltip={label}
                  aria-expanded={index === 0 ? anchorOpen : undefined}
                  onClick={
                    index === 0
                      ? () => setAnchorOpen((value) => !value)
                      : undefined
                  }
                >
                  <Icon size={18} />
                </button>
                {index === 0 && anchorOpen && (
                  <div className="odin-anchor-points">
                    {[
                      "Top left",
                      "Top",
                      "Top right",
                      "Left",
                      "Center",
                      "Right",
                      "Bottom left",
                      "Bottom",
                      "Bottom right",
                    ].map((position) => (
                      <button
                        key={position}
                        type="button"
                        aria-label={`Anchor: ${position}`}
                        data-tooltip={position}
                      >
                        •
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Fragment>
          ))}
          <label className="odin-frames">
            <input
              type="number"
              min={1}
              aria-label="Frames"
              value={frames}
              onChange={(event) =>
                setFrames(
                  Math.max(1, Math.floor(Number(event.target.value)) || 1),
                )
              }
            />
            {frames === 1 ? "Frame" : "Frames"}
          </label>
        </>
      )}
    </div>
  );
}
