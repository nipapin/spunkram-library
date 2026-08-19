import { TELEMETRY_SESSION_ENDPOINT } from "./config";
import { getUserIdentity } from "./user";
import { collectSupportMeta } from "@/lib/support/collect-meta";
import { cepHttpRequest } from "@/lib/api/cep-http";

const TELEMETRY_URL = `https://motionflow.pro${TELEMETRY_SESSION_ENDPOINT}`;

/** Last user id we successfully reported for in this panel JS context. */
let reportedForUserId: string | null = null;

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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };

  try {
    const result = await cepHttpRequest(TELEMETRY_URL, {
      method: "POST",
      headers,
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

/** Test helper — allow another report in the same JS context. */
export function resetClientSessionTelemetryFlag(): void {
  reportedForUserId = null;
}
