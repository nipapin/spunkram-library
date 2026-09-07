import { child_process, fs, os, path } from "@/lib/cep/node";

/** Reveal a folder in the OS file manager (Explorer / Finder). */
export function openDirectoryInOs(folderPath: string): void {
  const target = (folderPath || "").trim();
  if (!target || typeof fs?.existsSync !== "function" || !fs.existsSync(target)) return;
  try {
    if (os?.platform?.() === "darwin") {
      child_process?.exec?.(`open "${target.replace(/"/g, '\\"')}"`);
    } else if (os?.platform?.() === "win32") {
      child_process?.exec?.(`explorer "${target.replace(/"/g, "")}"`);
    } else {
      child_process?.exec?.(`xdg-open "${target.replace(/"/g, '\\"')}"`);
    }
  } catch {
    // ignore
  }
}

export function pathExists(folderPath: string): boolean {
  const target = (folderPath || "").trim();
  return !!target && typeof fs?.existsSync === "function" && fs.existsSync(target);
}

export function joinPath(...parts: string[]): string {
  if (typeof path?.join === "function") return path.join(...parts);
  return parts.filter(Boolean).join("/");
}
