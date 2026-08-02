import React from "react";
import ReactDOM from "react-dom/client";
import { initBolt } from "../lib/utils/bolt";
import "../globals.css";
import { App } from "./main";
import { ConfigurationWrapper } from "../../context/ConfigurationWrapper";

initBolt();

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <ConfigurationWrapper>
      <App />
    </ConfigurationWrapper>
  </React.StrictMode>
);
