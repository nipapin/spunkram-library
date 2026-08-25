import { ArrowLeft, AudioWaveform, ChevronUp, Download } from "lucide-react";
import { useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { rangeFillStyle } from "../utils/rangeFillStyle";
import type { AppliedSegmentConfig, Caption, GroupingMode } from "../utils/transcribe";
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

const SEG_MODES: { value: GroupingMode; label: string }[] = [
  { value: "words", label: "Words" },
  { value: "custom", label: "Custom" },
];

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
  const [resegmentOpen, setResegmentOpen] = useState(false);
  const {
    mode,
    lines,
    characters,
    updateMode,
    updateLines,
    updateCharacters,
    srcLang,
    translateTo,
    updateSrcLang,
    updateTranslateTo,
  } = useConfiguration();

  // Sentence mode is hidden from the mode picker but still works for existing data.
  // Don't auto-migrate: split/merge operations require sentence-level backing data.

  // текущие настройки уже применены к хосту — кнопка Update не имеет смысла.
  // Для custom сравниваем ещё и lines/characters, не только mode (иначе смена
  // слайдеров внутри custom не считалась бы изменением)
  const isResegmentApplied =
    !!appliedResegmentConfig &&
    appliedResegmentConfig.mode === mode &&
    (mode !== "custom" ||
      (appliedResegmentConfig.lines === lines && appliedResegmentConfig.characters === characters));

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
          <StyleTab />
        ) : (
          <>
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

            <div
              className={`card captions-tab__resegment ${resegmentOpen ? "captions-tab__resegment--open" : ""}`}
            >
              <div
                className="captions-tab__resegment-head"
                onClick={() => setResegmentOpen((v) => !v)}
                aria-expanded={resegmentOpen}
              >
                <span className="captions-tab__section-label">RE-SEGMENT</span>
                <ChevronUp
                  size={14}
                  className={`captions-tab__resegment-chevron ${resegmentOpen ? "captions-tab__resegment-chevron--open" : ""}`}
                />
              </div>
              {resegmentOpen && (
                <>
                  <div className="btn-group captions-tab__resegment-modes">
                    {SEG_MODES.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        className={`btn-group__item ${mode === m.value ? "btn-group__item--active-fill" : ""}`}
                        onClick={() => updateMode(m.value)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {mode === "custom" && (
                    <>
                      <div className="captions-tab__resegment-row">
                        <span className="captions-tab__resegment-label">Lines / caption</span>
                        <input
                          type="range"
                          className="range"
                          min={1}
                          max={4}
                          value={lines}
                          onChange={(e) => updateLines(Number(e.target.value))}
                          style={rangeFillStyle(lines, 1, 4)}
                        />
                        <span className="captions-tab__resegment-value">{lines}</span>
                      </div>
                      <div className="captions-tab__resegment-row">
                        <span className="captions-tab__resegment-label">Characters / line</span>
                        <input
                          type="range"
                          className="range"
                          min={4}
                          max={40}
                          value={characters}
                          onChange={(e) => updateCharacters(Number(e.target.value))}
                          style={rangeFillStyle(characters, 4, 40)}
                        />
                        <span className="captions-tab__resegment-value">{characters}</span>
                      </div>
                    </>
                  )}
                  {!isResegmentApplied && (
                    <button
                      type="button"
                      className="btn btn--primary btn--full captions-tab__resegment-update"
                      onClick={onUpdateResegment}
                      disabled={resegmenting}
                    >
                      {resegmenting ? (
                        <>
                          <span className="spinner" />
                          Updating…
                        </>
                      ) : (
                        "Update"
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
