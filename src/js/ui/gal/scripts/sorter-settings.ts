import * as panelStore from "@/lib/userdata-store";
import { storageKey } from "@brands";

const STORAGE_KEY = storageKey("scripts.sorter");

export type ExtCategory = { folder: string; ext: string[] };
export type CustomCategory = ExtCategory & { id: string };

export type SorterSettings = {
  sequences: string;
  video: ExtCategory;
  audio: ExtCategory;
  images: ExtCategory;
  graphics: ExtCategory;
  custom: CustomCategory[];
  offline: string;
  other: string;
};

export const DEFAULT_SORTER_SETTINGS: SorterSettings = {
  sequences: "Sequences",
  video: {
    folder: "Video",
    ext: ["mp4", "mov", "avi", "mxf", "mkv", "wmv", "mpg", "mpeg", "m4v", "r3d"],
  },
  audio: { folder: "Audio", ext: ["mp3", "wav", "aac", "aiff", "flac", "m4a"] },
  images: {
    folder: "Images",
    ext: ["jpg", "jpeg", "png", "tif", "tiff", "bmp", "gif", "webp", "heic"],
  },
  graphics: { folder: "Graphics", ext: ["psd", "ai", "eps", "svg", "psb"] },
  custom: [],
  offline: "Offline",
  other: "Other",
};

function genId(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function newCustomCategory(): CustomCategory {
  return { id: genId(), folder: "", ext: [] };
}

function cloneSettings(settings: SorterSettings): SorterSettings {
  return {
    sequences: settings.sequences,
    video: { folder: settings.video.folder, ext: [...settings.video.ext] },
    audio: { folder: settings.audio.folder, ext: [...settings.audio.ext] },
    images: { folder: settings.images.folder, ext: [...settings.images.ext] },
    graphics: { folder: settings.graphics.folder, ext: [...settings.graphics.ext] },
    custom: settings.custom.map((c) => ({ id: c.id, folder: c.folder, ext: [...c.ext] })),
    offline: settings.offline,
    other: settings.other,
  };
}

export function loadSorterSettings(): SorterSettings {
  try {
    const raw = panelStore.getItem(STORAGE_KEY);
    if (!raw) return cloneSettings(DEFAULT_SORTER_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<SorterSettings>;
    return {
      ...cloneSettings(DEFAULT_SORTER_SETTINGS),
      ...parsed,
      video: { ...DEFAULT_SORTER_SETTINGS.video, ...(parsed.video || {}) },
      audio: { ...DEFAULT_SORTER_SETTINGS.audio, ...(parsed.audio || {}) },
      images: { ...DEFAULT_SORTER_SETTINGS.images, ...(parsed.images || {}) },
      graphics: { ...DEFAULT_SORTER_SETTINGS.graphics, ...(parsed.graphics || {}) },
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
    };
  } catch {
    return cloneSettings(DEFAULT_SORTER_SETTINGS);
  }
}

export function saveSorterSettings(settings: SorterSettings): void {
  try {
    panelStore.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
