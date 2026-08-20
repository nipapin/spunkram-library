import "../polyfill-cep-process";
import React from "react";
import ReactDOM from "react-dom/client";
import { initBolt } from "../lib/utils/bolt";
import { installGlobalHandlers } from "@/api/support";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/unbounded/wght.css";
import "../globals.css";
import { App } from "./main";
import { ConfigurationWrapper } from "../../context/ConfigurationWrapper";

initBolt();
installGlobalHandlers();

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <ConfigurationWrapper>
      <App />
    </ConfigurationWrapper>
  </React.StrictMode>
);
