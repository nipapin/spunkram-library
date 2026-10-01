// Ported from Odin Pro Beta Observer (original source map).
import { child_process, fs, os, path } from "@/lib/cep/node";

/** Chromium / CEP may expose real filesystem path on dropped files (non-standard). */
type FileWithPath = File & { path?: string };

export type DroppedFolder = { name: string; path: string };

function isCep(): boolean {
  return typeof window !== "undefined" && typeof window.cep !== "undefined";
}

function decodeCepDialogPath(raw: string): string {
  let p = raw.replace(/^file:\/\//, "");
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep raw */
  }
  return p;
}

export type ResolveDroppedFoldersResult = {
  folders: DroppedFolder[];
  /** Directory drag entries where filesystem path could not be read (show one alert). */
  unresolvedDirectoryNames: string[];
};

/**
 * Resolves dropped filesystem folders to absolute paths (CEP/Chromium with path on File).
 * Multiple folders from Explorer or a folder with files use one combined result; paths are de-duplicated.
 */
export function resolveDroppedFolders(
  dataTransfer: DataTransfer,
): ResolveDroppedFoldersResult {
  if (!isCep()) {
    return { folders: [], unresolvedDirectoryNames: [] };
  }

  const seen = new Set<string>();
  const folders: DroppedFolder[] = [];

  const addDir = (dirPath: string) => {
    const norm = path.normalize(dirPath);
    if (!fs.existsSync(norm) || !fs.statSync(norm).isDirectory()) return;
    const key = norm.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    folders.push({ path: norm, name: path.basename(norm) });
  };

  const fileList = dataTransfer.files;
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i] as FileWithPath;
    if (!f.path || !fs.existsSync(f.path)) continue;
    const st = fs.statSync(f.path);
    if (st.isDirectory()) {
      addDir(f.path);
      continue;
    }
    if (f.webkitRelativePath) {
      const rel = f.webkitRelativePath.replace(/\\/g, "/");
      const parts = rel.split("/").filter(Boolean);
      let dir = path.dirname(f.path);
      const up = Math.max(0, parts.length - 2);
      for (let u = 0; u < up; u++) dir = path.dirname(dir);
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        addDir(dir);
      }
    }
  }

  if (folders.length > 0) {
    return { folders, unresolvedDirectoryNames: [] };
  }

  const unresolvedDirectoryNames: string[] = [];
  const items = dataTransfer.items;
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      unresolvedDirectoryNames.push(entry.name);
    }
  }

  if (unresolvedDirectoryNames.length > 0) {
    console.warn(
      "[folderDrop] Папки распознаны по имени, но путь недоступен. Перетащите с рабочего стола или из проводника, либо выберите через +.",
    );
  }

  return { folders: [], unresolvedDirectoryNames };
}

type CepOpenDialogResult = { data?: string[] };

/** Opens the system folder picker (CEP), multi-select when supported. No-op outside CEP. */
export function pickFoldersWithCepDialog(
  onPicked: (folders: DroppedFolder[]) => void,
  options?: { title?: string; initialDir?: string },
): void {
  if (!isCep()) return;
  const title = options?.title ?? "Select folders";
  const initialDir = options?.initialDir ?? "";
  const open = window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog;
  const result = open(true, true, title, initialDir) as CepOpenDialogResult;
  if (!result.data?.length) return;

  const seen = new Set<string>();
  const folders: DroppedFolder[] = [];

  for (const raw of result.data) {
    const folderPath = decodeCepDialogPath(raw);
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      console.warn(
        "[folderDrop] Selected path is not a directory:",
        folderPath,
      );
      continue;
    }
    const norm = path.normalize(folderPath);
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    folders.push({ path: norm, name: path.basename(norm) });
  }

  if (folders.length > 0) onPicked(folders);
}

export function openFolderInOs(dirPath: string): void {
  if (!dirPath || !isCep()) return;
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Folder no longer exists: ${dirPath}`);
  }
  if (!fs.statSync(dirPath).isDirectory())
    throw new Error(`Not a folder: ${dirPath}`);

  const platform = os.platform();
  if (platform === "win32") {
    child_process
      .spawn("explorer.exe", [dirPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      })
      .unref();
  } else if (platform === "darwin") {
    child_process
      .spawn("open", [dirPath], { detached: true, stdio: "ignore" })
      .unref();
  } else {
    child_process
      .spawn("xdg-open", [dirPath], { detached: true, stdio: "ignore" })
      .unref();
  }
}
