import { defineConfig, loadEnv } from "vite";

import react from "@vitejs/plugin-react";

import { cep, CepOptions, runAction } from "vite-cep-plugin";
import cepConfig from "./cep.config";
import path from "path";
import { extendscriptConfig } from "./vite.es.config";

const extensions = [".js", ".ts", ".tsx"];

const devDist = "dist";
const cepDist = "cep";

const src = path.resolve(__dirname, "src");
const root = path.resolve(src, "js");
const outDir = path.resolve(__dirname, "dist", cepDist);

const debugReact = process.env.DEBUG_REACT === "true";
const isProduction = process.env.NODE_ENV === "production";
const isMetaPackage = process.env.ZIP_PACKAGE === "true";
const isPackage = process.env.ZXP_PACKAGE === "true" || isMetaPackage;
const isServe = process.env.SERVE_PANEL === "true";
const action = process.env.BOLT_ACTION;

const devEnv = loadEnv("development", __dirname, "");

// Secret for the CEP dev-admin bypass (backend resolve-captions-user).
// Loaded from .env.local (gitignored, never committed) and only ever inlined into
// non-distributed builds (dev/watch/build) — packaged zxp/zip builds always get "",
// so real users never receive it even if .env.local exists on the build machine.
const cepDevAdminToken = isPackage ? "" : (devEnv.CEP_DEV_ADMIN_TOKEN ?? "");

// Dev Vite proxy target for /api/* — always https://motionflow.pro unless overridden.
const apiTarget = devEnv.MOTIONFLOW_API_TARGET?.trim() || "https://motionflow.pro";
// Client-side auth/voiceover mocks — off by default; enable with CEP_API_MOCKS=true.
const cepApiMocks = !isPackage && devEnv.CEP_API_MOCKS === "true";

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
  plugins: [
    react(),
    cep(config),
  ],
  define: {
    __APP_BRAND__: JSON.stringify("spunkram"),
    __CEP_DEV_ADMIN_TOKEN__: JSON.stringify(cepDevAdminToken),
    __CEP_API_MOCKS__: JSON.stringify(cepApiMocks),
  },
  resolve: {
    alias: [
      { find: "@esTypes", replacement: path.resolve(__dirname, "src") },
      { find: "@", replacement: path.resolve(__dirname, "src/js") },
    ],
  },
  root,
  clearScreen: false,
  server: {
    port: cepConfig.port,
    // Motion Flow API → https://motionflow.pro (see `apiTarget`). Panel Vite is
    // on :4000 — proxy avoids CORS in dev. Paths must end with `/` so Vite
    // modules under `src/js/api/` (e.g. `/api/cep-market.ts`) are not stolen.
    proxy: {
      "/api/generations/": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith("https:"),
      },
      "/api/cep/": {
        target: apiTarget,
        changeOrigin: true,
        secure: apiTarget.startsWith("https:"),
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
      include: "src/jsx/**",
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
  `src/jsx/index.ts`,
  outPathExtendscript,
  cepConfig,
  extensions,
  isProduction,
  isPackage,
);
