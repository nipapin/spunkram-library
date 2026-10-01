import type { OdinHost } from "../use-odin-host";

export type ObserverCard = {
  id: string;
  title: string;
  folderPath: string;
  subtitle?: string;
  appID: OdinHost;
  isShared?: boolean;
};

export function parseCards(raw: string | null): ObserverCard[] {
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data))
    throw new Error("Observer shortcuts file must contain a JSON array");
  return data.map((value): ObserverCard => {
    if (
      !value ||
      typeof value.id !== "string" ||
      typeof value.title !== "string" ||
      typeof value.folderPath !== "string"
    ) {
      throw new Error("Observer shortcuts file contains an invalid card");
    }
    return {
      id: value.id,
      title: value.title,
      folderPath: value.folderPath,
      subtitle: typeof value.subtitle === "string" ? value.subtitle : undefined,
      appID: value.appID === "AEFT" ? "AEFT" : "PPRO",
      isShared: Boolean(value.isShared || value.isGlobal),
    };
  });
}
export function visibleInHost(card: ObserverCard, host: OdinHost): boolean {
  return Boolean(card.isShared) || card.appID === host;
}
export function folderKey(folder: string, windows = true): string {
  const normalized = folder.replace(/\\/g, "/").replace(/\/$/, "");
  return windows ? normalized.toLowerCase() : normalized;
}
export function reorderCards(
  all: ObserverCard[],
  from: string,
  to: string,
  visibleIds: string[],
): ObserverCard[] {
  const ids = new Set(visibleIds);
  const visible = all.filter((card) => ids.has(card.id));
  const start = visible.findIndex((card) => card.id === from);
  const end = visible.findIndex((card) => card.id === to);
  if (start < 0 || end < 0) return all;
  visible.splice(end, 0, visible.splice(start, 1)[0]);
  let index = 0;
  return all.map((card) => (ids.has(card.id) ? visible[index++] : card));
}
