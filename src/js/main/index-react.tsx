import "../polyfill-cep-process";
import React from "react";
import ReactDOM from "react-dom/client";
import { enableSpectrum, initBolt } from "../lib/utils/bolt";
import { installGlobalHandlers } from "@/api/support";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/unbounded/wght.css";
import "../globals.css";
import { App } from "./main";
import { ConfigurationWrapper } from "../../context/ConfigurationWrapper";
import { getFontCatalog } from "../lib/utils/system-fonts";
import { preloadVoiceoverPreviews } from "../api/voiceover";
// host-pick-20260822 cache bust

enableSpectrum();
installGlobalHandlers();

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <ConfigurationWrapper>
      <App />
    </ConfigurationWrapper>
  </React.StrictMode>
);

const afterFirstPaint = () => {
  initBolt();
  void getFontCatalog();
  void preloadVoiceoverPreviews();
};

if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(() => setTimeout(afterFirstPaint, 0));
} else {
  setTimeout(afterFirstPaint, 0);
}
