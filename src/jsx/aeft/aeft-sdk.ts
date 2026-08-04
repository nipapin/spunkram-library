/**
 * After Effects SDK host surface — new MotionFlow methods (createComp, createText, …)
 * plus re-exports of shared engine/fs for evalTS.
 */
import { getActiveComp } from "./aeft-utils";
import {
  bindPack,
  setEngine,
  getPackContext,
  getEngine,
  type PackBindContext,
} from "../shared/engine";
import {
  copyPackageToAppData,
  deletePackageFiles,
  type PackCopyTransfer,
} from "../shared/fs";

export { bindPack, setEngine, getPackContext, getEngine };
export type { PackBindContext };

export const mfCopyPackage = (transfer: PackCopyTransfer) => copyPackageToAppData(transfer);
export const mfDeletePackage = (packDir: string) => deletePackageFiles(packDir);

export type CreateCompOptions = {
  name: string;
  width: number;
  height: number;
  duration?: number;
  frameRate?: number;
  pixelAspect?: number;
};

export type CreateTextOptions = {
  text: string;
  compId?: number;
  fontSize?: number;
  fontFamily?: string;
  fillColor?: [number, number, number];
  position?: [number, number];
};

export type ResponsiveBackgroundOptions = {
  compId?: number;
  color?: [number, number, number];
  name?: string;
};

const findCompById = (id: number): CompItem | null => {
  for (let i = 1; i <= app.project.numItems; i++) {
    const item = app.project.item(i);
    if (item instanceof CompItem && item.id === id) return item;
  }
  return null;
};

const resolveComp = (compId?: number): CompItem | null => {
  if (typeof compId === "number") return findCompById(compId);
  return getActiveComp();
};

/** Create a new composition in the project. */
export const createComp = (
  opts: CreateCompOptions,
): { ok: true; compId: number; name: string } | { ok: false; reason: string } => {
  try {
    const duration = typeof opts.duration === "number" ? opts.duration : 10;
    const frameRate = typeof opts.frameRate === "number" ? opts.frameRate : 30;
    const pixelAspect = typeof opts.pixelAspect === "number" ? opts.pixelAspect : 1;
    const comp = app.project.items.addComp(
      opts.name,
      opts.width,
      opts.height,
      pixelAspect,
      duration,
      frameRate,
    );
    return { ok: true, compId: comp.id, name: comp.name };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};

/** Add a text layer to the active (or given) composition. */
export const createText = (
  opts: CreateTextOptions,
): { ok: true; layerIndex: number; compId: number } | { ok: false; reason: string } => {
  try {
    const comp = resolveComp(opts.compId);
    if (!comp) return { ok: false, reason: "NO_ACTIVE_COMP" };
    const layer = comp.layers.addText(opts.text || "");
    const td = layer.property("Source Text") as Property;
    const textDoc = td.value as TextDocument;
    if (typeof opts.fontSize === "number") textDoc.fontSize = opts.fontSize;
    if (opts.fontFamily) {
      try {
        textDoc.font = opts.fontFamily;
      } catch (e) {
        // font may be missing on host
      }
    }
    if (opts.fillColor) textDoc.fillColor = opts.fillColor;
    td.setValue(textDoc);
    if (opts.position) {
      const pos = layer.property("Position") as Property;
      pos.setValue(opts.position);
    }
    return { ok: true, layerIndex: layer.index, compId: comp.id };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};

/**
 * Add a full-frame solid behind other layers (responsive / cover background).
 * Scales to comp size; nearest Beta equivalent to addResponsiveBackground.
 */
export const addResponsiveBackground = (
  opts?: ResponsiveBackgroundOptions,
): { ok: true; layerIndex: number; compId: number } | { ok: false; reason: string } => {
  try {
    const o = opts || {};
    const comp = resolveComp(o.compId);
    if (!comp) return { ok: false, reason: "NO_ACTIVE_COMP" };
    const color = o.color || ([0, 0, 0] as [number, number, number]);
    const name = o.name || "MF Background";
    const solid = comp.layers.addSolid(color, name, comp.width, comp.height, 1, comp.duration);
    solid.moveToEnd();
    // Fit / cover: match comp exactly (solid already sized); keep centered.
    const pos = solid.property("Position") as Property;
    pos.setValue([comp.width / 2, comp.height / 2]);
    const scale = solid.property("Scale") as Property;
    scale.setValue([100, 100]);
    return { ok: true, layerIndex: solid.index, compId: comp.id };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};

/** Call legacy aeComposer when loaded; otherwise return NOT_LOADED. */
export const legacyAeCall = (
  method: string,
  argsJson: string,
): { ok: boolean; data?: unknown; reason?: string } => {
  try {
    // @ts-ignore ExtendScript global from legacy
    const ns = typeof $ !== "undefined" ? $._AtomExt_aeComposer : null;
    if (!ns || typeof ns[method] !== "function") {
      return { ok: false, reason: "LEGACY_AE_NOT_LOADED" };
    }
    const args = argsJson ? JSON.parse(argsJson) : [];
    const data = ns[method].apply(ns, args);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
};
