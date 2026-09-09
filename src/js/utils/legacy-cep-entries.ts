import fs from "fs";
import path from "path";

/**
 * Hashed `assets/main-*.cjs` from shipped Spunkram ZXPs that still overlay
 * (additive copy + `location.reload()` of the *old* HTML). A tiny redirect
 * stub at that filename beats CEF HTML cache: old HTML loads the stub, which
 * jumps to the current panel entry.
 *
 * 0.9.16 `main/index.html` → `../assets/main-B6WaLxLX.cjs`
 * 0.9.17 `ui/spunkram/index.html` → `../assets/main-PMs0Ubu9.cjs` (resolves to ui/assets/)
 * 0.9.18–0.9.20 `spunkram/index.html` → hashed files under `assets/`
 */
export const LEGACY_SPUNKRAM_PANEL_JS = [
  "main-B6WaLxLX.cjs", // 0.9.16
  "main-PMs0Ubu9.cjs", // 0.9.17
  "main-d27BGAJO.cjs", // 0.9.18
  "main-i7DYxa8R.cjs", // 0.9.19
  "main-BEivV1LH.cjs", // 0.9.20
] as const;

export function hashedAssetRedirectStub(targetHtmlFromThisFile: string): string {
  const dest = targetHtmlFromThisFile.replace(/\\/g, "/");
  return `(function(){try{window.location.replace("${dest}?_cep_upd="+Date.now());}catch(e){}})();`;
}

export function rewriteHtmlAssetDepth(html: string, fromDepth: number, toDepth: number): string {
  const from = `${"../".repeat(fromDepth)}assets`;
  const to = `${"../".repeat(toDepth)}assets`;
  if (from === to) return html;
  return html.split(`"${from}`).join(`"${to}`).split(`'${from}`).join(`'${to}`);
}

function currentHashedMains(assetsDir: string, ext: ".cjs" | ".css"): Set<string> {
  if (!fs.existsSync(assetsDir)) return new Set();
  return new Set(
    fs
      .readdirSync(assetsDir)
      .filter((n) => n.startsWith("main-") && n.endsWith(ext)),
  );
}

/**
 * After Vite emits `{brand}/index.html`, also write the CEP paths older
 * overlays still reload, plus tiny stubs at historical JS hashes.
 */
export function writeLegacyCepEntries(outDir: string, brandId: string): string[] {
  const written: string[] = [];
  const brandHtmlPath = path.join(outDir, brandId, "index.html");
  if (!fs.existsSync(brandHtmlPath)) return written;

  const html = fs.readFileSync(brandHtmlPath, "utf8");

  const mainDir = path.join(outDir, "main");
  fs.mkdirSync(mainDir, { recursive: true });
  const mainHtml = path.join(mainDir, "index.html");
  fs.writeFileSync(mainHtml, html);
  written.push(mainHtml);

  if (brandId !== "spunkram") return written;

  const nestedDir = path.join(outDir, "ui", "spunkram");
  fs.mkdirSync(nestedDir, { recursive: true });
  const nestedHtml = path.join(nestedDir, "index.html");
  fs.writeFileSync(nestedHtml, rewriteHtmlAssetDepth(html, 1, 2));
  written.push(nestedHtml);

  const assetsDir = path.join(outDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const currentJs = currentHashedMains(assetsDir, ".cjs");
  const rootStub = hashedAssetRedirectStub("../spunkram/index.html");
  for (const name of LEGACY_SPUNKRAM_PANEL_JS) {
    if (currentJs.has(name)) continue;
    const dest = path.join(assetsDir, name);
    fs.writeFileSync(dest, rootStub);
    written.push(dest);
  }

  // 0.9.17 HTML used `../assets/…` from `ui/spunkram/` → `ui/assets/…`
  const uiAssets = path.join(outDir, "ui", "assets");
  fs.mkdirSync(uiAssets, { recursive: true });
  const nestedStub = hashedAssetRedirectStub("../../spunkram/index.html");
  const uiLegacyJs = path.join(uiAssets, "main-PMs0Ubu9.cjs");
  if (!currentJs.has("main-PMs0Ubu9.cjs")) {
    fs.writeFileSync(uiLegacyJs, nestedStub);
    written.push(uiLegacyJs);
  }

  return written;
}
