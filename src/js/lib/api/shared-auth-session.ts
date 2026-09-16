/**
 * AE and Premiere share one Motionflow vault on disk.
 * A stale in-memory/WS token must not wipe a newer token the other host just wrote.
 */

export type SharedAuthSnapshot = {
  token?: string;
  id?: string;
  activeId?: string | null;
  accounts?: Array<{ id: string; token: string }>;
};

export function authVaultFingerprint(snapshot: SharedAuthSnapshot): string {
  const accounts = (snapshot.accounts ?? [])
    .map((account) => `${account.id}:${account.token}`)
    .join(",");
  return [
    snapshot.token ?? "",
    snapshot.id ?? "",
    snapshot.activeId ?? "",
    accounts,
  ].join("|");
}

/** Keep the shared vault when the failed token is not what is on disk. */
export function shouldKeepSharedSession(opts: {
  failedToken?: string | null;
  diskToken?: string | null;
}): boolean {
  const failed = (opts.failedToken || "").trim();
  const disk = (opts.diskToken || "").trim();
  return Boolean(disk && failed && disk !== failed);
}
