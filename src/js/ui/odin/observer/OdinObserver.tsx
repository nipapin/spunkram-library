import { useEffect, useRef, useState } from "react";
import { Globe, Pencil, Plus, Trash2, X } from "lucide-react";
import { useOdinHost } from "../use-odin-host";
import { useObserverCards } from "./use-observer-cards";
import {
  openFolderInOs,
  pickFoldersWithCepDialog,
  resolveDroppedFolders,
} from "./folder-drop";
import type { ObserverCard } from "./cards-model";

export function OdinObserver({ query }: { query: string }) {
  const model = useObserverCards(useOdinHost());
  const [menu, setMenu] = useState<{
    card: ObserverCard;
    x: number;
    y: number;
  } | null>(null);
  const [rename, setRename] = useState<ObserverCard | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState("");
  const dragging = useRef<string | null>(null);
  const dialog = useRef<HTMLFormElement>(null);
  const dialogOpen = Boolean(rename || remove.length);
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => previous?.focus();
  }, [dialogOpen]);
  const cards = model.cards.filter((card) =>
    card.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
        setRename(null);
        setRemove([]);
        return;
      }
      if (
        (event.target as HTMLElement)?.closest(
          "input, textarea, [contenteditable]",
        )
      )
        return;
      if (event.key === "Delete" && selected.length) {
        event.preventDefault();
        setRemove(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function pick() {
    setMessage("");
    if (typeof window.cep === "undefined") {
      setMessage(
        "Open Odin Pro in After Effects or Premiere Pro to add local folders.",
      );
      return;
    }
    try {
      pickFoldersWithCepDialog(model.add);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not open the folder picker",
      );
    }
  }
  return (
    <section
      className={`odin-observer${dragOver ? " is-dragging" : ""}`}
      aria-label="Observer"
      onClick={() => setMenu(null)}
      onDragOver={(event) => {
        event.preventDefault();
        if (!dragging.current) setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (dragging.current) return;
        try {
          const result = resolveDroppedFolders(event.dataTransfer);
          if (result.unresolvedDirectoryNames.length)
            setMessage(
              "Folder paths are unavailable. Use + to select the folders.",
            );
          if (result.folders.length) model.add(result.folders);
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Could not add folders",
          );
        }
      }}
    >
      {(model.error || message) && (
        <p role="alert" className="odin-error">
          {model.error || message}
        </p>
      )}
      <div className="odin-observer__cards">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            draggable
            className={`odin-observer__card${selected.includes(card.id) ? " is-selected" : ""}`}
            title={card.folderPath}
            aria-pressed={selected.includes(card.id)}
            onDragStart={(event) => {
              dragging.current = card.id;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", card.id);
            }}
            onDragEnd={() => {
              dragging.current = null;
            }}
            onDrop={(event) => {
              if (!dragging.current) return;
              event.preventDefault();
              event.stopPropagation();
              model.reorder(
                dragging.current,
                card.id,
                cards.map((item) => item.id),
              );
              dragging.current = null;
            }}
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey) {
                setSelected((ids) =>
                  ids.includes(card.id)
                    ? ids.filter((id) => id !== card.id)
                    : [...ids, card.id],
                );
                return;
              }
              setSelected([]);
              if (typeof window.cep === "undefined") {
                setMessage("Open Odin Pro in Adobe to open local folders.");
                return;
              }
              try {
                openFolderInOs(card.folderPath);
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Could not open folder",
                );
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ card, x: event.clientX, y: event.clientY });
            }}
          >
            {card.isShared && <Globe size={18} />}
            <span>
              {card.title}
              {card.subtitle && card.subtitle !== card.folderPath && (
                <small>{card.subtitle}</small>
              )}
            </span>
          </button>
        ))}
      </div>
      {!cards.length && (
        <div className="odin-observer__empty">
          {query
            ? "No matching folders"
            : "Add folders by dropping them here, or tap + to choose folders. Ctrl+click to select several."}
        </div>
      )}
      <button
        type="button"
        className="odin-observer__add"
        aria-label="Add folders"
        data-tooltip="Add folders"
        onClick={pick}
      >
        <Plus size={24} />
      </button>
      {selected.length > 0 && (
        <div className="odin-observer__selection">
          <span>{selected.length} selected</span>
          <button type="button" onClick={() => setSelected([])}>
            Clear
          </button>
          <button type="button" onClick={() => setRemove(selected)}>
            Remove
          </button>
        </div>
      )}
      {menu && (
        <>
          <button
            className="odin-menu-dismiss"
            aria-label="Close folder menu"
            onClick={() => setMenu(null)}
          />
          <div
            role="menu"
            className="odin-context-menu"
            style={{
              left: Math.max(4, Math.min(menu.x, window.innerWidth - 195)),
              top: Math.max(4, Math.min(menu.y, window.innerHeight - 140)),
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRename(menu.card);
                setName(menu.card.title);
              }}
            >
              <Pencil size={16} />
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                setRemove(
                  selected.includes(menu.card.id) ? selected : [menu.card.id],
                )
              }
            >
              <Trash2 size={16} />
              Remove
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => model.share(menu.card.id)}
            >
              <Globe size={16} />
              {menu.card.isShared ? "Stop sharing" : "Share with other app"}
            </button>
          </div>
        </>
      )}
      {(rename || remove.length > 0) && (
        <div className="odin-dialog-backdrop">
          <form
            ref={dialog}
            className="odin-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={rename ? "Rename folder shortcut" : "Remove shortcuts"}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const elements = Array.from(
                dialog.current?.querySelectorAll<HTMLElement>(
                  "input, button:not([disabled])",
                ) || [],
              );
              const first = elements[0],
                last = elements[elements.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              if (rename) {
                if (name.trim() && model.rename(rename.id, name.trim()))
                  setRename(null);
              } else if (model.remove(remove)) {
                setRemove([]);
                setSelected((ids) => ids.filter((id) => !remove.includes(id)));
              }
            }}
          >
            <h2>{rename ? "Rename" : "Remove shortcuts?"}</h2>
            {rename ? (
              <label>
                Display name
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            ) : (
              <p>
                {remove.length} shortcut{remove.length > 1 ? "s" : ""} will be
                removed from this list. Nothing is deleted on disk.
              </p>
            )}
            <div className="odin-actions">
              <button
                type="button"
                className="odin-outline"
                onClick={() => {
                  setRename(null);
                  setRemove([]);
                }}
              >
                <X size={14} />
                Cancel
              </button>
              <button
                type="submit"
                className="odin-primary"
                disabled={Boolean(rename && !name.trim())}
              >
                {rename ? "Save" : "Remove"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
