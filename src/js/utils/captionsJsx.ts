import { fs, path } from "../lib/cep/node";
import { csi } from "../lib/utils/bolt";
import { ensureDir, getStylesRoot } from "../styles/paths";

/**
 * Expression library the caption templates read through
 * `footage("captions.jsx").sourceData`. The .aep stores the absolute path of
 * the machine it was authored on, so the footage item always arrives missing
 * and has to be pointed at our copy. Ships in js/lib/bin (see copyAssets).
 */
function bundledPath(): string | null {
  try {
    const extRoot = csi.getSystemPath("extension");
    const jsxPath = path.join(extRoot, "js", "lib", "bin", "captions.jsx");
    return fs.existsSync(jsxPath) ? jsxPath : null;
  } catch {
    return null;
  }
}

/**
 * Linking straight to the extension folder breaks every saved project on the
 * next update (the path carries the extension version), so mirror the file into
 * the brand app data folder and hand out that stable location instead.
 */
export function getBundledCaptionsJsxPath(): string | null {
  const bundled = bundledPath();
  if (!bundled) return null;

  const root = getStylesRoot();
  if (!root || !ensureDir(root)) return bundled;

  const stable = path.join(root, "captions.jsx");
  try {
    const src = fs.statSync(bundled);
    const copy = fs.existsSync(stable) ? fs.statSync(stable) : null;
    if (!copy || copy.size !== src.size || copy.mtimeMs < src.mtimeMs) {
      fs.writeFileSync(stable, fs.readFileSync(bundled));
    }
    return stable;
  } catch {
    return bundled;
  }
}
