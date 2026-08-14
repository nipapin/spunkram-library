import { ArrowLeft, ArrowRight, AudioWaveform, ChevronUp, Download, Globe } from "lucide-react";
import { useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { SRC_LANGS, TRANSLATE_TARGETS } from "../data/languages";
import { rangeFillStyle } from "../utils/rangeFillStyle";
import type { AppliedSegmentConfig, Caption, GroupingMode } from "../utils/transcribe";
import "./CaptionsTab.scss";
import { EditableCaption } from "./EditableCaption";
import { PresetGrid } from "./PresetGrid";
import type { DescribeProgress, DescribeType } from "./ProgressDialog";
import { StyleTab } from "./StyleTab";

interface CaptionsTabProps {
  captions: Caption[];
  meta: { type: DescribeType; offset: number };
  progress: DescribeProgress | null;
  sentenceCount: number;
  fontSize: number;
  highlightIndex: number | null;
  screen: "landing" | "editor";
  canLoad: boolean;
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
  { value: "sentence", label: "Sentences" },
  { value: "words", label: "Words" },
  { value: "custom", label: "Custom" },
];

export const CaptionsTab = ({
  captions,
  meta,
  progress,
  sentenceCount,
  fontSize,
  highlightIndex,
  screen,
  canLoad,
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

  // текущие настройки уже применены к хосту — кнопка Update не имеет смысла.
  // Для custom сравниваем ещё и lines/characters, не только mode (иначе смена
  // слайдеров внутри custom не считалась бы изменением)
  const isResegmentApplied =
    !!appliedResegmentConfig &&
    appliedResegmentConfig.mode === mode &&
    (mode !== "custom" || (appliedResegmentConfig.lines === lines && appliedResegmentConfig.characters === characters));

  // лендинг — явный screen из App (не деривируем из captions.length), чтобы
  // Back мог вернуть сюда без сброса данных
  if (screen === "landing") {
    return (
      <div className="captions-tab captions-tab--landing">
        <div className="captions-tab__landing-body thin-scroll">
          <PresetGrid />
        </div>

        <div className="captions-tab__landing-footer">
          <div className="card captions-tab__lang-row">
            <Globe size={15} />
            <select className="select" value={srcLang} onChange={(e) => updateSrcLang(e.target.value)}>
              {SRC_LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <ArrowRight size={13} className="captions-tab__lang-arrow" />
            <select
              className="select"
              value={translateTo}
              onChange={(e) => updateTranslateTo(e.target.value)}
              style={{ color: translateTo === "off" ? undefined : "var(--accent)" }}
            >
              {TRANSLATE_TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="captions-tab__landing-actions">
            <button className="btn btn--primary captions-tab__transcribe-btn" onClick={onDescribe} disabled={!!progress}>
              {progress ? <span className="spinner" /> : <AudioWaveform size={15} />}
              {progress ? "Working…" : transcribeLabel}
            </button>
            <button
              type="button"
              className="btn btn--ghost captions-tab__load-btn"
              onClick={onLoad}
              disabled={!canLoad || !!progress}
              data-tooltip={canLoad ? "Load captions found in this composition" : "No captions found in this composition"}
              aria-label="Load existing captions"
            >
              <Download size={15} />
              Load
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
          data-tooltip="Back"
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

      {subTab === "style" ? (
        <StyleTab />
      ) : (
        <>
          <div className="captions-tab__list thin-scroll">
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

          <div className={`card captions-tab__resegment ${resegmentOpen ? "captions-tab__resegment--open" : ""}`}>
            <div className="captions-tab__resegment-head" onClick={() => setResegmentOpen((v) => !v)} aria-expanded={resegmentOpen}>
              <span className="captions-tab__section-label">RE-SEGMENT</span>
              <ChevronUp
                size={14}
                className={`captions-tab__resegment-chevron ${resegmentOpen ? "" : "captions-tab__resegment-chevron--closed"}`}
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
  );
};
