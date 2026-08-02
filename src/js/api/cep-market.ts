/**
 * CEP market catalog.
 *
 * Primary catalog: get-atomx `GET /atomx/v1/mau?king=` (all author packs).
 * Optional entitlements merge: Motionflow `GET /api/cep/market?host=`.
 *
 * @see docs/PATHS.md — Spunkram Beta `js/sync.js` → `fetchMauData`
 */
import { apiUrl } from "./config";
import { cepHttpRequest } from "@/lib/api/cep-http";
import { fetchMau, type MarketPackage } from "@/lib/api/market-api";
import { readMotionflowAuth } from "@/lib/api/preferences";
import { openLinkInBrowser } from "@/lib/utils/bolt";

export const CEP_MARKET_ENDPOINT = "/api/cep/market";

const SITE_ORIGIN = import.meta.env.DEV
  ? "http://localhost:3000"
  : "https://motionflow.pro";

export type CepMarketAction = "install" | "buy" | "get_free" | string;

export type CepMarketPackage = {
  id: number | string;
  name: string;
  pack_name: string;
  author?: string;
  version?: string;
  primary_type: "AE" | "PR" | string;
  image_url: string;
  custom_price?: number;
  discount?: number | string;
  video_id?: string;
  owned?: boolean;
  covered_by_subscription?: boolean;
  action?: CepMarketAction;
  install_url?: string | null;
  buy_url?: string | null;
};

export type CepMarketPayload = {
  subscription_active?: boolean;
  subscribe_url?: string;
  Packages?: CepMarketPackage[];
};

declare const __CEP_API_MOCKS__: boolean | undefined;
const MOCK_ENABLED =
  typeof __CEP_API_MOCKS__ === "boolean"
    ? __CEP_API_MOCKS__
    : Boolean(import.meta.env.DEV);

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function packKey(name: string, primary: string): string {
  return `${primary.toUpperCase()}::${name.trim().toLowerCase()}`;
}

function defaultBuyUrl(): string {
  return `${SITE_ORIGIN}/spunkram#pricing`;
}

function mapMauPackage(
  p: MarketPackage,
  entitlement?: CepMarketPackage,
): CepMarketPackage {
  const price =
    typeof p.custom_price === "number" ? p.custom_price : Number(p.custom_price) || 0;
  const free = price <= 0;
  const owned = Boolean(entitlement?.owned);
  const covered = Boolean(entitlement?.covered_by_subscription);
  let action: CepMarketAction =
    entitlement?.action ||
    (owned ? "install" : free ? "get_free" : "buy");

  return {
    id: p.id,
    name: p.name,
    pack_name: p.pack_name || p.name,
    author: p.author,
    version: p.version,
    primary_type: p.primary_type,
    image_url: p.image_url,
    custom_price: price,
    discount: p.discount,
    video_id: p.video_id != null ? String(p.video_id) : undefined,
    owned,
    covered_by_subscription: covered || free,
    action,
    install_url: entitlement?.install_url ?? null,
    buy_url:
      entitlement?.buy_url ||
      (typeof p.extra_href === "string" && p.extra_href.trim()
        ? p.extra_href.trim()
        : defaultBuyUrl()),
  };
}

async function fetchMotionflowEntitlements(
  host: "AE" | "PR",
): Promise<CepMarketPayload | null> {
  const token = readMotionflowAuth().token;
  if (!token) return null;
  const url = apiUrl(`${CEP_MARKET_ENDPOINT}?host=${encodeURIComponent(host)}`);
  const result = await cepHttpRequest(url, {
    method: "GET",
    headers: authHeaders(token),
  });
  if (!result.ok) return null;
  try {
    const data = JSON.parse(result.text) as CepMarketPayload;
    return {
      subscription_active: Boolean(data.subscription_active),
      subscribe_url: data.subscribe_url,
      Packages: Array.isArray(data.Packages) ? data.Packages : [],
    };
  } catch {
    return null;
  }
}

function mockPackages(host: "AE" | "PR"): CepMarketPackage[] {
  return [
    {
      id: "mock-free",
      name: "Spunkram Free Starter",
      pack_name: "spunkram-free-starter",
      author: "Spunkram",
      version: "1.0.0",
      primary_type: host,
      image_url: "https://placehold.co/640x360/1a1a2e/eee?text=Free+Pack",
      custom_price: 0,
      owned: false,
      covered_by_subscription: true,
      action: "get_free",
      install_url: null,
      buy_url: null,
    },
    {
      id: "mock-buy",
      name: "Spunkram Library",
      pack_name: "Spunkram Library",
      author: "Spunkram",
      version: "4.0",
      primary_type: host,
      image_url: "https://placehold.co/640x360/0f3460/eee?text=Library",
      custom_price: host === "AE" ? 75 : 69,
      owned: false,
      covered_by_subscription: true,
      action: "buy",
      install_url: null,
      buy_url: defaultBuyUrl(),
    },
  ];
}

/**
 * Load all author packs from get-atomx MAU, optionally merge Motionflow owned/action urls.
 */
export async function fetchCepMarket(
  host: "AE" | "PR",
): Promise<{ data?: CepMarketPayload; error?: string }> {
  let mau = await fetchMau(0);
  if (mau.error) {
    mau = await fetchMau(1);
  }

  const entitlements = await fetchMotionflowEntitlements(host);
  const entitlementByKey = new Map<string, CepMarketPackage>();
  for (const p of entitlements?.Packages ?? []) {
    entitlementByKey.set(packKey(p.name, String(p.primary_type)), p);
  }

  if (mau.data?.market?.Packages && Array.isArray(mau.data.market.Packages)) {
    const packages = mau.data.market.Packages.map((p) =>
      mapMauPackage(
        p,
        entitlementByKey.get(packKey(p.name, String(p.primary_type))),
      ),
    );

    // If subscribed on Motionflow, treat unpaid packs as installable via covered flag.
    if (entitlements?.subscription_active) {
      for (const p of packages) {
        if (p.action === "buy") {
          p.action = "install";
          p.covered_by_subscription = true;
        }
      }
    }

    return {
      data: {
        subscription_active: Boolean(entitlements?.subscription_active),
        subscribe_url: entitlements?.subscribe_url || defaultBuyUrl(),
        Packages: packages,
      },
    };
  }

  // Fallback: Motionflow-only catalog (incomplete vs MAU).
  if (entitlements) {
    return { data: entitlements };
  }

  if (MOCK_ENABLED) {
    return {
      data: {
        subscription_active: false,
        subscribe_url: defaultBuyUrl(),
        Packages: mockPackages(host),
      },
    };
  }

  return { error: mau.error || "NO_SUCCESS_LOAD" };
}

export function openMarketUrl(url: string | null | undefined): void {
  if (!url) return;
  openLinkInBrowser(url);
}
