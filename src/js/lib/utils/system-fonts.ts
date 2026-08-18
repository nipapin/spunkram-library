import { fs, os, path } from "@/lib/cep/node";
import { hostSdk } from "@/sdk/host-api";

let cached: string[] | null = null;
let pending: Promise<string[]> | null = null;

const FONT_EXT = new Set([".ttf", ".otf", ".ttc", ".otc"]);

/** OS font folder scan — fallback when host script returns empty. */
export function listOsFonts(): string[] {
  if (typeof fs?.readdirSync !== "function" || typeof os?.platform !== "function") return [];

  const names = new Set<string>();
  const dirs: string[] = [];

  if (os.platform() === "win32") {
    dirs.push(path.join(os.homedir(), "AppData", "Local", "Microsoft", "Windows", "Fonts"));
    dirs.push("C:\\Windows\\Fonts");
  } else {
    dirs.push(path.join(os.homedir(), "Library", "Fonts"));
    dirs.push("/Library/Fonts");
    dirs.push("/System/Library/Fonts");
  }

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        const ext = path.extname(entry).toLowerCase();
        if (!FONT_EXT.has(ext)) continue;
        names.add(path.basename(entry, ext));
      }
    } catch {
      // skip unreadable dir
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function fetchFromHost(): Promise<string[]> {
  try {
    const res = await hostSdk().getSystemFonts();
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) return res.data;
  } catch {
    // fall through to OS scan
  }
  return listOsFonts();
}

/** Cached system font list for UI dropdowns. */
export function getSystemFontsList(): Promise<string[]> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetchFromHost().then((fonts) => {
      cached = fonts;
      return fonts;
    });
  }
  return pending;
}
