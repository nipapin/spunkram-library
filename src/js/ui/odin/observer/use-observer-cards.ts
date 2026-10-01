import { useCallback, useEffect, useState } from "react";
import { fs, os } from "@/lib/cep/node";
import {
  getOdinCardsFilePath,
  migrateLegacyLocalStorageToCardsFile,
  saveCardsFileRaw,
  usesCardsFileStorage,
} from "./cards-file-storage";
import {
  folderKey,
  parseCards,
  reorderCards,
  visibleInHost,
  type ObserverCard,
} from "./cards-model";
import type { DroppedFolder } from "./folder-drop";
import type { OdinHost } from "../use-odin-host";

const STORAGE_KEY = "odin.observer.cards";
function readCards(): ObserverCard[] {
  const file = getOdinCardsFilePath();
  // A corrupt or unreadable file must never be replaced with an empty list.
  if (file && fs.existsSync(file))
    return parseCards(fs.readFileSync(file, "utf8"));
  return parseCards(
    localStorage.getItem(STORAGE_KEY) || localStorage.getItem("cards"),
  );
}

export function useObserverCards(host: OdinHost) {
  const [cards, setCards] = useState<ObserverCard[]>([]);
  const [error, setError] = useState("");
  const report = (error: unknown) =>
    setError(
      error instanceof Error
        ? error.message
        : "Could not update Observer shortcuts",
    );
  const reload = useCallback(() => {
    try {
      setCards(readCards());
      setError("");
    } catch (error) {
      report(error);
    }
  }, []);
  useEffect(() => {
    migrateLegacyLocalStorageToCardsFile();
    reload();
    const file = getOdinCardsFilePath();
    if (file) fs.watchFile(file, { interval: 1500 }, reload);
    window.addEventListener("storage", reload);
    window.addEventListener("focus", reload);
    return () => {
      if (file) fs.unwatchFile(file, reload);
      window.removeEventListener("storage", reload);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);
  function update(change: (all: ObserverCard[]) => ObserverCard[]): boolean {
    try {
      const next = change(readCards());
      const json = JSON.stringify(next);
      if (usesCardsFileStorage()) {
        if (!saveCardsFileRaw(json))
          throw new Error("Could not save Observer shortcuts");
      } else localStorage.setItem(STORAGE_KEY, json);
      setCards(next);
      setError("");
      return true;
    } catch (error) {
      report(error);
      return false;
    }
  }
  return {
    cards: cards.filter((card) => visibleInHost(card, host)),
    error,
    add: (folders: DroppedFolder[]) =>
      update((all) => {
        const windows =
          typeof os.platform === "function" ? os.platform() === "win32" : true;
        const seen = new Set(
          all.map((card) => folderKey(card.folderPath, windows)),
        );
        const appended: ObserverCard[] = [];
        for (const folder of folders) {
          const key = folderKey(folder.path, windows);
          if (seen.has(key)) continue;
          seen.add(key);
          appended.push({
            id: `card-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title: folder.name,
            folderPath: folder.path,
            appID: host,
          });
        }
        return [...all, ...appended];
      }),
    rename: (id: string, title: string) =>
      update((all) =>
        all.map((card) => (card.id === id ? { ...card, title } : card)),
      ),
    remove: (ids: string[]) =>
      update((all) => all.filter((card) => !ids.includes(card.id))),
    share: (id: string) =>
      update((all) =>
        all.map((card) =>
          card.id === id ? { ...card, isShared: !card.isShared } : card,
        ),
      ),
    reorder: (from: string, to: string, visibleIds: string[]) =>
      update((all) => reorderCards(all, from, to, visibleIds)),
  };
}
