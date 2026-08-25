import { Bookmark, Check, ChevronRight, Copy, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { EditableChapterRow } from "./EditableChapterRow";
import { GeneratedTextSection } from "./GeneratedTextSection";
import { LanguageRow } from "./LanguageRow";
import type { DescribeProgress } from "./ProgressDialog";
import "./ChaptersTab.scss";
import { TitleSuggestions } from "./TitleSuggestions";
import { copyToClipboard } from "../utils/clipboard";
import { formatChaptersForYoutube, MIN_YOUTUBE_CHAPTERS, type Chapter } from "../utils/chapters";

export type ChaptersHistoryPreview = {
  id: string;
  createdAt: number;
  label: string;
  chapterCount: number;
};

interface ChaptersTabProps {
  screen: "landing" | "results";
  progress: DescribeProgress | null;
  onGenerate: () => void;
  /** e.g. Generate ( 2 ) */
  generateLabel?: string;
  onBack: () => void;
  /** false when user has no generations left — Regenerate buttons stay disabled. */
  canRegenerate?: boolean;
  history?: ChaptersHistoryPreview[];
  onOpenHistory?: (id: string) => void;
  onDeleteHistory?: (id: string) => void;
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
  /** Normalize tags to `#tag1 #tag2` (e.g. on blur). */
  onNormalizeTags?: () => void;
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

function formatHistoryWhen(createdAt: number): string {
  const diff = Date.now() - createdAt;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d ago`;
  try {
    return new Date(createdAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export const ChaptersTab = ({
  screen,
  progress,
  onGenerate,
  generateLabel = "Generate",
  onBack,
  canRegenerate = true,
  history = [],
  onOpenHistory,
  onDeleteHistory,
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
  onNormalizeTags,
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
  const { chaptersSrcLang, chaptersTranslateTo, updateChaptersSrcLang, updateChaptersTranslateTo } =
    useConfiguration();
  const [chaptersCopied, setChaptersCopied] = useState(false);
  const [descriptionCopied, setDescriptionCopied] = useState(false);
  const [markersAdded, setMarkersAdded] = useState(false);

  const sortedChapters = useMemo(() => [...chapters].sort((a, b) => a.time - b.time), [chapters]);
  const useHours = sortedChapters.length > 0 && sortedChapters[sortedChapters.length - 1].time >= HOUR;

  // Same label as HistoryItem: first video title, else first chapter, else fallback
  const headerTitle = useMemo(() => {
    const title = titles.find((t) => t.trim())?.trim();
    if (title) return title;
    const firstChapter = sortedChapters[0]?.title?.trim();
    if (firstChapter) return firstChapter;
    return "Untitled chapters";
  }, [titles, sortedChapters]);

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
          {history.length === 0 && (
            <div className="card chapters-tab__intro">
              <Sparkles size={26} className="chapters-tab__intro-icon" />
              <p className="chapters-tab__intro-title">Generate YouTube chapters</p>
              <p className="chapters-tab__intro-text">
                Transcribes the timeline audio and generates a title, description, tags and chapters —
                ready to paste into YouTube.
              </p>
            </div>
          )}

          {history.length > 0 && (
            <div className="chapters-tab__history">
              <div className="chapters-tab__history-head">
                <span className="chapters-tab__section-label">History</span>
                <span className="chapters-tab__history-count">{history.length}</span>
              </div>
              <ul className="chapters-tab__history-list">
                {history.map((item) => (
                  <li key={item.id} className="chapters-tab__history-item">
                    <button
                      type="button"
                      className="chapters-tab__history-open"
                      onClick={() => onOpenHistory?.(item.id)}
                      disabled={!!progress}
                    >
                      <span className="chapters-tab__history-main">
                        <span className="chapters-tab__history-label">{item.label}</span>
                        <span className="chapters-tab__history-meta">
                          {item.chapterCount} chapter{item.chapterCount === 1 ? "" : "s"}
                          <span className="chapters-tab__history-dot" aria-hidden>
                            ·
                          </span>
                          {formatHistoryWhen(item.createdAt)}
                        </span>
                      </span>
                      <ChevronRight size={14} className="chapters-tab__history-chevron" />
                    </button>
                    {onDeleteHistory ? (
                      <button
                        type="button"
                        className="icon-btn chapters-tab__history-delete"
                        onClick={() => onDeleteHistory(item.id)}
                        disabled={!!progress}
                        data-tooltip="Remove from history"
                        aria-label={`Remove ${item.label} from history`}
                      >
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="chapters-tab__landing-footer">
          <LanguageRow
            srcLang={chaptersSrcLang}
            translateTo={chaptersTranslateTo}
            onSrcLang={updateChaptersSrcLang}
            onTranslateTo={updateChaptersTranslateTo}
            showArrow
          />

          <button
            type="button"
            className="btn btn--primary btn--full chapters-tab__generate-btn"
            onClick={onGenerate}
            disabled={!!progress}
          >
            {progress ? <span className="spinner" /> : <Sparkles size={15} />}
            {progress ? "Working…" : generateLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chapters-tab">
      <div className="chapters-tab__results-header">
        <span className="chapters-tab__results-title" title={headerTitle}>
          {headerTitle}
        </span>
        <button
          type="button"
          className="icon-btn chapters-tab__close"
          onClick={onBack}
          aria-label="Close"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="chapters-tab__results-body thin-scroll">
        <TitleSuggestions
          titles={titles}
          regenerating={regeneratingTitles}
          canRegenerate={canRegenerate}
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
          canRegenerate={canRegenerate}
        />

        <GeneratedTextSection
          label="TAGS"
          value={tags}
          placeholder="#spunkram #adobe #etc"
          rows={2}
          onChange={onUpdateTags}
          onBlur={onNormalizeTags}
          onRegenerate={onRegenerateTags}
          regenerating={regeneratingTags}
          canRegenerate={canRegenerate}
        />

        <div className="chapters-tab__chapters-section">
          <div className="chapters-tab__section-head">
            <span className="chapters-tab__section-label">
              CHAPTERS · {chapters.length}
            </span>
            <div className="chapters-tab__section-actions">
              <button
                type="button"
                className="icon-btn chapters-tab__icon-action"
                onClick={handleCopyChaptersOnly}
                disabled={!chapters.length}
                data-tooltip={chaptersCopied ? "Copied!" : "Copy chapters only"}
                aria-label="Copy chapters only"
              >
                {chaptersCopied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
              </button>
              <button
                type="button"
                className="icon-btn chapters-tab__icon-action"
                onClick={onRegenerateChapters}
                disabled={regeneratingChapters || !canRegenerate}
                data-tooltip={
                  !canRegenerate
                    ? "No generations left"
                    : regeneratingChapters
                      ? "Regenerating…"
                      : "Regenerate chapters (uses 1 generation)"
                }
                aria-label="Regenerate chapters"
              >
                {regeneratingChapters ? (
                  <span className="spinner" />
                ) : (
                  <RefreshCw size={14} strokeWidth={2} />
                )}
              </button>
              <button type="button" className="btn btn--ghost chapters-tab__add-btn" onClick={onAddChapter}>
                <Plus size={14} strokeWidth={2} />
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
