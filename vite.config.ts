import { defineConfig, loadEnv, type Plugin } from "vite";

import react from "@vitejs/plugin-react";

import { cep, CepOptions, runAction } from "vite-cep-plugin";
import cepConfig from "./cep.config";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { extendscriptConfig } from "./vite.es.config";
import { BRAND } from "./src/js/lib/config/brand-core";

const require = createRequire(import.meta.url);
const hostPkgRoot = path.dirname(require.resolve("motionflow-host/package.json"));
const hostEntry = path.join(hostPkgRoot, "src/index.ts");

const extensions = [".js", ".ts", ".tsx"];

const devDist = "dist";
const cepDist = "cep";

const src = path.resolve(__dirname, "src");
const root = path.resolve(src, "js");
const outDir = path.resolve(__dirname, "dist", cepDist);

function copyDirRecursive(from: string, to: string): void {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cep(config), stripCepDebugForZxpPlugin(), copyMotionflowBinPlugin()],
  define: {
    __APP_BRAND__: JSON.stringify("spunkram"),
    // Inline so panel JS never touches bare `process` (CEP CEF / ExtendScript).
    "process.env.ZXP_PACKAGE": JSON.stringify(process.env.ZXP_PACKAGE || ""),
    "process.env.ZIP_PACKAGE": JSON.stringify(process.env.ZIP_PACKAGE || ""),
  },
  resolve: {
    alias: [
      { find: "@esTypes", replacement: hostPkgRoot },
      { find: "@", replacement: path.resolve(__dirname, "src/js") },
    ],
  },
  root,
  clearScreen: false,
  server: {
    // IPv4 loopback — CEP dev panel binds here; with VPN we prefer
    // 127.0.0.1 over ::1. Default Vite bind is [::1] only → ERR_CONNECTION_REFUSED.
    host: "127.0.0.1",
    port: cepConfig.port,
    // Motion Flow API → https://motionflow.pro (see `apiTarget`). Panel Vite is
    // on :4000 — proxy avoids CORS in dev. Paths must end with `/` so Vite
    // modules under `src/js/api/` (e.g. `/api/cep-market.ts`) are not stolen.
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
    captionsBin: BRAND.captionsBin,
    stylesBin: BRAND.stylesBin,
  },
);
