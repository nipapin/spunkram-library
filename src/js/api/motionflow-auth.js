/**
 * Motionflow CEP auth — device-code browser flow.
 *
 * Contract: docs/BACKEND_CEP_API.md
 * CEP sends only `client` from brand config. Author / sold_items stay on the server.
 */
import { apiUrl } from "./config";
import { cepHttpRequest } from "@/lib/api/cep-http";
import { getUserSystemData, getUserSystemPrint } from "@/lib/api/usp";
import { BRAND } from "@brands";
import { openLinkInBrowser } from "@/lib/utils/bolt";
import { interpretDeviceAuthTokenResponse, } from "./interpret-device-auth-poll";
const PUBLIC_AUTH_ORIGIN = "https://motionflow.pro";
function brandPublicOrigin() {
    return (BRAND.siteOrigin ?? PUBLIC_AUTH_ORIGIN).replace(/\/$/, "");
}
/** Public landing for this brand (storefront origin + path, no trailing slash). */
function brandPublicBase() {
    if (BRAND.siteOrigin)
        return brandPublicOrigin();
    const path = BRAND.sitePath.replace(/\/$/, "");
    return `${PUBLIC_AUTH_ORIGIN}${path}`;
}
function isAllowedVerificationOrigin(origin) {
    try {
        const url = new URL(origin);
        const host = url.hostname.toLowerCase();
        if (host === "localhost" || host === "127.0.0.1") {
            return url.protocol === "http:" || url.protocol === "https:";
        }
        if (url.protocol !== "https:")
            return false;
        return host === "motionflow.pro" || host.endsWith(".motionflow.pro");
    }
    catch {
        return false;
    }
}
function clientQuery() {
    return new URLSearchParams({ client: BRAND.apiClient }).toString();
}
export const AUTH_ENDPOINTS = {
    device: "/api/cep/auth/device",
    token: "/api/cep/auth/token",
    replaceDevice: "/api/cep/auth/replace-device",
    me: "/api/cep/me",
    revokeDevice: "/api/cep/devices/revoke",
    subscribe: brandPublicBase(),
    store: `${brandPublicBase()}/store`,
    manageSubscription: `${PUBLIC_AUTH_ORIGIN}/profile/subscriptions?${clientQuery()}`,
    contact: `${brandPublicBase()}#contact`,
    buyExtra: `${brandPublicBase()}/?buy=extra`,
};
/** Browser confirm page — author site (login modal → Allow/Deny). */
export function verificationUrlForCode(code, fromApi) {
    const params = new URLSearchParams({ code, client: BRAND.apiClient });
    const fallbackUrl = new URL(`${brandPublicBase()}/`);
    fallbackUrl.search = params.toString();
    const fallback = fallbackUrl.toString();
    if (!fromApi)
        return fallback;
    try {
        const url = new URL(fromApi);
        if (!isAllowedVerificationOrigin(url.origin))
            return fallback;
        // Prefer the brand landing even if an older API still returns /cep/login.
        if (url.pathname.includes("/cep/login")) {
            url.pathname = BRAND.siteOrigin ? "/" : BRAND.sitePath;
        }
        if (!url.searchParams.has("client"))
            url.searchParams.set("client", BRAND.apiClient);
        if (!url.searchParams.has("code"))
            url.searchParams.set("code", code);
        url.searchParams.delete("author_id");
        url.searchParams.delete("extension");
        return url.toString();
    }
    catch {
        return fallback;
    }
}
function authHeaders(token) {
    const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
    };
    if (token)
        headers.Authorization = `Bearer ${token}`;
    return headers;
}
function errorFromHttpBody(text) {
    try {
        const body = JSON.parse(text);
        if (typeof body.message === "string" && body.message.trim())
            return body.message.trim();
        if (typeof body.error === "string" && body.error.trim())
            return body.error.trim();
    }
    catch {
        /* ignore */
    }
    return undefined;
}
function parseHttpJson(text) {
    if (!text)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
async function parseJson(url, init) {
    const result = await cepHttpRequest(url, init);
    const data = parseHttpJson(result.text);
    if (!result.ok) {
        return {
            data,
            error: errorFromHttpBody(result.text) || result.error || `HTTP ${result.status}`,
            status: result.status,
        };
    }
    if (data === undefined) {
        return { error: "NO_SUCCESS_LOAD", status: result.status };
    }
    return { data, status: result.status };
}
export async function startDeviceAuth() {
    const usp = getUserSystemPrint();
    const device = getUserSystemData();
    const { data, error, status } = await parseJson(apiUrl(AUTH_ENDPOINTS.device), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            usp,
            device,
            client: BRAND.apiClient,
        }),
    });
    if (status >= 200 && status < 300 && data?.code && data?.verification_url) {
        const deviceCode = typeof data.device_code === "string"
            ? data.device_code
            : "";
        if (!deviceCode) {
            return { error: "Server response missing device_code" };
        }
        return {
            data: {
                code: data.code,
                device_code: deviceCode,
                verification_url: verificationUrlForCode(data.code, data.verification_url),
                interval: Math.max(1, Number(data.interval) || 3),
                expires_in: Number(data.expires_in) || 300,
            },
        };
    }
    return { error: error || "Unable to start Motionflow login" };
}
export async function pollDeviceAuth(code, opts) {
    const deviceCode = opts?.device_code?.trim();
    if (!deviceCode) {
        return { status: "expired", message: "Missing device_code" };
    }
    const { data, error, status } = await parseJson(apiUrl(AUTH_ENDPOINTS.token), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code, device_code: deviceCode }),
    });
    // Keep device_limit before the `!data → pending` fallback. A 4xx DEVICE_LIMIT
    // body used to be dropped, so the panel stayed on "Waiting for confirmation".
    return interpretDeviceAuthTokenResponse({ data, error, httpStatus: status });
}
/** Complete a device_limit login by revoking another device. */
export async function replaceDeviceAuth(opts) {
    const { data, error, status } = await parseJson(apiUrl(AUTH_ENDPOINTS.replaceDevice), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
            code: opts.code,
            device_code: opts.device_code,
            revoke_device_id: opts.revoke_device_id,
        }),
    });
    if (status >= 200 && status < 300 && data?.token && data.user) {
        return { status: "complete", token: data.token, user: data.user };
    }
    return {
        status: "expired",
        message: data?.message || error || "Could not replace device",
    };
}
/** Normalize /me — trust server; never filter by author_id on the client. */
export function normalizeMePayload(data) {
    const sub = data.subscription;
    return {
        user: data.user,
        tier: data.tier,
        subscription: {
            active: Boolean(sub?.active),
            plan: sub?.plan ?? undefined,
            status: sub?.status ?? undefined,
            renews_at: sub?.renews_at ?? undefined,
        },
        purchases: Array.isArray(data.purchases) ? data.purchases : [],
        entitlements: data.entitlements,
        subscribe_url: data.subscribe_url,
        manage_subscription_url: data.manage_subscription_url,
        devices: Array.isArray(data.devices) ? data.devices : [],
    };
}
export async function fetchMe(token, opts) {
    const qs = new URLSearchParams({ client: BRAND.apiClient });
    if (opts?.host === "AE" || opts?.host === "PR") {
        qs.set("host", opts.host);
    }
    const { data, error, status } = await parseJson(apiUrl(`${AUTH_ENDPOINTS.me}?${qs.toString()}`), {
        method: "GET",
        headers: authHeaders(token),
    });
    if (data?.user && status >= 200 && status < 300) {
        return { data: normalizeMePayload(data) };
    }
    if (status === 401)
        return { error: "UNAUTHORIZED" };
    return { error: error || "Unable to load profile" };
}
export async function revokeMotionflowDevice(token, deviceId) {
    const { error, status } = await parseJson(apiUrl(AUTH_ENDPOINTS.revokeDevice), {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ device_id: deviceId }),
    });
    if (status >= 200 && status < 300)
        return { ok: true };
    return { ok: false, error: error || "Revoke failed" };
}
let subscribeUrlOverride = null;
let manageUrlOverride = null;
export function setSubscriptionUrls(urls) {
    subscribeUrlOverride = urls.subscribe?.trim() || null;
    manageUrlOverride = urls.manage?.trim() || null;
}
export function openMotionflowSubscribe() {
    // Always the brand landing — ignore server subscribe_url (legacy /pricing).
    openLinkInBrowser(AUTH_ENDPOINTS.subscribe);
}
/** Spunkram landing with the extra-credits purchase dialog (`?buy=extra`). */
export function openMotionflowBuyExtra() {
    openLinkInBrowser(AUTH_ENDPOINTS.buyExtra);
}
/** Spunkram pricing anchor. Used by the AI Tools Upgrade button. */
export function openMotionflowPricing() {
    const base = AUTH_ENDPOINTS.subscribe.replace(/\/$/, "");
    openLinkInBrowser(`${base}#pricing`);
}
export function openMotionflowStore() {
    openLinkInBrowser(AUTH_ENDPOINTS.store);
}
export function openMotionflowManageSubscription() {
    openLinkInBrowser(manageUrlOverride || AUTH_ENDPOINTS.manageSubscription);
}
export function openMotionflowContact() {
    openLinkInBrowser(AUTH_ENDPOINTS.contact);
}
export function openVerificationUrl(url) {
    openLinkInBrowser(url);
}
