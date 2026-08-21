import { useCallback, useEffect, useRef } from "react";
import type { StylePreset } from "../../context/ConfigurationWrapper";
import type { ControlValues } from "../presets";
import { registerUndoKeyEvents } from "../lib/utils/cep";

type Snapshot = { name: string; values: ControlValues };

const MAX_STACK = 60;
const COALESCE_MS = 450;

const cloneSnapshot = (p: Pick<StylePreset, "name" | "values">): Snapshot => ({
  name: p.name,
  values: JSON.parse(JSON.stringify(p.values)) as ControlValues,
});

const isMod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;

const isKeyZ = (e: KeyboardEvent) =>
  e.key?.toLowerCase() === "z" || e.code === "KeyZ" || e.keyCode === 90;

const isKeyY = (e: KeyboardEvent) =>
  e.key?.toLowerCase() === "y" || e.code === "KeyY" || e.keyCode === 89;

/** Текстовые поля — браузерный undo символов; range/color/scrub — наш undo. */
const isTypingTarget = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLTextAreaElement) return true;
  if (t instanceof HTMLInputElement) {
    const type = (t.type || "text").toLowerCase();
    return type === "text" || type === "search" || type === "password" || type === "number";
  }
  return t.isContentEditable;
};

/**
 * Undo/redo для Styles: Ctrl+Z / Ctrl+Shift+Z (или Ctrl+Y).
 * Непрерывные правки одного контрола схлопываются в один шаг.
 */
export const useStyleUndo = (
  selected: StylePreset,
  apply: (patch: Partial<StylePreset>) => void,
) => {
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const coalesceKey = useRef<string | null>(null);
  const coalesceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // CEP: without registerKeyEventsInterest Ctrl+Z goes to Premiere/AE.
  // Defer so opening Styles doesn't block the first paint.
  useEffect(() => {
    const timer = window.setTimeout(() => registerUndoKeyEvents(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    coalesceKey.current = null;
    if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
  }, [selected.id]);

  const endCoalesceSoon = () => {
    if (coalesceTimer.current) clearTimeout(coalesceTimer.current);
    coalesceTimer.current = setTimeout(() => {
      coalesceKey.current = null;
    }, COALESCE_MS);
  };

  const onChange = useCallback((patch: Partial<StylePreset>, opts?: { coalesceKey?: string }) => {
    const key = opts?.coalesceKey;
    const current = selectedRef.current;

    if (key && key === coalesceKey.current) {
      endCoalesceSoon();
      applyRef.current(patch);
      return;
    }

    undoStack.current.push(cloneSnapshot(current));
    if (undoStack.current.length > MAX_STACK) undoStack.current.shift();
    redoStack.current = [];
    coalesceKey.current = key ?? null;
    endCoalesceSoon();
    applyRef.current(patch);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    coalesceKey.current = null;
    redoStack.current.push(cloneSnapshot(selectedRef.current));
    // полная замена values — merge мог бы оставить «лишние» ключи
    applyRef.current({ name: prev.name, values: prev.values });
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    coalesceKey.current = null;
    undoStack.current.push(cloneSnapshot(selectedRef.current));
    applyRef.current({ name: next.name, values: next.values });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isMod(e)) return;

      const wantUndo = isKeyZ(e) && !e.shiftKey;
      const wantRedo = (isKeyZ(e) && e.shiftKey) || isKeyY(e);
      if (!wantUndo && !wantRedo) return;

      if (isTypingTarget(e.target)) return;

      e.preventDefault();
      e.stopPropagation();
      if (wantUndo) undo();
      else redo();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [undo, redo]);

  return { onChange, undo, redo };
};
