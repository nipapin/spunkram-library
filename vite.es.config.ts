import fs from "fs";
import { rollup, watch, RollupOptions, OutputOptions } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import replace from "@rollup/plugin-replace";
import { jsxInclude, jsxBin, jsxPonyfill } from "vite-cep-plugin";
import { CEP_Config } from "vite-cep-plugin";
import json from "@rollup/plugin-json";
import path from "path";

const GLOBAL_THIS = "thisObj";

/** Inline env + motionflow-host identity placeholders for ExtendScript bundle. */
function extEnvDefines(host?: {
  namespace: string;
  authorBin: string;
  captionsBin: string;
  stylesBin: string;
}): Record<string, string> {
  const defines: Record<string, string> = {
    "process.env.ZXP_PACKAGE": JSON.stringify(process.env.ZXP_PACKAGE || ""),
    "process.env.ZIP_PACKAGE": JSON.stringify(process.env.ZIP_PACKAGE || ""),
  };
  if (host) {
    defines['"__MF_HOST_NS__"'] = JSON.stringify(host.namespace);
    defines['"__MF_AUTHOR_BIN__"'] = JSON.stringify(host.authorBin);
    defines['"__MF_CAPTIONS_BIN__"'] = JSON.stringify(host.captionsBin);
    defines['"__MF_STYLES_BIN__"'] = JSON.stringify(host.stylesBin);
  }
  return defines;
}

export const extendscriptConfig = (
  extendscriptEntry: string,
  outPath: string,
  cepConfig: CEP_Config,
  extensions: string[],
  isProduction: boolean,
  isPackage: boolean,
  host?: { namespace: string; authorBin: string; captionsBin: string; stylesBin: string },
) => {
  console.log(outPath);
  const config: RollupOptions = {
    input: extendscriptEntry,
    treeshake: true,
    output: {
      file: outPath,
      sourcemap: isPackage
        ? cepConfig.zxp.sourceMap
        : cepConfig.build?.sourceMap,
    },
    plugins: [
      replace({
        values: extEnvDefines(host),
        preventAssignment: true,
      }),
      json(),
      nodeResolve({
        extensions,
      }),
      babel({
        extensions,
        exclude: /node_modules/,
        babelrc: false,
        babelHelpers: "inline",
        presets: ["@babel/preset-env", "@babel/preset-typescript"],
        plugins: [
          "@babel/plugin-syntax-dynamic-import",
          "@babel/plugin-proposal-class-properties",
        ],
      }),
      jsxPonyfill(),
      jsxInclude({
        iife: true,
        globalThis: GLOBAL_THIS,
      }),
      jsxBin(isPackage ? cepConfig.zxp.jsxBin : cepConfig.build?.jsxBin),
    ],
  };

  async function build() {
    const bundle = await rollup(config);
    await bundle.write(config.output as OutputOptions);
    await bundle.close();
  }

  const triggerHMR = () => {
    // No built-in way to trigger Vite's HMR reload from outside the root folder
    // Workaround will read and save index.html file for each panel to triggger reload
    console.log("ExtendScript Change");
    cepConfig.panels.map((panel) => {
      const tmpPath = path.join(process.cwd(), "src", "js", panel.mainPath);
      if (fs.existsSync(tmpPath)) {
        const txt = fs.readFileSync(tmpPath, { encoding: "utf-8" });
        fs.writeFileSync(tmpPath, txt, { encoding: "utf-8" });
      }
    });
  };

  const watchRollup = async () => {
    const watcher = watch(config);
    watcher.on("event", (event: any) => {
      if (event.code === "BUNDLE_END") {
        triggerHMR();
        event.result?.close();
      }
      if (event.code === "ERROR") {
        console.error(event.error);
      }
    });
  };

  if (isProduction) {
    build();
  } else {
    watchRollup();
  }
};
