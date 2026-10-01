// Ported from Odin Pro Beta Observer (original source map).
import { fs, os, path } from "@/lib/cep/node";
import { parseCards } from "./cards-model";

const CARDS_FILE = "cards.json";
const LEGACY_STORAGE_KEY = "cards";

/** Сегменты пути под Roaming (Win) / Application Support (macOS), как у продукта. */
const ODIN_DATA_SEGMENTS = ["Premiere Basics", "Odin Pro Extension"] as const;

function isCepWithFs(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.cep !== "undefined" &&
    typeof fs.readFileSync === "function" &&
    typeof fs.writeFileSync === "function"
  );
}

/** Каталог данных расширения (общий для PPRO и AEFT на одной машине). */
export function getOdinCardsStorageDir(): string | null {
  if (!isCepWithFs()) return null;
  const platform = os.platform();
  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      ...ODIN_DATA_SEGMENTS,
    );
  }
  const roaming =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(roaming, ...ODIN_DATA_SEGMENTS);
}

export function getOdinCardsFilePath(): string | null {
  const dir = getOdinCardsStorageDir();
  if (!dir) return null;
  return path.join(dir, CARDS_FILE);
}

/** Чтение JSON массива карточек из файла; `null` если файла нет или ошибка. */
export function loadCardsFileRaw(): string | null {
  const fp = getOdinCardsFilePath();
  if (!fp) return null;
  try {
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp, "utf8");
  } catch (e) {
    console.warn("[cardsFileStorage] read failed:", e);
    return null;
  }
}

export function saveCardsFileRaw(json: string): boolean {
  const fp = getOdinCardsFilePath();
  if (!fp) return false;
  const pending = `${fp}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  try {
    parseCards(json);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(pending, json, "utf8");
    fs.renameSync(pending, fp);
    return true;
  } catch (e) {
    console.error("[cardsFileStorage] write failed:", e);
    return false;
  } finally {
    try {
      if (fs.existsSync(pending)) fs.unlinkSync(pending);
    } catch {
      /* retain the original file on save failure */
    }
  }
}

export function usesCardsFileStorage(): boolean {
  return isCepWithFs();
}

/**
 * Однократно переносит данные из localStorage в cards.json, если файла ещё нет.
 */
export function migrateLegacyLocalStorageToCardsFile(): void {
  if (!isCepWithFs()) return;
  const fp = getOdinCardsFilePath();
  if (!fp || fs.existsSync(fp)) return;
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy || legacy === "[]") {
      return;
    }
    if (saveCardsFileRaw(legacy)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch (e) {
    console.warn("[cardsFileStorage] migrate failed:", e);
  }
}
