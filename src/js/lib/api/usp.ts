import { os } from "@/lib/cep/node";
import { csi } from "@/lib/utils/bolt";

export type UserSystemPrint = {
  mac: string;
  user: string;
  os: string;
};

let cached: UserSystemPrint | null = null;

function utf8ToB64(str: string): string {
  return window.btoa(unescape(encodeURIComponent(str)));
}

/** Port of security.encodeUserSystemServerPrint from Spunkram Beta. */
export function encodeUserSystemServerPrint(jsonString: string): string {
  const b64 = utf8ToB64(jsonString);
  const key1 = "SSBsb3ZlIHlvdQ==";
  const key2 = "WkRDcmFja2Vy";
  const key3 = "SGF2ZSBGVU4=";
  let part1 = b64.substring(0, 4);
  part1 += key1.substring(0, key1.length - 2);
  part1 += b64.substring(4, 7);
  part1 += key2;
  part1 += b64.substring(7, 12);
  part1 += key3.substring(0, key3.length - 1);
  part1 += b64.substring(12);
  return part1;
}

function pickMacAddress(): string {
  try {
    const ifaces = os.networkInterfaces?.() ?? {};
    for (const list of Object.values(ifaces)) {
      if (!list) continue;
      for (const info of list) {
        const mac = info.mac;
        if (mac && mac !== "00:00:00:00:00:00") return mac;
      }
    }
  } catch {
    // ignore
  }
  return "unknown";
}

function pickUserName(): string {
  try {
    if (window.cep) {
      const docs = csi.getSystemPath("myDocuments");
      if (docs) {
        const parts = String(docs).replace(/\\/g, "/").split("/").filter(Boolean);
        if (parts.length >= 2) return parts[parts.length - 2];
      }
    }
  } catch {
    // ignore
  }
  try {
    return os.userInfo?.()?.username || os.hostname?.() || "user";
  } catch {
    return "user";
  }
}

function pickOsName(): string {
  try {
    if (window.cep) {
      const info = csi.getOSInformation?.();
      if (info) return String(info);
    }
  } catch {
    // ignore
  }
  try {
    return `${os.type?.() ?? "OS"} ${os.release?.() ?? ""}`.trim();
  } catch {
    return "Unknown OS";
  }
}

export function getUserSystemData(): UserSystemPrint {
  if (cached) return cached;
  cached = {
    mac: pickMacAddress(),
    user: pickUserName(),
    os: pickOsName(),
  };
  return cached;
}

export function getUserSystemPrint(): string {
  return encodeUserSystemServerPrint(JSON.stringify(getUserSystemData()));
}
