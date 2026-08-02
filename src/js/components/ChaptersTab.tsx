import { ArrowLeft, Bookmark, Check, Copy, Globe, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { SRC_LANGS, TRANSLATE_TARGETS } from "../data/languages";
import { EditableChapterRow } from "./EditableChapterRow";
import { GeneratedTextSection } from "./GeneratedTextSection";
import type { DescribeProgress } from "./ProgressDialog";
import "./ChaptersTab.scss";
import { TitleSuggestions } from "./TitleSuggestions";
import { copyToClipboard } from "../utils/clipboard";
import { formatChaptersForYoutube, MIN_YOUTUBE_CHAPTERS, type Chapter } from "../utils/chapters";

interface ChaptersTabProps {
  screen: "landing" | "results";
  progress: DescribeProgress | null;
  onGenerate: () => void;
  onBack: () => void;
  titles: string[];
  onEditTitle: (index: number, title: string) => void;
  onRegenerateTitles: () => void;
  regeneratingTitles: boolean;
  description: string;
  onUpdateDescription: (value: string) => void;
  onRegenerateDescription: () => void;
  regeneratingDescription: boolean;
  tags: string;
  onUpdateTags: (value: string) => void;
  onRegenerateTags: () => void;
  regeneratingTags: boolean;
  chapters: Chapter[];
  onUpdateChapterTitle: (id: string, title: string) => void;
  onUpdateChapterTime: (id: string, seconds: number) => void;
  onDeleteChapter: (id: string) => void;
  onAddChapter: () => void;
  onRegenerateChapters: () => void;
  regeneratingChapters: boolean;
  onCopyDescription: () => Promise<boolean>;
  onAddMarkers: () => Promise<boolean>;
  addingMarkers: boolean;
}

const HOUR = 3600;

export const ChaptersTab = ({
  screen,
  progress,
  onGenerate,
  onBack,
  titles,
  onEditTitle,
  onRegenerateTitles,
  regeneratingTitles,
  description,
  onUpdateDescription,
  onRegenerateDescription,
  regeneratingDescription,
  tags,
  onUpdateTags,
  onRegenerateTags,
  regeneratingTags,
  chapters,
  onUpdateChapterTitle,
  onUpdateChapterTime,
  onDeleteChapter,
  onAddChapter,
  onRegenerateChapters,
  regeneratingChapters,
  onCopyDescription,
  onAddMarkers,
  addingMarkers,
}: ChaptersTabProps) => {
  const { srcLang, translateTo, updateSrcLang, updateTranslateTo } = useConfiguration();
  const [chaptersCopied, setChaptersCopied] = useState(false);
  const [descriptionCopied, setDescriptionCopied] = useState(false);
  const [markersAdded, setMarkersAdded] = useState(false);

  const sortedChapters = useMemo(() => [...chapters].sort((a, b) => a.time - b.time), [chapters]);
  const useHours = sortedChapters.length > 0 && sortedChapters[sortedChapters.length - 1].time >= HOUR;

  // копирует только список таймкодов (напр. для закреплённого комментария) —
  // без основного текста описания
  const handleCopyChaptersOnly = async () => {
    if (!chapters.length) return;
    const ok = await copyToClipboard(formatChaptersForYoutube(chapters));
    if (!ok) return;
    setChaptersCopied(true);
    setTimeout(() => setChaptersCopied(false), 1500);
  };

  // главная кнопка футера — цельный блок (текст + таймкоды) для поля Description на YouTube
  const handleCopyDescription = async () => {
    const ok = await onCopyDescription();
    if (!ok) return;
    setDescriptionCopied(true);
    setTimeout(() => setDescriptionCopied(false), 1500);
  };

  const handleAddMarkers = async () => {
    const ok = await onAddMarkers();
    if (!ok) return;
    setMarkersAdded(true);
    setTimeout(() => setMarkersAdded(false), 1500);
  };

  if (screen === "landing") {
    return (
      <div className="chapters-tab chapters-tab--landing">
        <div className="chapters-tab__landing-body thin-scroll">
          <div className="card chapters-tab__intro">
            <Sparkles size={26} className="chapters-tab__intro-icon" />
            <p className="chapters-tab__intro-title">Generate YouTube chapters</p>
            <p className="chapters-tab__intro-text">
              Transcribes the timeline audio and generates a title, description, tags and chapters —
              ready to paste into YouTube.
            </p>
          </div>
        </div>

        <div className="chapters-tab__landing-footer">
          <div className="card chapters-tab__lang-row">
            <Globe size={15} />
            <select className="select" value={srcLang} onChange={(e) => updateSrcLang(e.target.value)}>
              {SRC_LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
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

          <button
            type="button"
            className="btn btn--primary btn--full chapters-tab__generate-btn"
            onClick={onGenerate}
            disabled={!!progress}
          >
            {progress ? <span className="spinner" /> : <Sparkles size={15} />}
            {progress ? "Working…" : "Generate Chapters"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chapters-tab">
      <div className="tabs">
        <button
          type="button"
          className="icon-btn chapters-tab__back"
          data-tooltip="Back"
          onClick={onBack}
          aria-label="Back to main screen"
        >
          <ArrowLeft size={15} />
        </button>
        <span className="chapters-tab__header-title">Chapters</span>
      </div>

      <div className="chapters-tab__results-body thin-scroll">
        <TitleSuggestions
          titles={titles}
          regenerating={regeneratingTitles}
          onEditTitle={onEditTitle}
          onRegenerate={onRegenerateTitles}
        />

        <GeneratedTextSection
          label="DESCRIPTION"
          value={description}
          placeholder="Video description"
          rows={4}
          onChange={onUpdateDescription}
          onRegenerate={onRegenerateDescription}
          regenerating={regeneratingDescription}
        />

        <GeneratedTextSection
          label="TAGS"
          value={tags}
          placeholder="tag1, tag2, tag3"
          rows={2}
          onChange={onUpdateTags}
          onRegenerate={onRegenerateTags}
          regenerating={regeneratingTags}
        />

        <div className="chapters-tab__chapters-section">
          <div className="chapters-tab__section-head">
            <span className="chapters-tab__section-label">
              CHAPTERS · {chapters.length}
            </span>
            <div className="chapters-tab__section-actions">
              <button
                type="button"
                className="btn btn--ghost chapters-tab__icon-action"
                onClick={handleCopyChaptersOnly}
                disabled={!chapters.length}
                data-tooltip={chaptersCopied ? "Copied!" : "Copy chapters only"}
                aria-label="Copy chapters only"
              >
                {chaptersCopied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <button
                type="button"
                className="btn btn--ghost chapters-tab__icon-action"
                onClick={onRegenerateChapters}
                disabled={regeneratingChapters}
                data-tooltip="Regenerate chapters"
                aria-label="Regenerate chapters"
              >
                {regeneratingChapters ? <span className="spinner" /> : <RefreshCw size={12} />}
              </button>
              <button type="button" className="btn btn--ghost chapters-tab__add-btn" onClick={onAddChapter}>
                <Plus size={12} />
                Add
              </button>
            </div>
          </div>

          {chapters.length < MIN_YOUTUBE_CHAPTERS && (
            <p className="chapters-tab__warning">
              YouTube needs at least {MIN_YOUTUBE_CHAPTERS} chapters to display them as timestamps.
            </p>
          )}

          {sortedChapters.map((chapter, index) => (
            <EditableChapterRow
              key={chapter.id}
              chapter={chapter}
              order={index}
              useHours={useHours}
              canDelete={chapters.length > 1}
              onUpdateTitle={onUpdateChapterTitle}
              onUpdateTime={onUpdateChapterTime}
              onDelete={onDeleteChapter}
            />
          ))}

          <p className="chapters-tab__hint">
            The first chapter is always copied as {useHours ? "00:00:00" : "00:00"} — YouTube requires
            timestamps to start at zero.
          </p>
        </div>
      </div>

      <div className="chapters-tab__results-footer">
        <button
          type="button"
          className="btn btn--secondary chapters-tab__markers-btn"
          onClick={handleAddMarkers}
          disabled={!chapters.length || addingMarkers}
          data-tooltip="Add a marker per chapter to the composition/sequence"
        >
          {addingMarkers ? <span className="spinner" /> : markersAdded ? <Check size={15} /> : <Bookmark size={15} />}
          {addingMarkers ? "Adding…" : markersAdded ? "Added!" : "Add Markers"}
        </button>
        <button
          type="button"
          className="btn btn--primary chapters-tab__copy-btn"
          onClick={handleCopyDescription}
          disabled={!description.trim() && !chapters.length}
          data-tooltip="Copies description text + chapter timestamps + tags as #hashtags"
        >
          {descriptionCopied ? <Check size={15} /> : <Copy size={15} />}
          {descriptionCopied ? "Copied!" : "Copy Description"}
        </button>
      </div>
    </div>
  );
};
