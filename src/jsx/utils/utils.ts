import type { EventTS } from "../../shared/universals";
import { ns } from "../../shared/shared";

/**
 * @function dispatchTS Displatches an event to the CEP panel with Type-Safety
 * See listenTS() in the CEP panel for more info
 * @param event The event name to listen for (defined in EventTS in shared/universals.ts)
 * @param callback The callback function to be executed when the event is triggered
 */
export const dispatchTS = <Key extends string & keyof EventTS>(
  event: Key,
  data: EventTS[Key]
) => {
  if (new ExternalObject("lib:PlugPlugExternalObject")) {
    var eventObj = new CSXSEvent();
    eventObj.type = `${ns}.${event}`;
    eventObj.data = JSON.stringify(data);
    eventObj.dispatch();
  }
};

export const forEach = <T>(
  arr: T[],
  callback: (item: T, i: number) => void
): void => {
  for (let i = 0; i < arr.length; i++) {
    callback(arr[i], i);
  }
};

export const map = <T>(
  arr: T[],
  callback: (item: T, i: number) => any
): T[] => {
  let res = [];
  for (let i = 0; i < arr.length; i++) {
    res.push(callback(arr[i], i));
  }
  return res;
};

export const filter = <T>(
  arr: T[],
  func: (item: T, i: number) => boolean
): T[] => {
  let res = [];
  for (let i = 0; i < arr.length; i++) {
    if (func(arr[i], i)) {
      res.push(arr[i]);
    }
  }
  return res;
};

export const includes = <T>(arr: T[], value: string | number) => {
  for (let i = 0; i < arr.length; i++) {
    const element = arr[i];
    if (element === value) {
      return true;
    }
  }
  return false;
};

export const indexOf = <T>(arr: T[], value: string | number) => {
  for (let i = 0; i < arr.length; i++) {
    const element = arr[i];
    if (element === value) {
      return i;
    }
  }
  return -1;
};

// Joins paths
export const join = (...args: string[]) => {
  const sep = $.os === "Windows" ? "\\" : "/";
  const len = args.length;
  let res = args[0];
  for (let i = 1; i < len; i++) {
    res = res + sep + args[i];
  }
  return res;
};

/**
 * Read a UTF-8 JSON file written by the CEP panel.
 * Prefer this over passing large/Unicode payloads through evalScript — ExtendScript
 * corrupts raw non-ASCII (Cyrillic) when embedded in the script source string.
 */
export const readJsonUtf8 = (filePath: string): unknown => {
  const f = new File(filePath);
  if (!f.exists) {
    throw new Error("Host JSON file not found: " + filePath);
  }
  f.encoding = "UTF-8";
  if (!f.open("r")) {
    throw new Error("Could not open host JSON file: " + filePath);
  }
  try {
    const raw = f.read();
    return JSON.parse(raw);
  } finally {
    f.close();
  }
};
