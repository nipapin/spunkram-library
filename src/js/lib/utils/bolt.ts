import CSInterface, { CSEvent } from "../cep/csinterface";
import Vulcan, { VulcanMessage } from "../cep/vulcan";
import { ns } from "../../../shared/shared";
import { fs } from "../cep/node";

export const csi = new CSInterface();
export const vulcan = new Vulcan();

// jsx utils

/**
 * @function EvalES
 * Evaluates a string in ExtendScript scoped to the project's namespace
 * Optionally, pass true to the isGlobal param to avoid scoping
 *
 * @param script    The script as a string to be evaluated
 * @param isGlobal  Optional. Defaults to false,
 *
 * @return String Result.
 */

export const evalES = (script: string, isGlobal = false): Promise<string> => {
  return new Promise(function (resolve, reject) {
    const pre = isGlobal
      ? ""
      : `var host = typeof $ !== 'undefined' ? $ : window; host["${ns}"].`;
    const fullString = pre + script;
    csi.evalScript(
      "try{" + fullString + "}catch(e){try{$.writeln('[cep] '+e);}catch(_w){}}",
      (res: string) => {
        resolve(res);
      }
    );
  });
};

import type { Scripts } from "@esTypes/index";
import type { EventTS } from "../../../shared/universals";
import { initializeCEP } from "./init-cep";
import { initHostIdentity } from "./host-identity";

type ArgTypes<F extends Function> = F extends (...args: infer A) => any
  ? A
  : never;
type ReturnType<F extends Function> = F extends (...args: infer A) => infer B
  ? B
  : never;

/**
 * @description End-to-end type-safe ExtendScript evaluation with error handling
 * Call ExtendScript functions from CEP with type-safe parameters and return types.
 * Any ExtendScript errors are captured and logged to the CEP console for tracing
 *
 * @param functionName The name of the function to be evaluated.
 * @param args the list of arguments taken by the function.
 *
 * @return Promise resolving to function native return type.
 *
 * @example
 * // CEP
 * evalTS("myFunc", 60, 'test').then((res) => {
 *    console.log(res.word);
 * });
 *
 * // ExtendScript
 * export const myFunc = (num: number, word: string) => {
 *    return { num, word };
 * }
 *
 */

export const evalTS = <
  Key extends string & keyof Scripts,
  Func extends Function & Scripts[Key]
>(
  functionName: Key,
  ...args: ArgTypes<Func>
): Promise<ReturnType<Func>> => {
  return new Promise(function (resolve, reject) {
    const formattedArgs = args
      .map((arg) => `${JSON.stringify(arg)}`)
      .join(",");
    csi.evalScript(
      `try{
          var host = typeof $ !== 'undefined' ? $ : window;
          var api = host["${ns}"];
          if (!api || typeof api.${functionName} !== "function") {
            throw new Error("Host function ${functionName} is not loaded. Reload the panel.");
          }
          var res = api.${functionName}(${formattedArgs});
          var encoded = JSON.stringify(res);
          if (typeof encoded !== "string") encoded = "null";
          encoded;
        }catch(e){
          try { if (e && e.fileName) e.fileName = new File(e.fileName).fsName; } catch (_f) {}
          JSON.stringify({ name: (e && e.name) ? e.name : "Error", message: String(e && e.message != null ? e.message : e) });
        }`,
      (res: string) => {
        try {
          //@ts-ignore
          if (res === "undefined") return resolve();
          // CEP returns "" when JSON.stringify(undefined) or after an AE alert().
          // JSON.parse("") → "Unexpected end of JSON input" in the panel.
          if (res == null || res === "") {
            reject(new Error("Host script returned no result. Reload the panel and try again."));
            return;
          }
          if (res === "EvalScript error.") {
            reject(new Error("Host script failed. Reload the panel and try again."));
            return;
          }
          const parsed = JSON.parse(res);
          // Host often returns JSON `null` on soft failure (e.g. describe after alert).
          // `typeof parsed.name` would throw on null and reject("null") → Error: null.
          if (
            parsed &&
            typeof parsed === "object" &&
            typeof (parsed as { name?: unknown }).name === "string" &&
            String((parsed as { name: string }).name)
              .toLowerCase()
              .includes("error")
          ) {
            const msg =
              typeof (parsed as { message?: unknown }).message === "string"
                ? (parsed as { message: string }).message
                : "ExtendScript error";
            console.error(msg);
            reject(new Error(msg));
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(
            error instanceof SyntaxError
              ? new Error("Host script returned invalid data. Reload the panel and try again.")
              : error instanceof Error
                ? error
                : new Error(typeof res === "string" ? res : String(error)),
          );
        }
      }
    );
  });
};

export const evalFile = (file: string) => {
  return evalES(
    "typeof $ !== 'undefined' ? $.evalFile(\"" +
      file +
      '") : fl.runScript(FLfile.platformPathToURI("' +
      file +
      '"));',
    true
  );
};

/** Перечитать jsx/index.js в AE — иначе после правки ExtendScript остаётся старый код до рестарта панели. */
export const reloadJSX = async (): Promise<string> => {
  if (!window.cep) return "";
  await initBolt(false);
  const extRoot = csi.getSystemPath("extension");
  const jsxSrc = `${extRoot}/jsx/index.js`;
  if (!fs.existsSync(jsxSrc)) return "";
  return evalFile(jsxSrc.replace(/\\/g, "/"));
};

/**
 * @function listenTS End-to-end Type-Safe ExtendScript to JavaScript Events
 * Uses the PlugPlug ExternalObject to trigger events in CEP panels
 * Function comes scoped to the panel's namespace to avoid conflicts
 * Simply declare your event name and value in the shared/universals.ts file
 * Listen for events with listenTS() in your CEP panel
 * Trigger those events with dispatchTS() ExtendScript
 * @param event The event name to listen for (defined in EventTS in shared/universals.ts)
 * @param callback The callback function to be executed when the event is triggered
 * @param isLocal Whether to scope the event to the panel's namespace. Defaults to true
 *
 * @example
 *
 * // 1. Declare Type in EventTS in shared/universals.ts
 * export type EventTS = {
 *  'myCustomEvent': {
 *   name: string;
 *   value: number;
 * }
 *  // [... other events]
 * };
 *
 * // 2. Listen in CEP
 * listenTS("myCustomEvent", (data) => {
 *   console.log("name is", data.name);
 *   console.log("value is", data.value);
 * });
 *
 * // 3. Dispatch in ExtendScript
 * dispatchTS("myCustomEvent", { name: "name", value: 20 });
 *
 */
export const listenTS = <Key extends string & keyof EventTS>(
  event: Key,
  callback: (data: EventTS[Key]) => void,
  isLocal = true
) => {
  const fullEvent = isLocal ? `${ns}.${event}` : event;
  const csi = new CSInterface();
  // console.log(`listening to ${fullEvent}`);
  const thisCallback = (e: { data: EventTS[Key] }) => {
    callback(e.data);
  };

  // remove any existing listeners
  csi.removeEventListener(fullEvent, thisCallback, null);
  // add the event listener
  csi.addEventListener(fullEvent, thisCallback);
};

/**
 * @function dispatchTS Displatches an event within or between CEP panels with Type-Safety
 * See listenTS() in the CEP panel for more info
 * @param event The event name to listen for (defined in EventTS in shared/universals.ts)
 * @param callback The callback function to be executed when the event is triggered
 * @param scope The scope of the event. Defaults to "APPLICATION"
 * @param appId The application ID. Defaults to the current application
 * @param id The extension ID. Defaults to the current extension
 * @param isLocal Whether to scope the event to the panel's namespace. Defaults to true
 */
export const dispatchTS = <Key extends string & keyof EventTS>(
  event: Key,
  data: EventTS[Key],
  scope = "APPLICATION",
  appId = csi.getApplicationID() as string,
  id = csi.getExtensionID() as string,
  isLocal = true
) => {
  const fullEvent = isLocal ? `${ns}.${event}` : event;
  // console.log(`dispatching ${fullEvent}`);
  const csEvent = new CSEvent(fullEvent, scope, appId, id);
  csEvent.data = data;
  csi.dispatchEvent(csEvent);
};

// js utils

let boltInit: Promise<void> | null = null;

/** Load jsx/index.js once. Concurrent evalFile of the same host file leaves $[ns] half-defined. */
export const initBolt = (log = true): Promise<void> => {
  if (!window.cep) return Promise.resolve();
  if (boltInit) return boltInit;
  boltInit = (async () => {
    const extRoot = csi.getSystemPath("extension");
    const jsxSrc = `${extRoot}/jsx/index.js`;
    const jsxBinSrc = `${extRoot}/jsx/index.jsxbin`;
    if (fs.existsSync(jsxSrc)) {
      if (log) console.log(jsxSrc);
      await evalFile(jsxSrc.replace(/\\/g, "/"));
    } else if (fs.existsSync(jsxBinSrc)) {
      if (log) console.log(jsxBinSrc);
      await evalFile(jsxBinSrc.replace(/\\/g, "/"));
    }
    initializeCEP();
    // Start host identity probe early (non-blocking) so getResolvedHostSync()
    // returns the correct value by the time UI interactions need it.
    // This fixes AE 24–25 where CSInterface can report "PPRO" in After Effects.
    initHostIdentity();
  })();
  return boltInit;
};

export const posix = (str: string) => str.replace(/\\/g, "/");

export const openLinkInBrowser = (url: string) => {
  if (window.cep) {
    csi.openURLInDefaultBrowser(url);
  } else {
    location.href = url;
  }
};

export const getAppBackgroundColor = () => {
  const { green, blue, red } = JSON.parse(
    window.__adobe_cep__.getHostEnvironment() as string
  ).appSkinInfo.panelBackgroundColor.color;
  return {
    rgb: {
      r: red,
      g: green,
      b: blue,
    },
    hex: `#${red.toString(16)}${green.toString(16)}${blue.toString(16)}`,
  };
};

export const subscribeBackgroundColor = (callback: (color: string) => void) => {
  const getColor = () => {
    const newColor = getAppBackgroundColor();
    console.log("BG Color Updated: ", { rgb: newColor.rgb });
    const { r, g, b } = newColor.rgb;
    return `rgb(${r}, ${g}, ${b})`;
  };
  // get current color
  callback(getColor());
  // listen for changes
  csi.addEventListener(
    "com.adobe.csxs.events.ThemeColorChanged",
    () => callback(getColor()),
    {}
  );
};

// vulcan

declare type IVulcanMessageObject = {
  event: string;
  callbackID?: string;
  data?: string | null;
  payload?: object;
};

export const vulcanSend = (id: string, msgObj: IVulcanMessageObject) => {
  const msg = new VulcanMessage(VulcanMessage.TYPE_PREFIX + id, null, null);
  const msgStr = JSON.stringify(msgObj);
  msg.setPayload(msgStr);
  vulcan.dispatchMessage(msg);
};

export const vulcanListen = (id: string, callback: Function) => {
  vulcan.addMessageListener(
    VulcanMessage.TYPE_PREFIX + id,
    (res: any) => {
      var msgStr = vulcan.getPayload(res);
      const msgObj = JSON.parse(msgStr);
      callback(msgObj);
    },
    null
  );
};

export const isAppRunning = (targetSpecifier: string) => {
  const { major, minor, micro } = csi.getCurrentApiVersion();
  const version = parseFloat(`${major}.${minor}`);
  if (version >= 11.2) {
    return vulcan.isAppRunningEx(targetSpecifier.toUpperCase());
  } else {
    return vulcan.isAppRunning(targetSpecifier);
  }
};

interface IOpenDialogResult {
  data: string[];
}
export const selectFolder = (
  dir: string,
  msg: string,
  callback: (res: string) => void
) => {
  const result = (
    window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog
  )(false, true, msg, dir) as IOpenDialogResult;
  if (result.data?.length > 0) {
    const folder = decodeURIComponent(result.data[0].replace("file://", ""));
    callback(folder);
  }
};

/** Promise wrapper around {@link selectFolder}; resolves `null` if the user cancels. */
export const selectFolderAsync = (
  dir: string,
  msg: string,
): Promise<string | null> =>
  new Promise((resolve) => {
    try {
      const result = (
        window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog
      )(false, true, msg, dir) as IOpenDialogResult;
      if (result.data?.length > 0) {
        resolve(decodeURIComponent(result.data[0].replace("file://", "")));
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });

export const selectFile = (
  dir: string,
  msg: string,
  callback: (res: string) => void
) => {
  const result = (
    window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog
  )(false, false, msg, dir) as IOpenDialogResult;
  if (result.data?.length > 0) {
    const folder = decodeURIComponent(result.data[0].replace("file://", ""));
    callback(folder);
  }
};

/**
 * @function enableSpectrum fixes an issue with React Spectrum and PointerEvents on MacOS
 * Run once at the start of your app to fix this issue
 */

export const enableSpectrum = () => {
  if (window.PointerEvent) {
    //@ts-ignore
    delete window.PointerEvent;
  }
};
