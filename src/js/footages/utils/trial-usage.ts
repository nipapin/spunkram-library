import * as panelStore from "@/lib/userdata-store";

const STORAGE_KEY = "gal-premiere-gallery-trial";
const TRIAL_LIMIT = 20;

type UsageMap = Record<string, number>;

function loadUsage(): UsageMap {
  try {
    const raw = panelStore.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveUsage(map: UsageMap): void {
  try {
    panelStore.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getUsage(scriptId: string): number {
  const map = loadUsage();
  const value = map[scriptId];
  return typeof value === "number" ? value : 0;
}

export function incrementUsage(scriptId: string): number {
  const map = loadUsage();
  const current = typeof map[scriptId] === "number" ? map[scriptId] : 0;
  const next = current + 1;
  map[scriptId] = next;
  saveUsage(map);
  return next;
}

export function getRemaining(scriptId: string): number {
  return Math.max(0, TRIAL_LIMIT - getUsage(scriptId));
}

export { TRIAL_LIMIT };
