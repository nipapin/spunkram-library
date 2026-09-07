import "../../polyfill-cep-process";
import "../../ai/cep-ai";
import React from "react";
import ReactDOM from "react-dom/client";
import { enableSpectrum, initBolt } from "../../lib/utils/bolt";
import { installGlobalHandlers } from "@/api/support";
import "@fontsource-variable/inter/opsz.css";
import "../../globals.css";
import "../../themes/brands-runtime.scss";
import { initBrandTheme } from "../../lib/utils/brandTheme";
import { GalApp } from "./GalApp";
import { getFontCatalog } from "../../lib/utils/system-fonts";

initBrandTheme();
enableSpectrum();
installGlobalHandlers();

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <GalApp />
  </React.StrictMode>,
);

const afterFirstPaint = () => {
  initBolt();
  void getFontCatalog();
};

if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => setTimeout(afterFirstPaint, 0));
} else {
  setTimeout(afterFirstPaint, 0);
}
