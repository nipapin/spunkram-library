import { jsx as _jsx } from "react/jsx-runtime";
import "../../polyfill-cep-process";
import "../../ai/cep-ai";
import React from "react";
import ReactDOM from "react-dom/client";
import { enableSpectrum, initBolt } from "../../lib/utils/bolt";
import { installGlobalHandlers } from "@/api/support";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/unbounded/wght.css";
import "../../globals.css";
import "../../themes/brands-runtime.scss";
import { initBrandTheme } from "../../lib/utils/brandTheme";
import { App } from "./main";
import { ConfigurationWrapper } from "../../../context/ConfigurationWrapper";
initBrandTheme();
enableSpectrum();
installGlobalHandlers();
ReactDOM.createRoot(document.getElementById("app")).render(_jsx(React.StrictMode, { children: _jsx(ConfigurationWrapper, { children: _jsx(App, {}) }) }));
const afterFirstPaint = () => {
    initBolt();
};
if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => setTimeout(afterFirstPaint, 0));
}
else {
    setTimeout(afterFirstPaint, 0);
}
