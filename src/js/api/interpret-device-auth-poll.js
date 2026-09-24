const DEVICE_LIMIT_RE = /device[\s_-]*limit/i;
function isDeviceLimitPayload(status, errRaw, message) {
    if (status === "device_limit")
        return true;
    const errCode = errRaw.toUpperCase();
    if (errCode === "DEVICE_LIMIT" || errCode.includes("DEVICE_LIMIT"))
        return true;
    return (DEVICE_LIMIT_RE.test(status) ||
        DEVICE_LIMIT_RE.test(errRaw) ||
        DEVICE_LIMIT_RE.test(message));
}
/** Map a /auth/token HTTP body to the panel poll result. */
export function interpretDeviceAuthTokenResponse(input) {
    const data = input.data;
    const s = (data?.status || "").toLowerCase();
    const errRaw = String(data?.error || input.error || "");
    const message = String(data?.message || input.error || "");
    if (isDeviceLimitPayload(s, errRaw, message)) {
        return {
            status: "device_limit",
            devices: Array.isArray(data?.devices) ? data.devices : [],
            device_limit: Number(data?.device_limit) || 3,
            message: data?.message || input.error,
        };
    }
    if (!data) {
        return { status: "pending" };
    }
    if (s === "pending" || (!data.token && !s)) {
        if (data.token && data.user) {
            return { status: "complete", token: data.token, user: data.user };
        }
        return { status: "pending" };
    }
    if (s === "expired" || s === "denied") {
        return { status: s, message: data.message || input.error };
    }
    if (data.token && data.user) {
        return { status: "complete", token: data.token, user: data.user };
    }
    return { status: "pending" };
}
