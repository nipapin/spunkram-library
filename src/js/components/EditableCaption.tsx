import { Check, Pencil, X } from "lucide-react";
import { memo, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { formatTimestamp, type Caption } from "../utils/transcribe";
import "./EditableCaption.scss";

interface EditableCaptionProps {
  caption: Caption;
  index: number;
  fontSize: number;
  offset: number;
  sentenceCount: number;
  captionCount: number;
  highlighted?: boolean;
  onSave: (caption: Caption, text: string) => void;
  onSeek: (caption: Caption) => void;
  onSplit: (caption: Caption, wordPos: number) => void;
  onMerge: (caption: Caption, dir: "prev" | "next") => void;
  onMoveWord: (caption: Caption, index: number, dir: "prev" | "next") => void;
  onSplitWords: (caption: Caption, index: number) => void;
}

type MenuState = { x: number; y: number; wordPos: number } | null;

// memo + локальный стейт: ввод перерисовывает только этот блок
export const EditableCaption = memo(function EditableCaption({
  caption,
  index,
  fontSize,
  offset,
  sentenceCount,
  captionCount,
  highlighted,
  onSave,
  onSeek,
  onSplit,
  onMerge,
  onMoveWord,
  onSplitWords,
}: EditableCaptionProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(caption.text);
  const [menu, setMenu] = useState<MenuState>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setText(caption.text);
  }, [caption.text, editing]);

  // закрываем контекстное меню по клику вне него или по Escape (раньше это делал MUI Menu)
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const startEdit = () => {
    setText(caption.text);
    setEditing(true);
  };
  const save = () => {
    setEditing(false);
    if (text.trim() !== caption.text.trim()) onSave(caption, text);
  };
  const cancel = () => {
    setEditing(false);
    setText(caption.text);
  };

  // Ctrl/Cmd+Enter — быстрое сохранение без мышки, обычный Enter оставляем
  // для перевода строки в textarea
  const onTextareaKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  const openMenu = (e: MouseEvent, wordPos: number) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, wordPos });
  };
  const closeMenu = () => setMenu(null);

  // клик по карточке — переход плейхеда хоста на начало сегмента; игнорируем клики
  // по кнопкам редактирования, textarea и контекстному меню, чтобы не мешать им
  const onCardClick = (e: MouseEvent) => {
    if (editing) return;
    const target = e.target as HTMLElement;
    if (target.closest(".caption-card__actions") || target.closest(".menu")) return;
    onSeek(caption);
  };

  // ПКМ-меню доступно для любого caption со словами (все режимы)
  const hasWords = !editing && !!caption.words?.length;
  // custom-режим: разбиваем плоский список слов на строки по lineWordCounts,
  // чтобы отображение уважало реально посчитанные lines/characters, а не
  // просто переносило слова по ширине карточки
  const wordLineGroups =
    hasWords && caption.lineWordCounts && caption.lineWordCounts.length > 1
      ? (() => {
          const groups: { word: NonNullable<typeof caption.words>[number]; pos: number }[][] = [];
          let pos = 0;
          for (const count of caption.lineWordCounts) {
            const group = caption.words!.slice(pos, pos + count).map((word, i) => ({ word, pos: pos + i }));
            groups.push(group);
            pos += count;
          }
          return groups;
        })()
      : null;
  const isSentence = caption.edit.target === "sentence";
  const sentenceIndex = caption.edit.target === "sentence" ? caption.edit.index : -1;
  const canSplit = !!menu && isSentence && menu.wordPos > 0 && menu.wordPos < (caption.words?.length ?? 0);
  const canMergePrev = isSentence && sentenceIndex > 0;
  const canMergeNext = isSentence && sentenceIndex >= 0 && sentenceIndex < sentenceCount - 1;
  const canMovePrev = index > 0 && (caption.words?.length ?? 0) > 0;
  const canMoveNext = index < captionCount - 1 && (caption.words?.length ?? 0) > 0;
  const canSplitWords = (caption.words?.length ?? 0) > 1;

  return (
    <div
      data-caption-index={index}
      className={`caption-card ${editing ? "caption-card--editing" : ""} ${highlighted ? "caption-card--highlight" : ""}`}
      onClick={onCardClick}
    >
      <div className="caption-card__head">
        <p className="caption-card__time">
          {formatTimestamp(caption.timestamp[0] + offset)} — {formatTimestamp(caption.timestamp[1] + offset)}
        </p>
        <div className="caption-card__actions">
          {editing ? (
            <>
              <button className="icon-btn" data-tooltip="Save" onClick={save} style={{ color: "var(--accent)" }}>
                <Check size={14} />
              </button>
              <button className="icon-btn" data-tooltip="Cancel" onClick={cancel}>
                <X size={14} />
              </button>
            </>
          ) : (
            <button className="icon-btn" data-tooltip="Edit" onClick={startEdit}>
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="caption-card__body">
        {editing ? (
          <textarea
            className="caption-card__textarea"
            autoFocus
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onTextareaKeyDown}
            style={{ fontSize }}
          />
        ) : hasWords && wordLineGroups ? (
          wordLineGroups.map((group, lineIndex) => (
            <div className="caption-card__words" key={lineIndex}>
              {group.map(({ word, pos }) => (
                <span
                  key={word.gi}
                  className="caption-card__word"
                  onContextMenu={(e) => openMenu(e, pos)}
                  style={{ fontSize }}
                >
                  {word.text}
                </span>
              ))}
            </div>
          ))
        ) : hasWords ? (
          <div className="caption-card__words">
            {caption.words!.map((word, pos) => (
              <span
                key={word.gi}
                className="caption-card__word"
                onContextMenu={(e) => openMenu(e, pos)}
                style={{ fontSize }}
              >
                {word.text}
              </span>
            ))}
          </div>
        ) : (
          caption.lines.map((line, lineIndex) => (
            <p key={lineIndex} className="caption-card__line" style={{ fontSize }}>
              {line}
            </p>
          ))
        )}
      </div>

      {editing && (
        <>
          <div className="caption-card__divider" />
          <p className="caption-card__hint">Editing · Ctrl+Enter to save · Esc to cancel</p>
        </>
      )}

      {menu && (
        <div ref={menuRef} className="menu" style={{ top: menu.y, left: menu.x }}>
          {isSentence && (
            <>
              <button
                className="menu-item"
                disabled={!canSplit}
                onClick={() => {
                  onSplit(caption, menu.wordPos);
                  closeMenu();
                }}
              >
                Split here
              </button>
              <button
                className="menu-item"
                disabled={!canMergePrev}
                onClick={() => {
                  onMerge(caption, "prev");
                  closeMenu();
                }}
              >
                Merge with previous
              </button>
              <button
                className="menu-item"
                disabled={!canMergeNext}
                onClick={() => {
                  onMerge(caption, "next");
                  closeMenu();
                }}
              >
                Merge with next
              </button>
            </>
          )}
          <button
            className="menu-item"
            disabled={!canMovePrev}
            onClick={() => {
              onMoveWord(caption, index, "prev");
              closeMenu();
            }}
          >
            Move first word to previous
          </button>
          <button
            className="menu-item"
            disabled={!canMoveNext}
            onClick={() => {
              onMoveWord(caption, index, "next");
              closeMenu();
            }}
          >
            Move last word to next
          </button>
          <button
            className="menu-item"
            disabled={!canSplitWords}
            onClick={() => {
              onSplitWords(caption, index);
              closeMenu();
            }}
          >
            Split into words
          </button>
        </div>
      )}
    </div>
  );
});
