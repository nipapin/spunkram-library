/**
 * Install pack fonts into the user font library (port of Spunkram Beta `fonts.js`).
 * Looks for `Fonts/` (or legacy `* Fonts`) next to the pack file.
 */
import { child_process, fs, os, path } from "../cep/node";
import { csi } from "./bolt";
import { resolvePackFontsPath } from "./pack-folders";
import { reportSupportInfo } from "@/api/support";

const FONT_EXT = new Set([".ttf", ".otf"]);

function cepFsAvailable(): boolean {
  return typeof fs?.existsSync === "function" && typeof fs?.readdirSync === "function";
}

function resolveUserFontsDir(): string {
  const isWin = os.platform?.() === "win32";
  if (isWin) {
    try {
      const userData =
        typeof csi?.getSystemPath === "function"
          ? csi.getSystemPath("userData")
          : "";
      if (userData) {
        // Beta: dirname(USER_DATA)/Local/Microsoft/Windows/Fonts
        return path.join(
          path.dirname(userData),
          "Local",
          "Microsoft",
          "Windows",
          "Fonts",
        );
      }
    } catch {
      // fall through
    }
    return path.join(
      os.homedir(),
      "AppData",
      "Local",
      "Microsoft",
      "Windows",
      "Fonts",
    );
  }
  return path.join(os.homedir(), "Library", "Fonts");
}

function grabFonts(rootDir: string): string[] {
  const result: string[] = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (FONT_EXT.has(ext)) result.push(fullPath);
      }
    }
  }
  return result;
}

/**
 * Copy pack fonts into the OS user fonts folder (skip already installed).
 * Safe no-op when Fonts folder is missing.
 */
export async function installPackFonts(packFilePath: string): Promise<number> {
  if (!cepFsAvailable()) return 0;
  const fontsFolder = resolvePackFontsPath(packFilePath);
  if (!fontsFolder || !fs.existsSync(fontsFolder)) return 0;

  const fonts = grabFonts(fontsFolder);
  if (fonts.length === 0) return 0;

  const userFontsDir = resolveUserFontsDir();
  if (!fs.existsSync(userFontsDir)) {
    try {
      fs.mkdirSync(userFontsDir, { recursive: true });
    } catch {
      return 0;
    }
  }

  const isWin = os.platform?.() === "win32";
  const regPath =
    "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
  let installed = 0;

  for (const font of fonts) {
    const fontName = path.basename(font);
    const targetFile = path.join(userFontsDir, fontName);
    try {
      if (fs.existsSync(targetFile)) continue;
      fs.copyFileSync(font, targetFile);
      if (isWin && typeof child_process?.execSync === "function") {
        try {
          child_process.execSync(
            `reg add "${regPath}" /f /t REG_SZ /v "${fontName}" /d "${targetFile}"`,
            { windowsHide: true, stdio: "ignore" },
          );
        } catch {
          // copied file is still usable for many apps even if reg fails
        }
      }
      installed += 1;
    } catch {
      // skip individual font failures
    }
  }

  if (installed > 0) {
    reportSupportInfo("pack.fonts", `Installed ${installed} font(s)`, {
      fontsFolder: path.basename(fontsFolder),
      installed,
    });
  }
  return installed;
}
