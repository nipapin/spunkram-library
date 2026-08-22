import type { CEP_Config } from "vite-cep-plugin";
import { DEFAULT_BRAND, getBrand, resolveBrand } from "./brands.config";
import { version } from "./package.json";

const brand = getBrand(resolveBrand(process.env.APP_BRAND ?? DEFAULT_BRAND));
const id = brand.extensionId;
const displayName = brand.displayName;

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
    { name: "AEFT", version: "[25.0,99.9]" },
    { name: "PPRO", version: "[25.0,99.9]" },
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
      panelDisplayName: brand.panelDisplayName,
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
