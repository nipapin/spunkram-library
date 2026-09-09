/**
 * Identify which CEP device records belong to this machine.
 * `/me` may omit `current`; the account UI already infers "this device" by MAC.
 */

export type DeviceSessionIdentity = {
  id: string;
  user_fingerprint?: string;
  current?: boolean;
};

export type LocalSystemPrint = {
  mac?: string;
  user?: string;
  os?: string;
};

function parseFingerprint(raw: string): { mac?: string; user?: string; os?: string } {
  try {
    return JSON.parse(raw) as { mac?: string; user?: string; os?: string };
  } catch {
    return {};
  }
}

/** 6-byte MAC as 12 hex chars. Hashed fingerprints (32+ hex) are not MACs. */
export function realMacHex(raw?: string): string | null {
  const hex = (raw || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  return hex.length === 12 ? hex : null;
}

export function isThisMachineDevice(
  device: DeviceSessionIdentity,
  local: LocalSystemPrint,
): boolean {
  if (device.current) return true;
  const localMac = realMacHex(local.mac);
  if (!localMac) return false;
  const fp = parseFingerprint(device.user_fingerprint || "");
  return realMacHex(fp.mac) === localMac;
}

export function thisMachineDeviceIds(
  devices: DeviceSessionIdentity[],
  local: LocalSystemPrint,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const device of devices) {
    const id = typeof device.id === "string" ? device.id.trim() : "";
    if (!id || seen.has(id) || !isThisMachineDevice(device, local)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function partitionLoginDevices<T extends DeviceSessionIdentity>(
  devices: T[],
  local: LocalSystemPrint,
): { thisMachine: T[]; others: T[] } {
  const thisMachine: T[] = [];
  const others: T[] = [];
  for (const device of devices) {
    if (isThisMachineDevice(device, local)) thisMachine.push(device);
    else others.push(device);
  }
  return { thisMachine, others };
}
