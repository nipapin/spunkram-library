import { CAPTION_BATCH_NAMES, CAPTION_SYSTEM, CEP_WRITTEN_SYSTEM_NAMES } from "../../shared/caption-system";
import { isGroup, isLocalizedStr, isPointValue, matchControlForInit, uiName } from "./clientControls";
import type { CaptionInitValue, ControlValue, ControlValues, MogrtDefinition } from "./types";

const SYSTEM_INIT_NAMES = new Set<string>([
  ...CEP_WRITTEN_SYSTEM_NAMES,
  CAPTION_SYSTEM.rawData,
  "Captions_Data",
  "Captions_Raw_Data",
]);

const lastNameSegment = (name: string): string => {
  const parts = String(name || "")
    .split(/[>/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || String(name || "").trim();
};

/** Packed caption batches / CEP system text — must not ship in a saved style. */
export const isChunkOrSystemInitName = (name: string): boolean => {
  const n = String(name || "").trim();
  if (!n) return false;
  if (SYSTEM_INIT_NAMES.has(n)) return true;
  const last = lastNameSegment(n);
  if (SYSTEM_INIT_NAMES.has(last)) return true;
  if (n.startsWith("captions_batch_") || last.startsWith("captions_batch_")) return true;
  for (let i = 0; i < CAPTION_BATCH_NAMES.length; i++) {
    if (n === CAPTION_BATCH_NAMES[i] || last === CAPTION_BATCH_NAMES[i]) return true;
  }
  return false;
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const controlValueToInitJson = (value: ControlValue): unknown => {
  if (isLocalizedStr(value)) return value.strDB?.[0]?.str ?? "";
  if (isPointValue(value)) return { x: value.x, y: value.y };
  if (Array.isArray(value)) return [...value];
  return value;
};

const sanitizeNode = (node: unknown): void => {
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  if (typeof rec.name === "string" && isChunkOrSystemInitName(rec.name)) {
    rec.value = "";
  }
  if (Array.isArray(rec.controls)) {
    for (let i = 0; i < rec.controls.length; i++) sanitizeNode(rec.controls[i]);
  }
};

const sanitizeControlsTree = (doc: Record<string, unknown>): void => {
  if (Array.isArray(doc.ui)) {
    for (let i = 0; i < doc.ui.length; i++) sanitizeNode(doc.ui[i]);
  }
  if (Array.isArray(doc.groups)) {
    for (let i = 0; i < doc.groups.length; i++) sanitizeNode(doc.groups[i]);
  }
  if (Array.isArray(doc.controls)) {
    for (let i = 0; i < doc.controls.length; i++) sanitizeNode(doc.controls[i]);
  }
};

/**
 * Parent `init` with current Styles slider values overlaid.
 * Drops captions_batch_* / Segment Type / Line Count / … so apply cannot stamp old speech.
 */
export const mergeInitWithValues = (
  definition: MogrtDefinition,
  values: ControlValues,
): CaptionInitValue[] => {
  const source = definition.init?.length
    ? definition.init
    : (definition.controlsDocument?.init as CaptionInitValue[] | undefined) ?? [];
  if (!source.length) {
    const fromLeaves: CaptionInitValue[] = [];
    for (const c of definition.clientControls ?? []) {
      if (isGroup(c)) continue;
      const name = uiName(c);
      if (!name || isChunkOrSystemInitName(name)) continue;
      if (values[c.id] === undefined && c.value === undefined) continue;
      fromLeaves.push({
        name,
        value: controlValueToInitJson((values[c.id] ?? c.value) as ControlValue),
        source: typeof c.source === "string" ? c.source : undefined,
      });
    }
    return fromLeaves;
  }
  const nameCounts: Record<string, number> = {};
  const merged: CaptionInitValue[] = [];
  for (let i = 0; i < source.length; i++) {
    const name = String(source[i].name || "").trim();
    if (!name || isChunkOrSystemInitName(name)) continue;
    const occ = nameCounts[name] ?? 0;
    nameCounts[name] = occ + 1;
    const next: CaptionInitValue = { ...source[i], name };
    const matched = matchControlForInit(definition, name, occ);
    if (matched && values[matched.id] !== undefined) {
      next.value = controlValueToInitJson(values[matched.id]);
    }
    merged.push(next);
  }
  return merged;
};

/** Clone parent controls.json, overlay sliders onto `init`, clear caption chunks. */
export const buildUserControlsDocument = (
  parent: MogrtDefinition,
  values: ControlValues,
): Record<string, unknown> => {
  const doc: Record<string, unknown> = parent.controlsDocument
    ? cloneJson(parent.controlsDocument)
    : {
        version: 1,
        templateName: parent.capsuleName,
        init: cloneJson(parent.init ?? []),
      };
  const withParentInit: MogrtDefinition = {
    ...parent,
    init: Array.isArray(doc.init) ? (doc.init as CaptionInitValue[]) : parent.init,
  };
  doc.init = mergeInitWithValues(withParentInit, values);
  sanitizeControlsTree(doc);
  return doc;
};

export const definitionCacheKey = (preset: { id: string; source: string; styleId: string }): string =>
  preset.source === "user" ? preset.id : preset.styleId;
