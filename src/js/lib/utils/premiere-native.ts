import { child_process, crypto, fs, os, path } from "@/lib/cep/node";
import { BRAND } from "@brands";

const COMMON = "/Library/Application Support/Adobe/Common";
const BUNDLES = ["Motionflow", "MotionflowBridge", "MotionflowInit"] as const;
export const MAC_BRIDGE_SETUP_HELP =
  "Install Motionflow Bridge, restart Premiere Pro, then open Preferences > Control Surface > Add and select Motionflow Bridge if it has not been added automatically.";

function bundlePresent(bundle: string, name: string): boolean {
  try {
    return fs.statSync(path.join(bundle, "Contents", "MacOS", name)).size > 0 &&
      fs.statSync(path.join(bundle, "Contents", "Info.plist")).size > 0;
  } catch { return false; }
}

/** Preserve existing locations; the bundled Init binary discovers Bridge at the legacy path. */
export function macBridgeInstallPlan(
  sourceRoot: string,
  exists: (file: string) => boolean = (file) => fs.existsSync(file),
): Array<{ name: string; source: string; destination: string }> {
  return ["MotionflowBridge", "MotionflowInit"].map((name) => {
    const relative = name === "MotionflowBridge" ? "ControlSurface" : "7.0/MediaCore";
    const modern = path.join(COMMON, "Plugins", relative, `${name}.bundle`);
    const legacy = path.join(COMMON, "Plug-ins", relative, `${name}.bundle`);
    return {
      name,
      source: path.join(sourceRoot, `${name}.bundle`),
      destination: exists(modern) ? modern : exists(legacy) || name === "MotionflowBridge" ? legacy : modern,
    };
  });
}

let installedThisSession = false;

export function macBridgeStatus(): { installed: boolean; restartRequired: boolean } {
  const installed = macBridgeInstallPlan("").every(({ name, destination }) =>
    bundlePresent(destination, name),
  );
  return { installed, restartRequired: installed && installedThisSession };
}

function runMacCommand(command: string, args: string[], timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    child_process.execFile(command, args, { timeout, maxBuffer: 512 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).trim()));
      else resolve();
    });
  });
}

const pendingLibraries = new Map<string, Promise<string>>();

/** Extract the signed, bundled natives into userdata; never modify a signed CEP install. */
export function ensureMacMotionflowLibrary(extensionRoot: string): Promise<string> {
  const pending = pendingLibraries.get(extensionRoot);
  if (pending) return pending;
  const task = (async () => {
    const archive = path.join(extensionRoot, "bin", "mac", "cep-plugins.zip");
    if (!fs.existsSync(archive)) throw new Error("Mac native helpers are missing. Reinstall the extension.");
    const hash = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex").slice(0, 24);
    const parent = path.join(os.homedir(), "Library", "Application Support",
      BRAND.prefsCompany, BRAND.prefsProduct, "native", "mac");
    const nativeRoot = path.join(parent, hash);
    const complete = (root: string) => BUNDLES.every(name => bundlePresent(path.join(root, `${name}.bundle`), name));
    if (complete(nativeRoot)) return nativeRoot;
    fs.mkdirSync(parent, { recursive: true });
    const staging = fs.mkdtempSync(path.join(parent, ".bridge-"));
    try {
      await runMacCommand("/usr/bin/ditto", ["-x", "-k", archive, staging]);
      if (!complete(staging)) throw new Error("Mac native helper archive is incomplete. Reinstall the extension.");
      for (const name of BUNDLES) {
        const bundle = path.join(staging, `${name}.bundle`);
        fs.chmodSync(path.join(bundle, "Contents", "MacOS", name), 0o755);
        // Only clear download quarantine on our bundled helpers, retaining their signature.
        await runMacCommand("/usr/bin/xattr", ["-dr", "com.apple.quarantine", bundle]).catch(() => {});
      }
      // A sibling Adobe host may have finished extracting the same archive.
      if (!complete(nativeRoot)) {
        if (fs.existsSync(nativeRoot)) fs.renameSync(nativeRoot, `${nativeRoot}.incomplete-${Date.now()}`);
        try { fs.renameSync(staging, nativeRoot); }
        catch (error) { if (!complete(nativeRoot)) throw error; }
      }
      return nativeRoot;
    } finally {
      try { if (fs.existsSync(staging)) fs.rmdirSync(staging, { recursive: true }); } catch { /* best-effort staging cleanup */ }
    }
  })().finally(() => pendingLibraries.delete(extensionRoot));
  pendingLibraries.set(extensionRoot, task);
  return task;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Called by the Install button: macOS asks for permission to write Adobe's shared directories. */
export async function installMacPremiereBridge(extensionRoot: string): Promise<void> {
  if (os.platform() !== "darwin") throw new Error("This installer is for macOS.");
  const sourceRoot = await ensureMacMotionflowLibrary(extensionRoot);
  const missing = macBridgeInstallPlan(sourceRoot).filter(({ name, destination }) => !bundlePresent(destination, name));
  if (!missing.length) return;
  const commands = missing.map(({ name, source, destination }) => {
    const binary = path.join(destination, "Contents", "MacOS", name);
    return `/bin/mkdir -p ${shellQuote(path.dirname(destination))} && ` +
      `/usr/bin/ditto ${shellQuote(source)} ${shellQuote(destination)} && ` +
      `/bin/chmod 755 ${shellQuote(binary)} && ` +
      `(/usr/bin/xattr -dr com.apple.quarantine ${shellQuote(destination)} 2>/dev/null || true)`;
  }).join(" && ");
  const appleString = `"${commands.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  await runMacCommand("/usr/bin/osascript", ["-e", `do shell script ${appleString} with administrator privileges`], 120000);
  if (!macBridgeStatus().installed) throw new Error("Motionflow Bridge installation did not complete. Please try again.");
  installedThisSession = true;
}
