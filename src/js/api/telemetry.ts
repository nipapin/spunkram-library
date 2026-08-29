import {
  TELEMETRY_ACTIVE_PACKS_ENDPOINT,
  TELEMETRY_INSTALLS_ENDPOINT,
  TELEMETRY_SESSION_ENDPOINT,
} from "./config";
import { getUserIdentity } from "./user";
import { collectSupportMeta } from "@/lib/support/collect-meta";
import { cepHttpRequest } from "@/lib/api/cep-http";
import { readPrefSettings } from "@/lib/api/preferences";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";

const TELEMETRY_URL = `https://motionflow.pro${TELEMETRY_SESSION_ENDPOINT}`;
const INSTALLS_URL = `https://motionflow.pro${TELEMETRY_INSTALLS_ENDPOINT}`;
const ACTIVE_PACKS_URL = `https://motionflow.pro${TELEMETRY_ACTIVE_PACKS_ENDPOINT}`;

/** Last user id we successfully reported for in this panel JS context. */
let reportedForUserId: string | null = null;
/** Dedup consecutive identical active-pack snapshots. */
let lastActivePacksKey: string | null = null;

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Report host app (AE/PR) version + OS after sign-in / session hydrate.
 * Fire-and-forget; never throws. Deduped client-side (once per user per panel
 * session) and again server-side (~12h for the same environment).
 */
export async function reportClientSession(): Promise<void> {
  const user = getUserIdentity();
  const token = user?.token;
  const userId = user?.id || null;
  if (!token || !userId) return;
  if (reportedForUserId === userId) return;

  const meta = collectSupportMeta();
  const body = JSON.stringify({
    client: meta.client,
    extension_version: meta.extension_version,
    host: meta.host,
    os: meta.os,
    locale: meta.locale,
  });

  try {
    const result = await cepHttpRequest(TELEMETRY_URL, {
      method: "POST",
      headers: authHeaders(token),
      body,
      timeoutMs: 10000,
    });

    if (result.ok) {
      reportedForUserId = userId;
    }
  } catch {
    /* ignore — analytics must never block auth */
  }
}

/**
 * Snapshot of market packs on disk (`packages[]` with `marketId`).
 * Call after sign-in / market refresh and after install/update.
 */
export async function reportInstalledPacks(): Promise<void> {
  const user = getUserIdentity();
  const token = user?.token;
  if (!token) return;

  const prefs = readPrefSettings();
  const packages = Array.isArray(prefs.packages)
    ? (prefs.packages as InstalledPackMeta[])
    : [];

  const packs: { pack_id: number; version?: string }[] = [];
  for (const p of packages) {
    if (p.marketId == null) continue;
    const packId = Number(p.marketId);
    if (!Number.isInteger(packId) || packId <= 0) continue;
    packs.push({
      pack_id: packId,
      ...(p.version ? { version: String(p.version) } : {}),
    });
  }

  try {
    await cepHttpRequest(INSTALLS_URL, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ packs }),
      timeoutMs: 10000,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Report packs currently open in the panel. Send `[]` when none.
 * Dedupes identical consecutive snapshots in this JS context.
 */
export async function reportActivePacks(packIds: number[]): Promise<void> {
  const user = getUserIdentity();
  const token = user?.token;
  if (!token) return;

  const ids = packIds
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  const key = ids.slice().sort((a, b) => a - b).join(",");
  if (key === lastActivePacksKey) return;

  try {
    const result = await cepHttpRequest(ACTIVE_PACKS_URL, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ pack_ids: ids }),
      timeoutMs: 10000,
    });
    if (result.ok) {
      lastActivePacksKey = key;
    }
  } catch {
    /* ignore */
  }
}

/** Test helper — allow another report in the same JS context. */
export function resetClientSessionTelemetryFlag(): void {
  reportedForUserId = null;
  lastActivePacksKey = null;
}
