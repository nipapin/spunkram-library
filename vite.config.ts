import { defineConfig, loadEnv, type Plugin } from "vite";

import react from "@vitejs/plugin-react";

import { cep, CepOptions, runAction } from "vite-cep-plugin";
import cepConfig from "./cep.config";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { extendscriptConfig } from "./vite.es.config";
import {
  brandCepDist,
  DEFAULT_BRAND,
  getBrand,
  otherBrandId,
  resolveBrand,
} from "./brands.config";
import { writeLegacyCepEntries } from "./src/js/utils/legacy-cep-entries";
import {
  allocateNativeBackupPath,
  isUpdateBackupName,
  NATIVE_BACKUP_DIR,
} from "./src/js/utils/update-backup-path";

const require = createRequire(import.meta.url);
const hostPkgRoot = path.dirname(require.resolve("motionflow-host/package.json"));
const hostEntry = path.join(hostPkgRoot, "src/index.ts");

const extensions = [".js", ".ts", ".tsx"];

const appBrandId = resolveBrand(process.env.APP_BRAND ?? DEFAULT_BRAND);
const brand = getBrand(appBrandId);
const otherBrand = otherBrandId(appBrandId);

const devDist = "dist";
const cepDist = brandCepDist(appBrandId);

const src = path.resolve(__dirname, "src");
const root = path.resolve(src, "js");
const outDir = path.resolve(__dirname, "dist", cepDist);
// vite-cep-plugin writes dist/{cepDist}/{brand}/index.html in configResolved
// without mkdir — create it so `vite` works on a clean tree.
fs.mkdirSync(path.join(outDir, appBrandId), { recursive: true });

function isBusyError(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

/** Copy even when Windows has the dest mapped (loaded Motionflow.dll). */
function copyFileOverwrite(from: string, to: string): void {
  try {
    fs.copyFileSync(from, to);
    return;
  } catch (err) {
    if (!isBusyError(err) || !fs.existsSync(to)) throw err;
  }
  if (isUpdateBackupName(path.basename(to))) {
    console.warn(`[copy-motionflow-bin] skip leftover backup: ${to}`);
    return;
  }
  const backup = allocateNativeBackupPath(to, {
    exists: (p) => fs.existsSync(p),
    join: path.join,
    dirname: path.dirname,
    basename: path.basename,
  });
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.renameSync(to, backup);
  } catch (err) {
    if (!isBusyError(err)) throw err;
    console.warn(
      `[copy-motionflow-bin] skip locked file (close Premiere / After Effects to replace): ${to}`,
    );
    return;
  }
  fs.copyFileSync(from, to);
}

function copyDirRecursive(from: string, to: string): void {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.name === NATIVE_BACKUP_DIR || isUpdateBackupName(entry.name)) continue;
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else copyFileOverwrite(srcPath, destPath);
  }
}

/**
 * Ensure FULL_PROJECT natives land at extension `bin/win/Motionflow.dll`
 * (same layout as Spunkram Beta). cep.config `copyAssets` alone can miss this
 * on symlink/dev builds if dist wasn't refreshed after binaries were added.
 */
function copyMotionflowBinPlugin(): Plugin {
  const from = path.resolve(__dirname, "src/bin");
  const to = path.resolve(__dirname, "dist", cepDist, "bin");
  const copy = () => {
    if (!fs.existsSync(from)) return;
    copyDirRecursive(from, to);
  };
  return {
    name: "copy-motionflow-bin",
    buildStart() {
      copy();
    },
    writeBundle() {
      copy();
    },
    configureServer() {
      copy();
    },
  };
}

/** ZXP must not ship `.debug` — CEP would load the panel from localhost instead of bundled assets. */
function stripCepDebugForZxpPlugin(): Plugin {
  return {
    name: "strip-cep-debug-for-zxp",
    enforce: "pre",
    writeBundle() {
      if (!isPackage) return;
      const debugFile = path.resolve(__dirname, "dist", cepDist, ".debug");
      if (fs.existsSync(debugFile)) fs.unlinkSync(debugFile);
    },
  };
}

/**
 * 0.9.16 overlays the ZXP then `location.reload()`s `./main/index.html`.
 * 0.9.17 reloads `./ui/spunkram/index.html`. Current MainPath is `./spunkram/`.
 * Must run in writeBundle `pre` so signZXP sees the extra entries.
 */
function writeLegacyCepEntriesPlugin(): Plugin {
  return {
    name: "write-legacy-cep-entries",
    enforce: "pre",
    writeBundle() {
      writeLegacyCepEntries(outDir, appBrandId);
    },
  };
}

/**
 * vite-cep-plugin always rewrites HTML assets to `../assets/…` (one folder
 * under the extension root). Nested entries like `ui/gal/index.html` need
 * extra `../`. Must run in writeBundle `pre` so signZXP sees the fixed files.
 */
function fixNestedCepHtmlAssetsPlugin(): Plugin {
  const listHtml = (dir: string): string[] => {
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...listHtml(full));
      else if (entry.name.endsWith(".html")) out.push(full);
    }
    return out;
  };

  return {
    name: "fix-nested-cep-html-assets",
    enforce: "pre",
    writeBundle() {
      for (const htmlPath of listHtml(outDir)) {
        const rel = path.relative(outDir, htmlPath);
        const dir = path.dirname(rel);
        const depth =
          !dir || dir === "."
            ? 0
            : dir.split(path.sep).filter(Boolean).length;
        if (depth <= 1) continue;
        const prefix = `${"../".repeat(depth)}assets`;
        const html = fs.readFileSync(htmlPath, "utf8");
        const next = html
          .replace(/(src|href)="\.\.\/assets/g, `$1="${prefix}`)
          .replace(/(src|href)="\/assets/g, `$1="${prefix}`);
        if (next !== html) fs.writeFileSync(htmlPath, next);
      }
    },
  };
}

const debugReact = process.env.DEBUG_REACT === "true";
const isProduction = process.env.NODE_ENV === "production";
const isMetaPackage = process.env.ZIP_PACKAGE === "true";
const isPackage = process.env.ZXP_PACKAGE === "true" || isMetaPackage;
const isServe = process.env.SERVE_PANEL === "true";
const action = process.env.BOLT_ACTION;

const devEnv = loadEnv("development", __dirname, "");

// Dev Vite proxy target for /api/* — always https://motionflow.pro unless overridden.
const apiTarget = devEnv.MOTIONFLOW_API_TARGET?.trim() || "https://motionflow.pro";

let input: { [key: string]: string } = {};
cepConfig.panels.map((panel) => {
  input[panel.name] = path.resolve(root, panel.mainPath);
});

const config: CepOptions = {
  cepConfig,
  isProduction,
  isPackage,
  isMetaPackage,
  isServe,
  debugReact,
  dir: `${__dirname}/${devDist}`,
  cepDist: cepDist,
  zxpOutput: `${__dirname}/${devDist}/zxp/${cepConfig.id}`,
  zipOutput: `${__dirname}/${devDist}/zip/${cepConfig.displayName}_${cepConfig.version}`,
  packages: cepConfig.installModules || [],
};

if (action) runAction(config, action);

/** Block the other brand's HTML entry so Vite does not crawl it in this process. */
function isolateBrandHtmlPlugin(): Plugin {
  const blocked = `/${otherBrand}`;
  return {
    name: "isolate-brand-html",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (pathname === blocked || pathname.startsWith(`${blocked}/`)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(
            `This Vite process serves ${appBrandId} on :${brand.port}. Use npm run dev:${otherBrand} for ${otherBrand}.`,
          );
          return;
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    isolateBrandHtmlPlugin(),
    react(),
    cep(config),
    stripCepDebugForZxpPlugin(),
    fixNestedCepHtmlAssetsPlugin(),
    writeLegacyCepEntriesPlugin(),
    copyMotionflowBinPlugin(),
  ],
  optimizeDeps: {
    entries: Object.values(input),
  },
  define: {
    __APP_BRAND__: JSON.stringify(appBrandId),
    // Inline so panel JS never touches bare `process` (CEP CEF / ExtendScript).
    "process.env.ZXP_PACKAGE": JSON.stringify(process.env.ZXP_PACKAGE || ""),
    "process.env.ZIP_PACKAGE": JSON.stringify(process.env.ZIP_PACKAGE || ""),
  },
  resolve: {
    alias: [
      { find: "@esTypes", replacement: hostPkgRoot },
      { find: "@", replacement: path.resolve(__dirname, "src/js") },
      { find: "@brands", replacement: path.resolve(__dirname, "brands.config.ts") },
    ],
  },
  root,
  clearScreen: false,
  server: {
    // IPv4 loopback — CEP dev panel binds here; with VPN we prefer
    // 127.0.0.1 over ::1. Default Vite bind is [::1] only → ERR_CONNECTION_REFUSED.
    host: "127.0.0.1",
    port: cepConfig.port,
    strictPort: true,
    watch: {
      ignored: [
        `**/src/js/${otherBrand}/**`,
        `**/src/js/ui/${otherBrand}/**`,
      ],
    },
    // Motion Flow API → https://motionflow.pro (see `apiTarget`). Each brand
    // has its own Vite port — proxy avoids CORS in dev. Paths must end with
    // `/` so Vite modules under `src/js/api/` (e.g. `/api/cep-market.ts`) are
    // not stolen.
    proxy: {
      "/api/stock/": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith("https:"),
      },
      "/api/generations/": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith("https:"),
      },
      "/api/cep/": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith("https:"),
        ws: true,
      },
      "/api/captions/": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith("https:"),
      },
      "/api/captions": {
        // exact catalog path without trailing slash
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith("https:"),
      },
      "/media": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith("https:"),
      },
    },
  },
  preview: {
    port: cepConfig.servePort,
  },

  build: {
    // clean-dist.mjs already emptied dist/; Vite must not retry unlink on a
    // Premiere-mapped Motionflow.dll (EPERM on Windows).
    emptyOutDir: false,
    sourcemap: isPackage ? cepConfig.zxp.sourceMap : cepConfig.build?.sourceMap,
    watch: {
      include: path.join(hostPkgRoot, "src/**"),
    },
    rollupOptions: {
      input,
      output: {
        manualChunks: {},
        preserveModules: false,
        format: "cjs",
        entryFileNames: "assets/[name]-[hash].cjs",
        chunkFileNames: "assets/[name]-[hash].cjs",
      },
    },
    target: "chrome74",
    outDir,
  },
});

// rollup es3 build
const outPathExtendscript = path.join("dist", cepDist, "jsx", "index.js");
extendscriptConfig(
  hostEntry,
  outPathExtendscript,
  cepConfig,
  extensions,
  isProduction,
  isPackage,
  {
    namespace: cepConfig.id,
    authorBin: brand.adobeCommonFolder,
    captionsBin: brand.captionsBin,
    stylesBin: brand.stylesBin,
  },
);
