/**
 * Motionflow CEP auth — device-code browser flow.
 *
 * Contract: docs/BACKEND_CEP_API.md
 * CEP sends only `client: spunkram-cep`. Author / sold_items stay on the server.
 */
import { apiUrl } from "./config";
import { cepHttpRequest } from "@/lib/api/cep-http";
import { getUserSystemData, getUserSystemPrint } from "@/lib/api/usp";
import { MASKED } from "@/lib/config/masked";
import { openLinkInBrowser } from "@/lib/utils/bolt";

const PUBLIC_AUTH_ORIGIN = "https://motionflow.pro";
/** Site origin for Spunkram marketing pages (pricing, etc.). */
const SITE_ORIGIN = import.meta.env.DEV
  ? "http://localhost:3000"
  : PUBLIC_AUTH_ORIGIN;

function clientQuery(): string {
  return new URLSearchParams({ client: MASKED.client }).toString();
}

export const AUTH_ENDPOINTS = {
  device: "/api/cep/auth/device",
  token: "/api/cep/auth/token",
  me: "/api/cep/me",
  revokeDevice: "/api/cep/devices/revoke",
  subscribe: `${SITE_ORIGIN}/spunkram`,
  manageSubscription: `${PUBLIC_AUTH_ORIGIN}/profile/subscriptions?${clientQuery()}`,
  contact: `${PUBLIC_AUTH_ORIGIN}/spunkram#contact`,
} as const;

/** Browser confirm page — Spunkram site (login modal → Allow/Deny). */
export function verificationUrlForCode(code: string, fromApi?: string): string {
  const params = new URLSearchParams({ code, client: MASKED.client });
  const fallback = `${PUBLIC_AUTH_ORIGIN}/spunkram?${params.toString()}`;
  if (!fromApi) return fallback;
  try {
    const url = new URL(fromApi);
    if (/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) return fallback;
    // Prefer /spunkram even if an older API still returns /cep/login.
    if (url.pathname.includes("/cep/login")) {
      url.pathname = "/spunkram";
    }
    if (!url.searchParams.has("client")) url.searchParams.set("client", MASKED.client);
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
  mock?: boolean;
};

export type DeviceAuthTokenResult =
  | { status: "pending" }
  | { status: "expired" | "denied"; message?: string }
  | { status: "complete"; token: string; user: MotionflowUser };

declare const __CEP_API_MOCKS__: boolean | undefined;
const MOCK_ENABLED =
  typeof __CEP_API_MOCKS__ === "boolean"
    ? __CEP_API_MOCKS__
    : Boolean(import.meta.env.DEV);
const mockPollCounts = new Map<string, number>();

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
        client: MASKED.client,
      }),
    },
  );

  if (data?.code && data?.verification_url) {
    const deviceCode =
      typeof (data as { device_code?: unknown }).device_code === "string"
        ? (data as { device_code: string }).device_code
        : "";
    if (!deviceCode && !MOCK_ENABLED) {
      return { error: "Server response missing device_code" };
    }
    return {
      data: {
        code: data.code,
        device_code: deviceCode || `mfdev_${"0".repeat(64)}`,
        verification_url: verificationUrlForCode(data.code, data.verification_url),
        interval: Math.max(1, Number(data.interval) || 3),
        expires_in: Number(data.expires_in) || 300,
        mock: false,
      },
    };
  }

  if (MOCK_ENABLED && (status === 0 || status === 404 || status >= 500 || error)) {
    const code = `MF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return {
      data: {
        code,
        device_code: `mfdev_${"a".repeat(64)}`,
        verification_url: verificationUrlForCode(code),
        interval: 2,
        expires_in: 120,
        mock: true,
      },
    };
  }

  return { error: error || "Unable to start Motionflow login" };
}

export async function pollDeviceAuth(
  code: string,
  opts?: { mock?: boolean; device_code?: string },
): Promise<DeviceAuthTokenResult> {
  if (opts?.mock && MOCK_ENABLED) {
    const n = (mockPollCounts.get(code) || 0) + 1;
    mockPollCounts.set(code, n);
    if (n < 2) return { status: "pending" };
    mockPollCounts.delete(code);
    return {
      status: "complete",
      token: `mock-token-${code}`,
      user: {
        id: "mf-mock-user",
        email: "demo@motionflow.pro",
        name: "Demo User",
      },
    };
  }

  const deviceCode = opts?.device_code?.trim();
  if (!deviceCode) {
    return { status: "expired", message: "Missing device_code" };
  }

  const { data, error, status } = await parseJson<{
    status?: string;
    token?: string;
    user?: MotionflowUser;
    message?: string;
  }>(apiUrl(AUTH_ENDPOINTS.token), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ code, device_code: deviceCode }),
  });

  if (!data) {
    if (MOCK_ENABLED && (status === 0 || status === 404 || status >= 500)) {
      return {
        status: "complete",
        token: `mock-token-${code}`,
        user: {
          id: "mf-mock-user",
          email: "demo@motionflow.pro",
          name: "Demo User",
        },
      };
    }
    return { status: "pending" };
  }

  const s = (data.status || "").toLowerCase();
  if (s === "pending" || (!data.token && !s)) {
    if (data.token && data.user) {
      return { status: "complete", token: data.token, user: data.user };
    }
    return { status: "pending" };
  }
  if (s === "expired" || s === "denied") {
    return { status: s, message: data.message || error };
  }
  if (data.token && data.user) {
    return { status: "complete", token: data.token, user: data.user };
  }
  return { status: "pending" };
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
  const qs = new URLSearchParams({ client: MASKED.client });
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

  if (MOCK_ENABLED && token.startsWith("mock-token-")) {
    const device = getUserSystemData();
    return {
      data: normalizeMePayload({
        user: {
          id: "mf-mock-user",
          email: "demo@motionflow.pro",
          name: "Demo User",
        },
        // Mock free user — platform Motionflow sub must not unlock Spunkram.
        tier: "free",
        subscription: {
          active: false,
          plan: null,
          status: null,
          renews_at: null,
        },
        purchases: [],
        entitlements: {
          free_pack_slots: 1,
          ai_generations_limit: 5,
        },
        subscribe_url: AUTH_ENDPOINTS.subscribe,
        manage_subscription_url: AUTH_ENDPOINTS.manageSubscription,
        devices: [
          {
            id: "current",
            ip: "127.0.0.1",
            user_fingerprint: JSON.stringify(device),
            current: true,
            name: device.user,
          },
        ],
      }),
    };
  }

  if (status === 401) return { error: "UNAUTHORIZED" };
  return { error: error || "Unable to load profile" };
}

export async function revokeMotionflowDevice(
  token: string,
  deviceId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (MOCK_ENABLED && token.startsWith("mock-token-")) {
    return { ok: true };
  }
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
  // Always Spunkram pricing page — ignore server subscribe_url (legacy /pricing).
  openLinkInBrowser(AUTH_ENDPOINTS.subscribe);
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
