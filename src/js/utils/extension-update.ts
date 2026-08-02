import { child_process, fs, os, path } from "../lib/cep/node";
import { csi } from "../lib/utils/bolt";
import { downloadToFile, type DownloadProgress } from "./download-file";

export type ExtensionUpdateProgress = {
  phase: "download" | "extract" | "apply" | "reload";
  bytesReceived: number;
  totalBytes: number | null;
};

function rimrafSafe(target: string): void {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // Fallback for older Node in CEP
    try {
      const st = fs.statSync(target);
      if (st.isDirectory()) {
        for (const name of fs.readdirSync(target)) {
          rimrafSafe(path.join(target, name));
        }
        fs.rmdirSync(target);
      } else {
        fs.unlinkSync(target);
      }
    } catch {
      /* ignore */
    }
  }
}

function copyDirOverwrite(src: string, dest: string): void {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      copyDirOverwrite(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function extractArchive(archivePath: string, destDir: string): void {
  rimrafSafe(destDir);
  fs.mkdirSync(destDir, { recursive: true });

  if (os.platform() === "darwin") {
    const result = child_process.spawnSync(
      "unzip",
      ["-o", archivePath, "-d", destDir],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(
        `unzip failed: ${(result.stderr || result.stdout || "").toString().trim()}`,
      );
    }
    return;
  }

  // Expand-Archive requires .zip extension
  const zipPath = archivePath.toLowerCase().endsWith(".zip")
    ? archivePath
    : `${archivePath}.zip`;
  if (zipPath !== archivePath) {
    fs.copyFileSync(archivePath, zipPath);
  }

  const ps = child_process.spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ],
    { encoding: "utf8" },
  );
  if (zipPath !== archivePath) {
    try {
      fs.unlinkSync(zipPath);
    } catch {
      /* ignore */
    }
  }
  if (ps.status !== 0) {
    throw new Error(
      `Expand-Archive failed: ${(ps.stderr || ps.stdout || "").toString().trim()}`,
    );
  }
}

/**
 * Download a .zxp, unpack over the live extension root (userdata install),
 * then reload the panel.
 */
export async function applyExtensionUpdate(
  zxpUrl: string,
  onProgress?: (p: ExtensionUpdateProgress) => void,
): Promise<void> {
  const extRoot = csi.getSystemPath("extension");
  if (!extRoot || !fs.existsSync(extRoot)) {
    throw new Error("Extension path unavailable");
  }

  const workDir = path.join(os.tmpdir(), `spunkram-update-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const zxpPath = path.join(workDir, "update.zxp");
  const extractDir = path.join(workDir, "extracted");

  try {
    onProgress?.({
      phase: "download",
      bytesReceived: 0,
      totalBytes: null,
    });
    await downloadToFile(zxpUrl, zxpPath, {
      timeoutMs: 15 * 60 * 1000,
      onProgress: (p: DownloadProgress) =>
        onProgress?.({
          phase: "download",
          bytesReceived: p.bytesReceived,
          totalBytes: p.totalBytes,
        }),
    });

    onProgress?.({ phase: "extract", bytesReceived: 0, totalBytes: null });
    extractArchive(zxpPath, extractDir);

    // Some ZXPs nest a single root folder — unwrap if so
    let payloadRoot = extractDir;
    const top = fs.readdirSync(extractDir).filter((n) => n !== "__MACOSX");
    if (top.length === 1) {
      const only = path.join(extractDir, top[0]);
      if (fs.statSync(only).isDirectory()) {
        const hasManifest =
          fs.existsSync(path.join(only, "CSXS")) ||
          fs.existsSync(path.join(only, "csxs")) ||
          fs.existsSync(path.join(only, "manifest.xml"));
        if (hasManifest) payloadRoot = only;
      }
    }

    onProgress?.({ phase: "apply", bytesReceived: 0, totalBytes: null });
    copyDirOverwrite(payloadRoot, extRoot);

    onProgress?.({ phase: "reload", bytesReceived: 0, totalBytes: null });
    // Defer so the UI can paint the final state
    setTimeout(() => {
      if (typeof window !== "undefined" && window.location?.reload) {
        window.location.reload();
      }
    }, 250);
  } finally {
    try {
      rimrafSafe(workDir);
    } catch {
      /* temp cleanup best-effort */
    }
  }
}
