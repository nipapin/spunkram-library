/**
 * AE and Premiere of the *same* brand share one Motionflow vault on disk.
 * Gal and Spunkram use separate prefs files (`BRAND.prefsCompany` /
 * `prefsProduct`) and separate CEP clients (`gal-cep` / `spunkram-cep`).
 * A stale in-memory/WS token must not wipe a newer token the other host just wrote.
 */
export function authVaultFingerprint(snapshot) {
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
/**
 * wipe — disk is empty or still holds the token that just failed.
 * reload — disk has a live token this failure does not own (rotation / unknown 401).
 */
export function resolveUnauthorizedAction(opts) {
    const disk = (opts.diskToken || "").trim();
    const failed = (opts.failedToken || "").trim();
    if (disk && (!failed || disk !== failed))
        return "reload";
    return "wipe";
}
/** Keep the shared vault when the failed token is not what is on disk. */
export function shouldKeepSharedSession(opts) {
    return resolveUnauthorizedAction(opts) === "reload";
}
export function shouldWipeSharedVault(opts) {
    return resolveUnauthorizedAction(opts) === "wipe";
}
/** Prefer `motionflowAuth`; if it was cleared, recover from the active vault account. */
export function activeAuthFromParts(auth, vault) {
    const token = auth?.token?.trim();
    if (token)
        return auth ?? {};
    const accounts = vault.accounts ?? [];
    const active = accounts.find((account) => account.id === vault.activeId) ?? accounts[0];
    if (!active?.token)
        return auth ?? {};
    return {
        token: active.token,
        id: active.id,
        email: active.email,
        name: active.name,
    };
}
/** Relative vault path — AE and Premiere of this brand both read this file. */
export function brandSharedAuthVaultRelPath(brand) {
    return `${brand.prefsCompany}/${brand.prefsProduct}/preferences.json`;
}
/** Every brand must have its own client id and disk vault so one login cannot wipe another. */
export function brandAuthVaultsAreIsolated(brands) {
    if (brands.length === 0)
        return false;
    const clients = new Set(brands.map((brand) => brand.apiClient));
    const paths = new Set(brands.map((brand) => brandSharedAuthVaultRelPath(brand)));
    return clients.size === brands.length && paths.size === brands.length;
}
