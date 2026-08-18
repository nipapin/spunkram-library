import { Check } from "lucide-react";
import "./ProgressDialog.scss";

export type DescribeType = "composition" | "selected";
export type DescribeStage =
  | "rendering"
  | "converting"
  | "transcribing"
  | "creating"
  | "summarizing"
  | "loading";
export interface DescribeProgress {
  stage: DescribeStage;
}

export type ProgressStep = { stage: DescribeStage; label: string; hint: string };

export const LOAD_CAPTIONS_PROGRESS_STEPS: ProgressStep[] = [
  { stage: "loading", label: "Loading captions", hint: "Reading captions from the selected MOGRT" },
];

export const CAPTIONS_PROGRESS_STEPS: ProgressStep[] = [
  { stage: "rendering", label: "Rendering", hint: "Exporting composition to file" },
  { stage: "converting", label: "Converting audio", hint: "Transcoding to mp3" },
  { stage: "transcribing", label: "Transcribing", hint: "Speech recognition" },
  { stage: "creating", label: "Creating captions", hint: "Inserting captions into the project" },
];

export const CHAPTERS_PROGRESS_STEPS: ProgressStep[] = [
  { stage: "rendering", label: "Rendering", hint: "Exporting composition to file" },
  { stage: "converting", label: "Converting audio", hint: "Transcoding to mp3" },
  { stage: "transcribing", label: "Transcribing", hint: "Speech recognition" },
  { stage: "summarizing", label: "Generating chapters", hint: "Summarizing by timings" },
];

interface ProgressDialogProps {
  progress: DescribeProgress | null;
  onCancel?: () => void;
  title?: string;
  steps?: ProgressStep[];
}

export const ProgressDialog = ({
  progress,
  onCancel,
  title = "Generating…",
  steps = CAPTIONS_PROGRESS_STEPS,
}: ProgressDialogProps) => {
  if (!progress) return null;

  const activeIndex = steps.findIndex((s) => s.stage === progress.stage);
  const step = steps[activeIndex] ?? steps[0];

  return (
    <div className="modal-overlay">
      <div className="progress-dialog">
        <div className="progress-dialog__head">
          <p className="progress-dialog__title">{title}</p>
          <p className="progress-dialog__subtitle">
            Step {activeIndex + 1} of {steps.length}
          </p>
        </div>

        <div className="progress-dialog__steps">
          {steps.map((s, i) => {
            const done = i < activeIndex;
            const active = i === activeIndex;
            return (
              <div
                key={s.stage}
                className={`progress-dialog__step ${done ? "progress-dialog__step--done" : ""} ${
                  active ? "progress-dialog__step--active" : ""
                }`}
              >
                <div className="progress-dialog__step-rail">
                  <div className="progress-dialog__step-dot">{done ? <Check size={12} /> : i + 1}</div>
                  {i < steps.length - 1 && <div className="progress-dialog__step-line" />}
                </div>
                <div className="progress-dialog__step-body">
                  <p className="progress-dialog__step-label">{s.label}</p>
                  <p className="progress-dialog__step-hint">{s.hint}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <p className="progress-dialog__current">{step.label}…</p>
          <div className="progress-bar">
            <div className="progress-bar__fill" />
          </div>
        </div>

        {onCancel && (
          <button type="button" className="btn btn--ghost progress-dialog__cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
