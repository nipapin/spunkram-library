/** Revalidate an open panel after expiry, on focus, and once a minute. */
export function watchSubscriptionChanges(
  recheck: () => Promise<unknown>,
  renewsAt?: string,
): () => void {
  let active = true;
  let checking = false;
  const check = async () => {
    if (!active || checking) return;
    checking = true;
    try {
      await recheck();
    } catch {
      // Auth keeps the last verified status when the service is unreachable.
    } finally {
      checking = false;
    }
  };
  const interval = window.setInterval(() => void check(), 60_000);
  const delay = Date.parse(renewsAt || "") - Date.now() + 1000;
  const expiry = Number.isFinite(delay) && delay > 0
    ? window.setTimeout(() => void check(), Math.min(delay, 2_147_483_647))
    : undefined;
  const onFocus = () => void check();
  window.addEventListener("focus", onFocus);
  return () => {
    active = false;
    window.clearInterval(interval);
    if (expiry !== undefined) window.clearTimeout(expiry);
    window.removeEventListener("focus", onFocus);
  };
}
