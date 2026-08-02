import type { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

/**
 * Local/dev uses a separate ExtensionBundleId so a production ZXP
 * (`com.spunkramlibrary.cep`) can stay installed alongside the symlink/dev panel.
 * Package builds (`npm run zxp` / `zip`) switch to the production id + menu name.
 */
const isPackage =
  process.env.ZXP_PACKAGE === "true" || process.env.ZIP_PACKAGE === "true";

const id = isPackage
  ? "com.spunkramlibrary.cep"
  : "com.spunkramlibrarydev.cep";

const displayName = isPackage ? "Spunkram Library" : "Spunkram Library Dev";

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

  panels: [
    {
      mainPath: "./main/index.html",
      name: "main",
      panelDisplayName: displayName,
      autoVisible: true,
      width: 600,
      height: 650,
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
  copyAssets: ["js/lib/bin"],
  copyZipAssets: [],
};
export default config;
