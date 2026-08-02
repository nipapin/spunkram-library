import { apiUrl, UPDATE_ENDPOINT } from "./config";
import { getUserIdentity } from "./user";
import { cepHttpRequest } from "@/lib/api/cep-http";

export type UpdateManifest = {
  version: string | null;
  zxpUrl: string | null;
  changelog: string;
  publishedAt: string | null;
  channel?: "stable" | "beta";
  ffmpeg?: {
    win: string;
    mac: string;
  };
};

type ParsedVersion = { core: number[]; pre: string | null };

function parseVersion(v: string): ParsedVersion {
  const clean = v.replace(/^v/i, "");
  const dash = clean.indexOf("-");
  const core = (dash >= 0 ? clean.slice(0, dash) : clean)
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const pre = dash >= 0 ? clean.slice(dash + 1) : null;
  return { core, pre };
}

function preReleaseNumber(pre: string): number {
  const m = pre.match(/beta\.(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Compare dotted semver-ish versions. Returns positive if a > b. Release > matching prerelease. */
export function compareVersions(a: string, b: string): number {
  const A = parseVersion(a);
  const B = parseVersion(b);
  const n = Math.max(A.core.length, B.core.length);
  for (let i = 0; i < n; i++) {
    const d = (A.core[i] || 0) - (B.core[i] || 0);
    if (d !== 0) return d;
  }
  if (A.pre === null && B.pre !== null) return 1;
  if (A.pre !== null && B.pre === null) return -1;
  if (A.pre === null && B.pre === null) return 0;
  return preReleaseNumber(A.pre!) - preReleaseNumber(B.pre!);
}

export function isRemoteNewer(localVersion: string, remoteVersion: string | null | undefined): boolean {
  if (!remoteVersion) return false;
  return compareVersions(remoteVersion, localVersion) > 0;
}

export async function fetchUpdateInfo(): Promise<UpdateManifest | null> {
  try {
    const user = getUserIdentity();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (user.token) headers.Authorization = `Bearer ${user.token}`;

    const result = await cepHttpRequest(apiUrl(UPDATE_ENDPOINT), {
      method: "GET",
      headers,
      timeoutMs: 15000,
    });
    if (!result.ok) return null;
    const data = JSON.parse(result.text) as UpdateManifest;
    return data;
  } catch {
    return null;
  }
}
