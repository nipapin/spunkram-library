import type { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

/**
 * Extension identity:
 * - `npm run zxp` / `zip` / `release` → prod: com.spunkramlibrary.cep
 * - `npm run zxp:dev` / local symlink / watch → dev: com.spunkramlibrarydev.cep
 *
 * IMPORTANT: use exact `process.env.NAME` member expressions (not dynamic
 * `process.env[name]`). Vite `define` + Rollup `replace` inline them at build
 * time so ExtendScript / CEP never see bare `process` (ReferenceError).
 *
 * Prod ZXP is already installed at com.spunkramlibrary.cep — local `npm run build`
 * must keep the Dev id so it does not fight that folder.
 */
const flavor = (process.env.SPUNKRAM_EXT_FLAVOR || "").toLowerCase();
const isPackage =
  process.env.ZXP_PACKAGE === "true" || process.env.ZIP_PACKAGE === "true";
const isDevExt =
  flavor === "dev" || (flavor !== "prod" && !isPackage);

const id = isDevExt
  ? "com.spunkramlibrarydev.cep"
  : "com.spunkramlibrary.cep";

const displayName = isDevExt ? "Spunkram Library Dev" : "Spunkram Library";

const config: CEP_Config = {
  version,
  id,
  displayName,
  symlink: "local",
  port: 4000,
  servePort: 5000,
  startingDebugPort: 8860,
  extensionManifestVersion: 6.0,
  requiredRuntimeVersion: 9.0,
  hosts: [
    { name: "AEFT", version: "[0.0,99.9]" },
    { name: "PPRO", version: "[0.0,99.9]" },
  ],

  type: "Panel",
  iconDarkNormal: "./src/assets/light-icon.png",
  iconNormal: "./src/assets/dark-icon.png",
  iconDarkNormalRollOver: "./src/assets/light-icon.png",
  iconNormalRollOver: "./src/assets/dark-icon.png",
  parameters: [
    "--v=0",
    "--enable-nodejs",
    "--mixed-context",
    "--allow-file-access",
    "--allow-file-access-from-files",
  ],
  width: 500,
  height: 550,
  minWidth: 420,

  panels: [
    {
      mainPath: "./main/index.html",
      name: "main",
      panelDisplayName: displayName,
      autoVisible: true,
      width: 600,
      height: 650,
      minWidth: 420,
    },
  ],
  build: {
    jsxBin: "off",
    sourceMap: true,
  },
  zxp: {
    country: "US",
    province: "CA",
    org: "Company",
    password: "password",
    tsa: [
      "http://timestamp.digicert.com/", // Windows Only
      "http://timestamp.apple.com/ts01", // MacOS Only
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "off",
  },
  installModules: [],
  // audio-export.epr + Motionflow.dll / PTX / Premiere bridge at extension root bin/
  copyAssets: ["js/lib/bin", "bin"],
  copyZipAssets: [],
};
export default config;
