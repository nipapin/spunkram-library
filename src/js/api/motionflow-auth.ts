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

const PUBLIC_AUTH_ORIGIN = "https://motionflow.pro";

function clientQuery(): string {
  return new URLSearchParams({ client: BRAND.apiClient }).toString();
}

export const AUTH_ENDPOINTS = {
  device: "/api/cep/auth/device",
  token: "/api/cep/auth/token",
  replaceDevice: "/api/cep/auth/replace-device",
  me: "/api/cep/me",
  revokeDevice: "/api/cep/devices/revoke",
  subscribe: `${PUBLIC_AUTH_ORIGIN}${BRAND.sitePath}`,
  store: `${PUBLIC_AUTH_ORIGIN}${BRAND.sitePath}/store`,
  manageSubscription: `${PUBLIC_AUTH_ORIGIN}/profile/subscriptions?${clientQuery()}`,
  contact: `${PUBLIC_AUTH_ORIGIN}${BRAND.sitePath}#contact`,
} as const;

/** Browser confirm page — author site (login modal → Allow/Deny). */
export function verificationUrlForCode(code: string, fromApi?: string): string {
  const params = new URLSearchParams({ code, client: BRAND.apiClient });
  const fallback = `${PUBLIC_AUTH_ORIGIN}${BRAND.sitePath}?${params.toString()}`;
  if (!fromApi) return fallback;
  try {
    const url = new URL(fromApi);
    if (url.origin !== PUBLIC_AUTH_ORIGIN) return fallback;
    // Prefer the brand landing even if an older API still returns /cep/login.
    if (url.pathname.includes("/cep/login")) {
      url.pathname = BRAND.sitePath;
    }
    if (!url.searchParams.has("client")) url.searchParams.set("client", BRAND.apiClient);
    if (!url.searchParams.has("code")) url.searchParams.set("code", code);
    url.searchParams.delete("author_id");
    url.searchParams.delete("extension");
    return url.toString();
  } catch {
    return fallback;
  }
}

export type MotionflowUser = {
  id: string;
  email: string;
  name?: string;
};

export type MotionflowDevice = {
  id: string;
  ip: string;
  user_fingerprint: string;
  name?: string;
  current?: boolean;
};

export type MotionflowSubscription = {
  plan?: string | null;
  status?: string | null;
  active: boolean;
  renews_at?: string | null;
};

export type MotionflowPurchase = {
  id: string;
  name?: string;
  product_type?: string;
  /** AE | PR from server; null = other host (e.g. Resolve). */
  primary_type?: "AE" | "PR" | null;
};

export type MotionflowEntitlements = {
  free_pack_slots?: number;
  ai_generations_limit?: number;
};

export type MotionflowMe = {
  user: MotionflowUser;
  tier?: "free" | "purchased" | "subscribed" | string;
  subscription?: MotionflowSubscription;
  purchases?: MotionflowPurchase[];
  entitlements?: MotionflowEntitlements;
  subscribe_url?: string;
  manage_subscription_url?: string;
  devices?: MotionflowDevice[];
};

export type DeviceAuthStart = {
  code: string;
  /** Panel-only secret; required when polling /auth/token. Never shown in the UI. */
  device_code: string;
  verification_url: string;
  interval: number;
  expires_in: number;
};

export type DeviceLimitListItem = {
  id: string;
  ip: string;
  user_fingerprint: string;
  name?: string;
  last_seen_at?: string | null;
  current?: boolean;
};

export type DeviceAuthTokenResult =
  | { status: "pending" }
  | { status: "expired" | "denied"; message?: string }
  | {
      status: "device_limit";
      devices: DeviceLimitListItem[];
      device_limit: number;
      message?: string;
    }
  | { status: "complete"; token: string; user: MotionflowUser };

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJson<T>(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  },
): Promise<{ data?: T; error?: string; status: number }> {
  const result = await cepHttpRequest(url, init);
  if (!result.ok) {
    return {
      error: result.error || `HTTP ${result.status}`,
      status: result.status,
    };
  }
  try {
    return { data: JSON.parse(result.text) as T, status: result.status };
  } catch {
    return { error: "NO_SUCCESS_LOAD", status: result.status };
  }
}

export async function startDeviceAuth(): Promise<
  { data: DeviceAuthStart } | { error: string }
> {
  const usp = getUserSystemPrint();
  const device = getUserSystemData();
  const { data, error, status } = await parseJson<DeviceAuthStart>(
    apiUrl(AUTH_ENDPOINTS.device),
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        usp,
        device,
        client: BRAND.apiClient,
      }),
    },
  );

  if (data?.code && data?.verification_url) {
    const deviceCode =
      typeof (data as { device_code?: unknown }).device_code === "string"
        ? (data as { device_code: string }).device_code
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

export async function pollDeviceAuth(
  code: string,
  opts?: { device_code?: string },
): Promise<DeviceAuthTokenResult> {
  const deviceCode = opts?.device_code?.trim();
  if (!deviceCode) {
    return { status: "expired", message: "Missing device_code" };
  }

  const { data, error } = await parseJson<{
    status?: string;
    token?: string;
    user?: MotionflowUser;
    message?: string;
    devices?: DeviceLimitListItem[];
    device_limit?: number;
  }>(apiUrl(AUTH_ENDPOINTS.token), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ code, device_code: deviceCode }),
  });

  if (!data) {
    return { status: "pending" };
  }

  const s = (data.status || "").toLowerCase();
  if (s === "pending" || (!data.token && !s)) {
    if (data.token && data.user) {
      return { status: "complete", token: data.token, user: data.user };
    }
    return { status: "pending" };
  }
  if (s === "device_limit") {
    return {
      status: "device_limit",
      devices: Array.isArray(data.devices) ? data.devices : [],
      device_limit: Number(data.device_limit) || 3,
      message: data.message || error,
    };
  }
  if (s === "expired" || s === "denied") {
    return { status: s, message: data.message || error };
  }
  if (data.token && data.user) {
    return { status: "complete", token: data.token, user: data.user };
  }
  return { status: "pending" };
}

/** Complete a device_limit login by revoking another device. */
export async function replaceDeviceAuth(opts: {
  code: string;
  device_code: string;
  revoke_device_id: string;
}): Promise<DeviceAuthTokenResult> {
  const { data, error } = await parseJson<{
    status?: string;
    token?: string;
    user?: MotionflowUser;
    message?: string;
  }>(apiUrl(AUTH_ENDPOINTS.replaceDevice), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      code: opts.code,
      device_code: opts.device_code,
      revoke_device_id: opts.revoke_device_id,
    }),
  });

  if (data?.token && data.user) {
    return { status: "complete", token: data.token, user: data.user };
  }
  if ((data?.status || "").toLowerCase() === "complete" && data.token && data.user) {
    return { status: "complete", token: data.token, user: data.user };
  }
  return {
    status: "expired",
    message: data?.message || error || "Could not replace device",
  };
}

/** Normalize /me — trust server; never filter by author_id on the client. */
export function normalizeMePayload(data: MotionflowMe): MotionflowMe {
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

export async function fetchMe(
  token: string,
  opts?: { host?: "AE" | "PR" | null },
): Promise<{ data?: MotionflowMe; error?: string }> {
  const qs = new URLSearchParams({ client: BRAND.apiClient });
  if (opts?.host === "AE" || opts?.host === "PR") {
    qs.set("host", opts.host);
  }
  const { data, error, status } = await parseJson<MotionflowMe>(
    apiUrl(`${AUTH_ENDPOINTS.me}?${qs.toString()}`),
    {
      method: "GET",
      headers: authHeaders(token),
    },
  );

  if (data?.user) {
    return { data: normalizeMePayload(data) };
  }

  if (status === 401) return { error: "UNAUTHORIZED" };
  return { error: error || "Unable to load profile" };
}

export async function revokeMotionflowDevice(
  token: string,
  deviceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error, status } = await parseJson<{ ok?: boolean }>(
    apiUrl(AUTH_ENDPOINTS.revokeDevice),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ device_id: deviceId }),
    },
  );
  if (status >= 200 && status < 300) return { ok: true };
  return { ok: false, error: error || "Revoke failed" };
}

let subscribeUrlOverride: string | null = null;
let manageUrlOverride: string | null = null;

export function setSubscriptionUrls(urls: {
  subscribe?: string | null;
  manage?: string | null;
}): void {
  subscribeUrlOverride = urls.subscribe?.trim() || null;
  manageUrlOverride = urls.manage?.trim() || null;
}

export function openMotionflowSubscribe(): void {
  // Always the brand landing — ignore server subscribe_url (legacy /pricing).
  openLinkInBrowser(AUTH_ENDPOINTS.subscribe);
}

export function openMotionflowStore(): void {
  openLinkInBrowser(AUTH_ENDPOINTS.store);
}

export function openMotionflowManageSubscription(): void {
  openLinkInBrowser(manageUrlOverride || AUTH_ENDPOINTS.manageSubscription);
}

export function openMotionflowContact(): void {
  openLinkInBrowser(AUTH_ENDPOINTS.contact);
}

export function openVerificationUrl(url: string): void {
  openLinkInBrowser(url);
}
