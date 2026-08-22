import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  canPreviewFamily,
  cssFontFamily,
  getFontCatalog,
  subscribeFontCatalog,
  pickFaceForFamily,
  resolveFontFace,
  type FontCatalog,
  type FontFace,
} from "../lib/utils/system-fonts";
import "./FontPicker.scss";

type MenuKind = "family" | "style" | null;

const FontMenu = ({
  open,
  anchor,
  width,
  onClose,
  children,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  width: number;
  onClose: () => void;
  children: ReactNode;
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width });

  useEffect(() => {
    if (!open || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 280;
    let top = rect.bottom + 4;
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 4);
    }
    setPos({ top, left: rect.left, width: Math.max(width, rect.width) });
  }, [open, anchor, width, children]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="font-picker__menu"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
      role="listbox"
    >
      {children}
    </div>,
    document.body,
  );
};

export const FontPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) => {
  const [catalog, setCatalog] = useState<FontCatalog | null>(null);
  const [open, setOpen] = useState<MenuKind>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const familyWrap = useRef<HTMLDivElement>(null);
  const familyInput = useRef<HTMLInputElement>(null);
  const styleBtn = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getFontCatalog().then((next) => {
      if (!cancelled) setCatalog(next);
    });
    const unsub = subscribeFontCatalog((next) => {
      if (!cancelled) setCatalog(next);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (open !== "family") return;
    setQuery("");
    setActiveIndex(0);
    requestAnimationFrame(() => {
      familyInput.current?.focus();
      familyInput.current?.select();
    });
  }, [open]);

  const current = useMemo(() => resolveFontFace(catalog, value), [catalog, value]);

  const families = useMemo(() => {
    const names = catalog ? catalog.families.map((f) => f.name) : [];
    if (current.family && !names.includes(current.family)) names.push(current.family);
    return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [catalog, current.family]);

  const filteredFamilies = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return families;
    return families.filter((name) => name.toLowerCase().includes(q));
  }, [families, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (open !== "family") return;
    const el = listRef.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, filteredFamilies]);

  const styleOptions = useMemo(() => {
    if (!catalog) {
      return current.id ? [{ id: current.id, family: current.family, style: current.style || "Regular" }] : [];
    }
    const group = catalog.families.find((f) => f.name === current.family);
    const faces = group?.faces ?? [];
    if (current.id && !faces.some((f) => f.id === current.id)) {
      return [{ id: current.id, family: current.family, style: current.style || current.id }, ...faces];
    }
    return faces;
  }, [catalog, current.family, current.id, current.style]);

  const onFamilyChange = (family: string) => {
    if (!catalog) return;
    const group = catalog.families.find((f) => f.name === family);
    const next = pickFaceForFamily(group, current.style);
    if (next) onChange(next.id);
    setQuery("");
    setOpen(null);
  };

  const onStyleChange = (face: FontFace) => {
    if (face.id) onChange(face.id);
    setOpen(null);
  };

  const familyOpen = open === "family";
  const inputValue = familyOpen ? query : current.family;
  const previewFamily = !familyOpen && canPreviewFamily(current.family) ? current.family : "";

  const onFamilyKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!familyOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setOpen("family");
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filteredFamilies.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filteredFamilies[activeIndex] ?? filteredFamilies[0];
      if (pick) onFamilyChange(pick);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setOpen(null);
    }
  };

  return (
    <div className="font-picker">
      <div
        ref={familyWrap}
        className={`font-picker__field ${familyOpen ? "font-picker__field--open" : ""} ${!catalog ? "font-picker__field--disabled" : ""}`}
      >
        <Search size={12} className="font-picker__search-icon" />
        <input
          ref={familyInput}
          className="font-picker__input"
          disabled={!catalog}
          value={catalog ? inputValue : "Loading…"}
          placeholder={current.family || "Search fonts"}
          aria-label="Font family"
          aria-autocomplete="list"
          aria-expanded={familyOpen}
          aria-haspopup="listbox"
          role="combobox"
          style={previewFamily ? { fontFamily: cssFontFamily(previewFamily) } : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            if (open !== "family") setOpen("family");
          }}
          onFocus={() => setOpen("family")}
          onKeyDown={onFamilyKeyDown}
        />
        <button
          type="button"
          className="font-picker__chevron"
          tabIndex={-1}
          disabled={!catalog}
          aria-label="Toggle font list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => (v === "family" ? null : "family"))}
        >
          <ChevronDown size={12} />
        </button>
      </div>

      <button
        ref={styleBtn}
        type="button"
        className={`font-picker__btn font-picker__btn--style ${open === "style" ? "font-picker__btn--open" : ""}`}
        disabled={!catalog || !styleOptions.length}
        aria-haspopup="listbox"
        aria-expanded={open === "style"}
        aria-label="Font style"
        onClick={() => setOpen((v) => (v === "style" ? null : "style"))}
      >
        <span className="font-picker__label">{current.style || "Regular"}</span>
        <ChevronDown size={12} />
      </button>

      <FontMenu open={familyOpen} anchor={familyWrap.current} width={240} onClose={() => setOpen(null)}>
        <div ref={listRef} className="font-picker__list">
          {filteredFamilies.length ? (
            filteredFamilies.map((family, i) => (
              <button
                key={family}
                type="button"
                role="option"
                data-active={i === activeIndex}
                aria-selected={family === current.family}
                className={`font-picker__option ${family === current.family ? "font-picker__option--selected" : ""} ${i === activeIndex ? "font-picker__option--active" : ""}`}
                style={canPreviewFamily(family) ? { fontFamily: cssFontFamily(family) } : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => onFamilyChange(family)}
              >
                {family}
              </button>
            ))
          ) : (
            <div className="font-picker__empty">No fonts match</div>
          )}
        </div>
      </FontMenu>

      <FontMenu
        open={open === "style"}
        anchor={styleBtn.current}
        width={140}
        onClose={() => setOpen(null)}
      >
        <div className="font-picker__list">
          {styleOptions.map((face) => (
            <button
              key={face.id}
              type="button"
              role="option"
              aria-selected={face.id === current.id}
              className={`font-picker__option ${face.id === current.id ? "font-picker__option--selected font-picker__option--active" : ""}`}
              style={
                canPreviewFamily(current.family)
                  ? { fontFamily: cssFontFamily(current.family) }
                  : undefined
              }
              onClick={() => onStyleChange(face)}
            >
              {face.style}
            </button>
          ))}
        </div>
      </FontMenu>
    </div>
  );
};
