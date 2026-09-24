/**
 * Install `{Brand} Captions/{Pack}/Fonts/` with the caption group.
 * The list comes from GET /api/captions/fonts. Files are public CDN URLs.
 * Local admin override reads `{root}/{Pack}/Fonts/` from disk instead.
 */
import { fs, os, path } from "../lib/cep/node";
import { apiUrl, CAPTIONS_ENDPOINTS } from "../api";
import { installFontsFromDirectory, userFontFileInstalled } from "../lib/utils/pack-fonts";
import { invalidateFontCatalog } from "../lib/utils/system-fonts";
import { getActiveBrand } from "../lib/utils/brandTheme";
import { captionsLocalFile, isCaptionsLocalOverrideActive } from "./localSource";
import { packIdFromStyleId } from "./paths";

const FONT_EXT = new Set([".ttf", ".otf", ".ttc"]);

type PackFontFile = { name: string; url: string };

const isDir = (dir: string | null | undefined): dir is string => {
  if (!dir || typeof fs?.statSync !== "function") return false;
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

const safeFontName = (name: string): string => {
  const base = path.basename(String(name || "").replace(/\\/g, "/")).trim();
  if (!base || base === "." || base === ".." || base.includes("..")) return "";
  if (!FONT_EXT.has(path.extname(base).toLowerCase())) return "";
  return base;
};

const fetchFontList = async (packId: string, brand: string): Promise<PackFontFile[]> => {
  const url = apiUrl(
    `${CAPTIONS_ENDPOINTS.fonts}?brand=${encodeURIComponent(brand)}&pack=${encodeURIComponent(packId)}`,
  );
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { files?: unknown };
  if (!Array.isArray(data.files)) return [];
  const out: PackFontFile[] = [];
  for (const item of data.files) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { name?: unknown; url?: unknown };
    const name = typeof rec.name === "string" ? safeFontName(rec.name) : "";
    const fileUrl = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!name || !fileUrl.startsWith("https://")) continue;
    out.push({ name, url: fileUrl });
  }
  return out;
};

const fetchBytes = async (url: string): Promise<ArrayBuffer | null> => {
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/octet-stream" },
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return buffer.byteLength ? buffer : null;
  } catch {
    return null;
  }
};

/** Install the caption group's Fonts folder. Missing fonts do not fail apply. */
export const ensureCaptionFontsInstalled = async (styleId: string): Promise<number> => {
  if (!styleId || typeof fs?.writeFileSync !== "function") return 0;

  const brand = getActiveBrand();
  const packId = packIdFromStyleId(styleId);
  if (!packId) return 0;

  const packFontsDir = captionsLocalFile(packId, "Fonts", brand);
  if (isCaptionsLocalOverrideActive(brand)) {
    if (!isDir(packFontsDir)) return 0;
    const installed = await installFontsFromDirectory(packFontsDir);
    if (installed > 0) invalidateFontCatalog();
    return installed;
  }

  let files: PackFontFile[] = [];
  try {
    files = await fetchFontList(packId, brand);
  } catch {
    return 0;
  }
  const pending = files.filter((file) => !userFontFileInstalled(file.name));
  if (pending.length === 0) return 0;

  const staging = path.join(os.tmpdir(), "motionflow-caption-fonts", String(Date.now()));
  try {
    fs.mkdirSync(staging, { recursive: true });
  } catch {
    return 0;
  }

  for (const file of pending) {
    const bytes = await fetchBytes(file.url);
    if (!bytes) continue;
    try {
      fs.writeFileSync(path.join(staging, file.name), new Uint8Array(bytes));
    } catch {
      // skip one file
    }
  }

  const installed = await installFontsFromDirectory(staging);
  try {
    fs.rmSync(staging, { recursive: true, force: true });
  } catch {
    // best-effort
  }
  if (installed > 0) invalidateFontCatalog();
  return installed;
};
