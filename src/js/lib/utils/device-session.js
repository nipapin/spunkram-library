/**
 * Identify which CEP device records belong to this machine.
 * `/me` may omit `current`; the account UI already infers "this device" by MAC.
 */
function parseFingerprint(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
/** 6-byte MAC as 12 hex chars. Hashed fingerprints (32+ hex) are not MACs. */
export function realMacHex(raw) {
    const hex = (raw || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
    return hex.length === 12 ? hex : null;
}
export function isThisMachineDevice(device, local) {
    if (device.current)
        return true;
    const localMac = realMacHex(local.mac);
    if (!localMac)
        return false;
    const fp = parseFingerprint(device.user_fingerprint || "");
    return realMacHex(fp.mac) === localMac;
}
export function thisMachineDeviceIds(devices, local) {
    const ids = [];
    const seen = new Set();
    for (const device of devices) {
        const id = typeof device.id === "string" ? device.id.trim() : "";
        if (!id || seen.has(id) || !isThisMachineDevice(device, local))
            continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}
export function partitionLoginDevices(devices, local) {
    const thisMachine = [];
    const others = [];
    for (const device of devices) {
        if (isThisMachineDevice(device, local))
            thisMachine.push(device);
        else
            others.push(device);
    }
    return { thisMachine, others };
}
