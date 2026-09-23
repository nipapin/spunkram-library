import { ArrowLeft, AudioWaveform, Download } from "lucide-react";
import { useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import type { AppliedSegmentConfig, Caption } from "../utils/transcribe";
import "./CaptionsTab.scss";
import { EditableCaption } from "./EditableCaption";
import { LanguageRow } from "./LanguageRow";
import { PresetGrid } from "./PresetGrid";
import type { DescribeProgress, DescribeType } from "./ProgressDialog";
import { StyleTab } from "./StyleTab";

interface CaptionsTabProps {
  captions: Caption[];
  meta: { type: DescribeType; offset: number };
  progress: DescribeProgress | null;
  loadingCaptions?: boolean;
  sentenceCount: number;
  fontSize: number;
  highlightIndex: number | null;
  screen: "landing" | "editor";
  onLoad: () => void;
  onDescribe: () => void;
  /** e.g. `Transcribe ( 2 )` from In/Out duration */
  transcribeLabel?: string;
  onBack: () => void;
  onSaveCaption: (caption: Caption, index: number, text: string) => void;
  onSeek: (caption: Caption, index: number) => void;
  onSplit: (caption: Caption, wordPos: number) => void;
  onMerge: (caption: Caption, dir: "prev" | "next") => void;
  onMoveWord: (caption: Caption, index: number, dir: "prev" | "next") => void;
  onSplitWords: (caption: Caption, index: number) => void;
  onUpdateResegment: () => void;
  appliedResegmentConfig: AppliedSegmentConfig | null;
  resegmenting: boolean;
}

type SubTab = "transcribe" | "style";

export const CaptionsTab = ({
  captions,
  meta,
  progress,
  loadingCaptions = false,
  sentenceCount,
  fontSize,
  highlightIndex,
  screen,
  onLoad,
  onDescribe,
  transcribeLabel = "Transcribe",
  onBack,
  onSaveCaption,
  onSeek,
  onSplit,
  onMerge,
  onMoveWord,
  onSplitWords,
  onUpdateResegment,
  appliedResegmentConfig,
  resegmenting,
}: CaptionsTabProps) => {
  const [subTab, setSubTab] = useState<SubTab>("transcribe");
  const { srcLang, translateTo, updateSrcLang, updateTranslateTo } = useConfiguration();

  // лендинг — явный screen из App (не деривируем из captions.length), чтобы
  // Back мог вернуть сюда без сброса данных
  if (screen === "landing") {
    return (
      <div className="captions-tab captions-tab--landing">
        <div className="captions-tab__landing-body thin-scroll">
          <PresetGrid />
        </div>

        <div className="captions-tab__landing-footer">
          <LanguageRow
            srcLang={srcLang}
            translateTo={translateTo}
            onSrcLang={updateSrcLang}
            onTranslateTo={updateTranslateTo}
            showArrow
          />

          <div className="captions-tab__landing-actions">
            <button
              type="button"
              className="btn btn--primary captions-tab__transcribe-btn"
              onClick={onDescribe}
              disabled={!!progress}
            >
              {progress ? <span className="spinner" /> : <AudioWaveform size={15} />}
              {progress ? "Working…" : transcribeLabel}
            </button>
            <button
              type="button"
              className="btn btn--ghost captions-tab__load-btn"
              onClick={onLoad}
              disabled={!!progress || loadingCaptions}
              aria-label="Load"
            >
              {loadingCaptions ? <span className="spinner" /> : <Download size={15} />}
              {loadingCaptions ? "Loading…" : "Load"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="captions-tab">
      <div className="tabs">
        <button
          type="button"
          className="icon-btn captions-tab__back"
          onClick={onBack}
          aria-label="Back to main screen"
        >
          <ArrowLeft size={15} />
        </button>
        <button
          className={`tab ${subTab === "transcribe" ? "tab--active" : ""}`}
          aria-selected={subTab === "transcribe"}
          onClick={() => setSubTab("transcribe")}
        >
          Transcribe
        </button>
        <button
          className={`tab ${subTab === "style" ? "tab--active" : ""}`}
          aria-selected={subTab === "style"}
          onClick={() => setSubTab("style")}
        >
          Styles
        </button>
      </div>

      <div className="captions-tab__panel">
        {subTab === "style" ? (
          <StyleTab
            onUpdateResegment={onUpdateResegment}
            appliedResegmentConfig={appliedResegmentConfig}
            resegmenting={resegmenting}
          />
        ) : (
          <div className="captions-tab__list">
            <div className="captions-tab__transcript-head">
              <span className="captions-tab__section-label">
                TRANSCRIPT · {captions.length} SEGMENT{captions.length === 1 ? "" : "S"}
              </span>
            </div>
            {captions.map((caption, index) => (
              <EditableCaption
                key={index}
                index={index}
                caption={caption}
                fontSize={fontSize}
                offset={meta.offset}
                sentenceCount={sentenceCount}
                captionCount={captions.length}
                highlighted={index === highlightIndex}
                onSave={(c, text) => onSaveCaption(c, index, text)}
                onSeek={(c) => onSeek(c, index)}
                onSplit={onSplit}
                onMerge={onMerge}
                onMoveWord={onMoveWord}
                onSplitWords={onSplitWords}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
