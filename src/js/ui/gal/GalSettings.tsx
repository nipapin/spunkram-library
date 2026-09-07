import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  Folder,
  FolderOpen,
  Loader2,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDownloadManager } from "@/lib/download-manager-context";
import { usePackagesPathGate } from "@/lib/packages-path-gate";
import {
  asBool,
  clearPreferencesFile,
  type PrefSettings,
} from "@/lib/api/preferences";
import { getUserSystemData } from "@/lib/api/usp";
import { parseDeviceFingerprint } from "@/lib/api/market-api";
import { selectFolder } from "@/lib/utils/bolt";
import {
  notifyPackagesRescan,
  resolvePackagesInstallRoot,
  scanAndRegisterPacksAtRoot,
} from "@/lib/utils/pack-install";
import { resolvePackEntitlementContextForScan } from "@/api/cep-market";
import {
  clearAllActivePackStorageKeys,
  currentPackHost,
} from "@/lib/utils/pack-host";
import {
  GAL_DEV_PLANS,
  galAccountPlanLabel,
  resolveGalAccountPlan,
  type GalAccountPlan,
} from "@/lib/utils/gal-plan";
import { isReleaseAdminEmail } from "@/api/update";
import { readInstallablePackages } from "@/lib/utils/pack";
import * as panelStore from "@/lib/userdata-store";
import { BRAND } from "@brands";
import { version as EXTENSION_VERSION } from "../../../shared/shared";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";
import { openDirectoryInOs } from "./gal-fs";
import aeIcon from "./assets/ae-icon.png";
import prIcon from "./assets/pr-icon.png";
import "./gal-settings.scss";
import "./gal-account.scss";

function accountInitial(email?: string | null, name?: string | null): string {
  const source = (name || email || "?").trim();
  return source.charAt(0).toUpperCase() || "?";
}

function realMacHex(raw?: string): string | null {
  const hex = (raw || "").replace(/[^a-f0-9]/gi, "").toLowerCase();
  return hex.length === 12 ? hex : null;
}

function uniqueSessionDevices<
  T extends {
    id: string;
    ip: string;
    user_fingerprint: string;
    name?: string;
    current?: boolean;
  },
>(devices: T[], currentMac?: string): Array<T & { revokeIds: string[] }> {
  const parent = devices.map((_, i) => i);
  const find = (i: number): number => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };
  const byKey = new Map<string, number>();
  const addKey = (key: string, index: number) => {
    if (!key) return;
    const existing = byKey.get(key);
    if (existing == null) byKey.set(key, index);
    else union(existing, index);
  };

  devices.forEach((device, index) => {
    const fp = parseDeviceFingerprint(device.user_fingerprint || "");
    const mac = realMacHex(fp.mac);
    const ip = (device.ip || "").trim().toLowerCase();
    const name = (device.name || fp.user || "").trim().toLowerCase();
    if (mac) addKey(`mac:${mac}`, index);
    if (device.current && currentMac) {
      const localMac = realMacHex(currentMac);
      if (localMac) addKey(`mac:${localMac}`, index);
    }
    if (name && ip) addKey(`name-ip:${name}|${ip}`, index);
  });

  const groups = new Map<number, T[]>();
  devices.forEach((device, index) => {
    const root = find(index);
    const list = groups.get(root);
    if (list) list.push(device);
    else groups.set(root, [device]);
  });

  const currentMacHex = realMacHex(currentMac);
  const unique: Array<T & { revokeIds: string[] }> = [];
  for (const list of groups.values()) {
    const preferred =
      list.find((d) => d.current) ||
      list.find(
        (d) =>
          realMacHex(parseDeviceFingerprint(d.user_fingerprint).mac) ===
          currentMacHex,
      ) ||
      list[0];
    unique.push({
      ...preferred,
      current:
        list.some((d) => d.current) ||
        list.some(
          (d) =>
            realMacHex(parseDeviceFingerprint(d.user_fingerprint).mac) ===
            currentMacHex,
        ) ||
        preferred.current,
      revokeIds: [...new Set(list.map((d) => d.id).filter(Boolean))],
    });
  }
  unique.sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)));
  return unique;
}

export function GalSettings({
  onBack,
  onPackReady,
}: {
  onBack: () => void;
  onPackReady?: (meta: InstalledPackMeta) => void;
}) {
  const {
    auth,
    prefs,
    setPrefs,
    signedIn,
    subscription,
    logout,
    revoke,
    refreshMarket,
    market,
  } = useAuth();
  const { enqueue, jobs } = useDownloadManager();
  const { ensurePackagesPath } = usePackagesPathGate();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sys = useMemo(() => getUserSystemData(), []);
  const host = currentPackHost();
  const hostIcon = host === "AE" ? aeIcon : prIcon;

  const isAdmin = isReleaseAdminEmail(auth.email);
  const galPlan = useMemo(
    () =>
      resolveGalAccountPlan({
        subscribed: subscription.subscribed,
        purchases: subscription.purchases,
        host,
      }),
    [subscription.subscribed, subscription.purchases, host],
  );

  function setAdminDevPlan(plan: GalAccountPlan) {
    patch({ adminDevPlan: plan });
  }

  const sessionDevices = useMemo(
    () => uniqueSessionDevices(subscription.devices, sys.mac),
    [subscription.devices, sys.mac],
  );

  const installed = useMemo(() => readInstallablePackages(host), [host, jobs]);
  const marketPack = useMemo(() => {
    const packs = market?.Packages ?? [];
    if (!host) return packs[0] ?? null;
    return (
      packs.find((p) => (p.primary_type || "").toUpperCase() === host) ||
      packs[0] ||
      null
    );
  }, [market?.Packages, host]);

  const activeJob = useMemo(() => {
    if (!marketPack) return null;
    return (
      jobs.find(
        (j) =>
          j.pack.id === marketPack.id &&
          (j.status === "queued" ||
            j.status === "downloading" ||
            j.status === "installing"),
      ) ?? null
    );
  }, [jobs, marketPack]);

  const packInstalled = installed.length > 0;
  const needsUpdate = !!marketPack && marketPack.action === "update";
  const packageThumb =
    marketPack?.image_url && marketPack.image_url.trim()
      ? `${marketPack.image_url}${
          marketPack.image_url.includes("?") ? "&" : "?"
        }v=${encodeURIComponent(marketPack.version || "1")}`
      : null;

  useEffect(() => {
    void refreshMarket(false);
  }, [refreshMarket]);

  function patch(partial: Partial<PrefSettings>) {
    setPrefs({ ...prefs, ...partial });
  }

  function browsePackages() {
    selectFolder(
      prefs.absCustomAbsolutePath || resolvePackagesInstallRoot(null) || "",
      "Select packages folder",
      (folder) => {
        if (!folder) return;
        void (async () => {
          patch({
            absCustomAbsolutePath: folder,
            useCustomPathBySubscription: 1,
          });
          const entitlement = signedIn
            ? await resolvePackEntitlementContextForScan({
                signedIn: true,
                purchases: subscription.purchases,
              })
            : null;
          const scan = scanAndRegisterPacksAtRoot(folder, entitlement);
          if (scan.found === 0) {
            setScanMsg("Folder saved. No pack files found under AE/ or PR/ yet.");
          } else if (scan.rejected > 0 && scan.added + scan.updated === 0) {
            setScanMsg(`Found ${scan.found} pack(s), but none are licensed.`);
          } else if (scan.added + scan.updated > 0) {
            setScanMsg(
              `Found ${scan.found} pack(s): ${scan.added} registered, ${scan.updated} updated.`,
            );
            notifyPackagesRescan(scan);
          } else {
            setScanMsg(`Found ${scan.found} pack(s) — already registered.`);
          }
        })();
      },
    );
  }

  function browseAssets() {
    selectFolder(
      prefs.customStockLocation || "",
      "Select stock assets folder",
      (folder) => {
        if (!folder) return;
        patch({
          customStockLocation: folder,
          useCustomPathForAssets: 1,
        });
      },
    );
  }

  function reloadExtension() {
    if (window.location?.reload) window.location.reload();
  }

  function resetAllSettings() {
    setBusy(true);
    setConfirmReset(false);
    clearPreferencesFile();
    try {
      clearAllActivePackStorageKeys((key) => panelStore.removeItem(key));
    } catch {
      // ignore
    }
    reloadExtension();
  }

  async function handleInstall() {
    setMessage(null);
    if (!marketPack) {
      setMessage("No pack available for this host.");
      return;
    }
    if (!(await ensurePackagesPath())) return;
    enqueue(marketPack, {
      useWhenReady: true,
      onReady: (meta) => {
        onPackReady?.(meta);
        setMessage("Pack ready.");
      },
    });
  }

  async function handleLogout() {
    setBusy(true);
    await logout();
    setBusy(false);
  }

  async function handleRevoke(ids: string[]) {
    setBusy(true);
    setMessage(null);
    let lastError: string | null = null;
    for (const id of ids) {
      const result = await revoke(id);
      if (!result.ok) lastError = result.message || "Revoke failed";
    }
    setBusy(false);
    if (lastError) setMessage(lastError);
  }

  const statusLabel = subscription.error
    ? "Error"
    : galAccountPlanLabel(galPlan);

  const planAccent = !subscription.error && galPlan !== "free";

  const downloadLabel = activeJob
    ? activeJob.status === "installing"
      ? "Installing…"
      : `Downloading ${Math.round(activeJob.progress || 0)}%`
    : needsUpdate
      ? "Update"
      : packInstalled
        ? "Installed"
        : "Download";

  const apiServer = Number(prefs.defaultApiServer) === 1 ? 1 : 0;
  const useSystemFonts = asBool(prefs.useSystemFonts);

  return (
    <div className="gal-settings">
      <div className="gal-settings__top">
        <button
          type="button"
          className="gal-settings__back"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="gal-settings__version" title="Revision">
          {EXTENSION_VERSION}
        </span>
      </div>

      <div className="gal-settings__body">
        <section className="gal-account__profile">
          <div className="gal-account__avatar-wrap">
            <div className="gal-account__avatar">
              {accountInitial(auth.email, auth.name)}
            </div>
            <span className="gal-account__dot" aria-hidden />
          </div>
          <div className="gal-account__profile-copy">
            <p className="gal-account__email">{auth.email || "Signed in"}</p>
            <p className="gal-account__status">
              Plan{" "}
              <span
                className={
                  planAccent
                    ? "gal-account__status-value"
                    : "gal-account__status-value gal-account__status-value--muted"
                }
              >
                {statusLabel}
              </span>
            </p>
            {isAdmin ? (
              <div className="gal-account__dev-plan">
                <span className="gal-account__plan-switch" role="group" aria-label="Dev plan">
                  {GAL_DEV_PLANS.map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      className={
                        prefs.adminDevPlan === plan
                          ? "gal-account__plan-chip is-active"
                          : "gal-account__plan-chip"
                      }
                      onClick={() => setAdminDevPlan(plan)}
                    >
                      {galAccountPlanLabel(plan)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={
                      !prefs.adminDevPlan
                        ? "gal-account__plan-chip is-active"
                        : "gal-account__plan-chip"
                    }
                    onClick={() => patch({ adminDevPlan: "" })}
                  >
                    Live
                  </button>
                </span>
                <p className="gal-account__dev-hint">Dev test · local only</p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="gal-account__logout"
            onClick={() => void handleLogout()}
            disabled={busy}
            aria-label="Log out"
          >
            <LogOut className="size-3.5" />
          </button>
        </section>

        <section className="gal-account__product">
          <div
            className={
              packageThumb ? "gal-account__hero has-thumb" : "gal-account__hero"
            }
            style={
              packageThumb
                ? { backgroundImage: `url("${packageThumb}")` }
                : undefined
            }
            role="img"
            aria-label={marketPack?.name || BRAND.panelDisplayName}
          >
            {packageThumb ? null : <span>GAL TOOLKIT MAX</span>}
          </div>
          <div className="gal-account__product-row">
            <div className="gal-account__host">
              <img src={hostIcon} alt="" width={30} height={30} />
            </div>
            <div className="gal-account__product-copy">
              <p className="gal-account__product-title">
                {marketPack?.name || BRAND.panelDisplayName}
              </p>
              <p className="gal-account__product-version">
                version {marketPack?.version || EXTENSION_VERSION}
              </p>
            </div>
            <button
              type="button"
              className="gal-account__download"
              onClick={() => void handleInstall()}
              disabled={
                !!activeJob || (!needsUpdate && packInstalled && !marketPack)
              }
              aria-label={downloadLabel}
              title={downloadLabel}
            >
              {activeJob ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
            </button>
          </div>
        </section>

        {message ? <p className="gal-account__msg">{message}</p> : null}

        <section className="gal-settings__block">
          <h2>Active Devices</h2>
          {sessionDevices.length === 0 ? (
            <p className="gal-settings__note">No devices listed</p>
          ) : (
            <ul className="gal-settings__devices">
              {sessionDevices.map((device) => {
                const fp = parseDeviceFingerprint(device.user_fingerprint || "");
                return (
                  <li key={device.id || device.ip}>
                    <div>
                      <strong>{device.name || fp.user || "Device"}</strong>
                      <span>
                        {device.ip}
                        {device.current ? " · This device" : ""}
                      </span>
                    </div>
                    {!device.current ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRevoke(device.revokeIds)}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="gal-settings__block">
          <h2>File System</h2>

          <p className="gal-settings__label">Package Installation Directory</p>
          <div className="gal-settings__path-row">
            <input
              type="text"
              readOnly
              value={prefs.absCustomAbsolutePath || ""}
              placeholder=""
              className="gal-settings__input"
            />
            <button
              type="button"
              className="gal-settings__icon-btn"
              onClick={browsePackages}
              aria-label="Browse packages folder"
            >
              <Folder className="size-3.5" />
            </button>
            <button
              type="button"
              className="gal-settings__icon-btn"
              onClick={() =>
                openDirectoryInOs(prefs.absCustomAbsolutePath || "")
              }
              aria-label="Open packages folder"
            >
              <FolderOpen className="size-3.5" />
            </button>
          </div>
          <p className="gal-settings__note">
            Note: Changing the custom path will move all packages to the new
            destination.
          </p>
          {scanMsg ? <p className="gal-settings__msg">{scanMsg}</p> : null}

          <p className="gal-settings__label gal-settings__label--spaced">
            Stock Assets Directory
          </p>
          <div className="gal-settings__path-row">
            <input
              type="text"
              readOnly
              value={prefs.customStockLocation || ""}
              placeholder=""
              className="gal-settings__input"
            />
            <button
              type="button"
              className="gal-settings__icon-btn"
              onClick={browseAssets}
              aria-label="Browse stock folder"
            >
              <Folder className="size-3.5" />
            </button>
            <button
              type="button"
              className="gal-settings__icon-btn"
              onClick={() => openDirectoryInOs(prefs.customStockLocation || "")}
              aria-label="Open stock folder"
            >
              <FolderOpen className="size-3.5" />
            </button>
          </div>

          <label className="gal-settings__check">
            <input
              type="checkbox"
              checked={asBool(prefs.useCurrentProjectLocation)}
              onChange={(e) =>
                patch({ useCurrentProjectLocation: e.target.checked ? 1 : 0 })
              }
            />
            <span>Use Project Folder</span>
          </label>
        </section>

        <section className="gal-settings__block">
          <h2>API Server</h2>
          <p className="gal-settings__note">
            Try changing the server if you are having problems downloading
            packages.
          </p>
          <div className="gal-settings__radios">
            <label className="gal-settings__radio">
              <input
                type="radio"
                name="defaultApiServer"
                checked={apiServer === 0}
                onChange={() => patch({ defaultApiServer: 0 })}
              />
              <span>Main API Server</span>
            </label>
            <label className="gal-settings__radio">
              <input
                type="radio"
                name="defaultApiServer"
                checked={apiServer === 1}
                onChange={() => patch({ defaultApiServer: 1 })}
              />
              <span>Proxy Server #1</span>
            </label>
          </div>
        </section>

        <section className="gal-settings__block">
          <h2>UI</h2>
          <label className="gal-settings__check">
            <input
              type="checkbox"
              checked={useSystemFonts}
              onChange={(e) => {
                patch({ useSystemFonts: e.target.checked ? 1 : 0 });
              }}
            />
            <span>
              Use System Fonts <small>(Reload Required)</small>
            </span>
          </label>
        </section>

        <section className="gal-settings__block">
          <h2>Restoring An Extension</h2>
          <button
            type="button"
            className="gal-settings__reset"
            onClick={() => setConfirmReset(true)}
          >
            Reset all settings
          </button>
        </section>
      </div>

      {confirmReset ? (
        <div className="gal-settings__confirm">
          <div className="gal-settings__confirm-card">
            <h3>Reset all settings?</h3>
            <p>
              preferences.json will be cleared. You will need to sign in again.
            </p>
            <div className="gal-settings__confirm-actions">
              <button type="button" onClick={resetAllSettings} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Reset
              </button>
              <button type="button" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
