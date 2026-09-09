import { fs, path } from "@/lib/cep/node";
import { compareVersions } from "@/api/update";
import { csi } from "@/lib/utils/bolt";
import * as panelStore from "@/lib/userdata-store";
import { BRAND, storageKey } from "@brands";
import { version as BUILD_VERSION } from "../../shared/shared";

/** Written into the extension root on successful ZXP apply (Node FS — not CEF cache). */
const INSTALLED_UPDATE_FILE = "installed-update.json";
const APPLIED_STORE_KEY = storageKey("appliedExtensionUpdate");

type InstalledUpdateStamp = {
  version: string;
  appliedAt?: string;
};

function extRoot(): string {
  try {
    return csi.getSystemPath("extension") || "";
  } catch {
    return "";
  }
}

/** Parse `ExtensionBundleVersion` (or Extension `Version`) from CSXS/manifest.xml. */
export function readInstalledBundleVersion(): string | null {
  const root = extRoot();
  if (!root || typeof fs?.existsSync !== "function") return null;

  const candidates = [
    path.join(root, "CSXS", "manifest.xml"),
    path.join(root, "csxs", "manifest.xml"),
    path.join(root, "manifest.xml"),
  ];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const xml = fs.readFileSync(file, { encoding: "utf8" }).toString();
      const bundle =
        xml.match(/\bExtensionBundleVersion\s*=\s*["']([^"']+)["']/i)?.[1] ||
        xml.match(/<Extension\b[^>]*\bVersion\s*=\s*["']([^"']+)["']/i)?.[1];
      if (bundle?.trim()) return bundle.trim().replace(/^v/i, "");
    } catch {
      /* try next */
    }
  }
  return null;
}

function readDiskUpdateStamp(): string | null {
  const root = extRoot();
  if (!root || typeof fs?.existsSync !== "function") return null;
  const file = path.join(root, INSTALLED_UPDATE_FILE);
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(
      fs.readFileSync(file, { encoding: "utf8" }).toString(),
    ) as InstalledUpdateStamp;
    const v = typeof raw?.version === "string" ? raw.version.trim() : "";
    return v ? v.replace(/^v/i, "") : null;
  } catch {
    return null;
  }
}

function readStoreAppliedVersion(): string | null {
  try {
    const v = panelStore.getItem(APPLIED_STORE_KEY);
    return v?.trim() ? v.trim().replace(/^v/i, "") : null;
  } catch {
    return null;
  }
}

/** Newest among build embed, CSXS manifest, apply stamp (disk + panel store). */
export function getEffectiveLocalVersion(
  buildVersion: string = BUILD_VERSION,
): string {
  const candidates = [
    buildVersion,
    readInstalledBundleVersion(),
    readDiskUpdateStamp(),
    readStoreAppliedVersion(),
  ].filter((v): v is string => Boolean(v && v.trim()));

  let best = candidates[0] || buildVersion;
  for (let i = 1; i < candidates.length; i++) {
    if (compareVersions(candidates[i], best) > 0) best = candidates[i];
  }
  return best;
}

/** Persist that this remote version was successfully applied (survives CEF JS cache). */
export function markExtensionUpdateApplied(version: string): void {
  const clean = version.trim().replace(/^v/i, "");
  if (!clean) return;

  try {
    panelStore.setItem(APPLIED_STORE_KEY, clean);
  } catch {
    /* ignore */
  }

  const root = extRoot();
  if (!root || typeof fs?.writeFileSync !== "function") return;
  try {
    const payload: InstalledUpdateStamp = {
      version: clean,
      appliedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(root, INSTALLED_UPDATE_FILE),
      JSON.stringify(payload, null, 2),
      "utf8",
    );
  } catch {
    /* ignore — panel store still helps */
  }
}

/** Reload panel HTML with a cache-bust query so CEF does not serve stale main.js. */
export function reloadPanelHard(): void {
  if (typeof window === "undefined" || !window.location) return;
  try {
    const url = new URL(window.location.href);
    const filePath = url.pathname.replace(/\\/g, "/");
    const onLegacyEntry =
      /\/main\/index\.html$/i.test(filePath) ||
      /\/ui\/spunkram\/index\.html$/i.test(filePath);
    if (onLegacyEntry && BRAND.panelMainPath) {
      const dest = new URL(BRAND.panelMainPath, url);
      dest.searchParams.set("_cep_upd", String(Date.now()));
      window.location.replace(dest.toString());
      return;
    }
    url.searchParams.set("_cep_upd", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    try {
      window.location.reload();
    } catch {
      /* ignore */
    }
  }
}
