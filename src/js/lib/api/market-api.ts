import { API_SERVERS, MASKED } from "@/lib/config/masked";
import { openLinkInBrowser } from "@/lib/utils/bolt";
import { cepHttpRequest } from "./cep-http";
import { getUserSystemPrint } from "./usp";
import type { PersonalAuth } from "./preferences";

const API_HEADERS: Record<string, string> = {
  "X-Requested-With": "Atom_X",
  "User-Agent": "AniomExtension_Atom",
  "Content-Type": "application/json",
};

export type MarketPackage = {
  id: number | string;
  name: string;
  author?: string;
  version?: string;
  ext_version?: string;
  primary_type: "AE" | "PR" | "AI" | "PS" | string;
  secondary_type?: string;
  compatible_version?: string;
  discount?: number | string;
  custom_price?: number;
  bind_pack?: string;
  extra_href?: string;
  video_id?: string;
  image_url: string;
  pack_name: string;
  pack_try_free?: boolean | number;
  pack_is_abs?: boolean | number;
  tags?: string;
};

export type MarketPayload = {
  Packages?: MarketPackage[];
  Courses?: unknown[];
};

export type AuthDevice = {
  usid: string;
  ip: string;
  user_fingerprint: string;
};

export type AuthResult = {
  success?: boolean;
  status?: boolean;
  usid?: string;
  code?: string;
  devices?: AuthDevice[] | Record<string, AuthDevice>;
};

export type MauResponse = {
  market?: MarketPayload;
  updater?: string | number;
  personalization?: string | boolean;
  auth?: AuthResult | string;
};

export type ApiErrorCode =
  | "NO_CONNECTION"
  | "TIMEOUT"
  | "NO_SUCCESS_LOAD"
  | "WRONG_WITH_PARAMS"
  | string;

export function getApiBase(serverIndex = 0): string {
  const idx = serverIndex === 1 ? 1 : 0;
  return API_SERVERS[idx];
}

export function authErrorMessage(code: ApiErrorCode | undefined): string {
  switch (code) {
    case "WRONG_WITH_PARAMS":
      return "Something wrong with parameters";
    case "NO_SUCCESS_LOAD":
      return "Unable to load server response";
    case "NO_CREDENTIALS":
      return "No credentials found";
    case "SERVER_ERROR":
      return "Something is wrong on the server";
    case "NO_CONNECTION":
      return "Fix connection and try again";
    case "TIMEOUT":
      return "Too long no response, try later";
    case "INVALID_AUTH":
      return "Invalid email or token";
    case "INVALID_USID":
      return "No token — please relog";
    case "MISSING_PARAMS":
      return "Missing parameters";
    case "LIMIT_USED_PC":
      return "Device limit exceeded for this subscription";
    case "WRONG_MAC_ADDR":
      return "MAC address doesn't match — please relog";
    case "DEPRECATED_CODE":
      return "Validity of the code has expired";
    default:
      return code ? String(code) : "Unknown error";
  }
}

async function fetchText(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
  timeoutMs = 20000,
): Promise<{ ok: boolean; text: string; error?: ApiErrorCode }> {
  const result = await cepHttpRequest(url, { ...init, timeoutMs });
  return {
    ok: result.ok,
    text: result.text,
    error: result.error,
  };
}

/** Relative path on AtomX API — full URL: `{API_SERVERS[i]}mau?king=…` */
export const MAU_ENDPOINT = "mau";

/**
 * GET get-atomx `/atomx/v1/mau?king=` — full author market catalog (Packages).
 * Port of Spunkram Beta `fetchMauData` in `js/sync.js`.
 * @see docs/PATHS.md
 */
export async function fetchMau(
  serverIndex = 0,
): Promise<{ data?: MauResponse; error?: ApiErrorCode }> {
  const base = getApiBase(serverIndex);
  const params = new URLSearchParams({ king: MASKED.author });
  const { ok, text, error } = await fetchText(
    `${base}${MAU_ENDPOINT}?${params.toString()}`,
  );
  if (!ok) return { error };
  try {
    return { data: JSON.parse(text) as MauResponse };
  } catch {
    return { error: "NO_SUCCESS_LOAD" };
  }
}

/**
 * MAU with optional AtomX auth params (legacy subscription devices).
 * Prefer {@link fetchMau} for the Spunkram catalog.
 */
export async function fetchMarketAndAuth(
  serverIndex: number,
  auth: PersonalAuth,
): Promise<{ data?: MauResponse; error?: ApiErrorCode }> {
  const base = getApiBase(serverIndex);
  const params = new URLSearchParams();
  params.set("king", MASKED.author);

  if (MASKED.settings.marketSubscriptionService && auth.usid && auth.email) {
    params.set("usid", auth.usid);
    params.set("email", auth.email);
    params.set("usp", getUserSystemPrint());
    params.set("has_control_devices", "true");
  }

  const { ok, text, error } = await fetchText(
    `${base}${MAU_ENDPOINT}?${params.toString()}`,
  );
  if (!ok) return { error };
  try {
    return { data: JSON.parse(text) as MauResponse };
  } catch {
    return { error: "NO_SUCCESS_LOAD" };
  }
}

export async function postAuth(
  serverIndex: number,
  body: Record<string, unknown>,
  endpoint: "auth" | "recheck" | "revoke_device",
): Promise<{ data?: AuthResult; error?: ApiErrorCode }> {
  const base = getApiBase(serverIndex);
  const { ok, text, error } = await fetchText(`${base}${endpoint}`, {
    method: "POST",
    headers: API_HEADERS,
    body: JSON.stringify(body),
  });
  if (!ok) return { error };
  try {
    return { data: JSON.parse(text) as AuthResult };
  } catch {
    return { error: "NO_SUCCESS_LOAD" };
  }
}

export async function loginWithCredentials(
  serverIndex: number,
  email: string,
  token: string,
): Promise<{ data?: AuthResult; error?: ApiErrorCode }> {
  return postAuth(
    serverIndex,
    {
      email,
      token,
      author_name: MASKED.author,
      has_control_devices: true,
      usp: getUserSystemPrint(),
    },
    "auth",
  );
}

export async function recheckAuth(
  serverIndex: number,
  auth: PersonalAuth,
): Promise<{ data?: AuthResult; error?: ApiErrorCode }> {
  if (!auth.usid || !auth.email) return { error: "NO_CREDENTIALS" };
  return postAuth(
    serverIndex,
    {
      usid: auth.usid,
      email: auth.email,
      author_name: MASKED.author,
      has_control_devices: true,
      usp: getUserSystemPrint(),
    },
    "recheck",
  );
}

export async function revokeDevice(
  serverIndex: number,
  usid: string,
  ip: string,
): Promise<{ data?: AuthResult; error?: ApiErrorCode }> {
  return postAuth(
    serverIndex,
    {
      author_name: MASKED.author,
      usid,
      ip,
    },
    "revoke_device",
  );
}

export function openApiLink(
  serverIndex: number,
  type: "link" | "package" | "author",
  query: Record<string, string>,
): void {
  const base = getApiBase(serverIndex);
  const params = new URLSearchParams({ ...query, king: MASKED.author });
  openLinkInBrowser(`${base}${type}?${params.toString()}`);
}

export function openYoutube(videoId: string): void {
  if (!videoId) return;
  openLinkInBrowser(`https://www.youtube.com/watch?v=${videoId}`);
}

export function normalizeDevices(
  devices: AuthResult["devices"],
): AuthDevice[] {
  if (!devices) return [];
  if (Array.isArray(devices)) return devices;
  return Object.values(devices);
}

export function parseDeviceFingerprint(raw: string): {
  mac?: string;
  user?: string;
  os?: string;
} {
  try {
    return JSON.parse(raw) as { mac?: string; user?: string; os?: string };
  } catch {
    return {};
  }
}
