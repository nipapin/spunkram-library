import { apiUrl, UPDATE_ENDPOINT } from "./config";
import { cepHttpRequest } from "@/lib/api/cep-http";

export type UpdateManifest = {
  version: string | null;
  zxpUrl: string | null;
  changelog: string;
  publishedAt: string | null;
  ffmpeg?: {
    win: string;
    mac: string;
  };
};

/** Compare dotted semver-ish versions. Returns positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, "").split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function isRemoteNewer(localVersion: string, remoteVersion: string | null | undefined): boolean {
  if (!remoteVersion) return false;
  return compareVersions(remoteVersion, localVersion) > 0;
}

export async function fetchUpdateInfo(): Promise<UpdateManifest | null> {
  try {
    const result = await cepHttpRequest(apiUrl(UPDATE_ENDPOINT), {
      method: "GET",
      timeoutMs: 15000,
    });
    if (!result.ok) return null;
    const data = JSON.parse(result.text) as UpdateManifest;
    return data;
  } catch {
    return null;
  }
}
