import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDownloadManager } from "@/lib/download-manager-context";
import { usePackagesPathGate } from "@/lib/packages-path-gate";
import { useExtensionUpdate } from "@/lib/use-extension-update";
import {
  asBool,
  clearPreferencesFile,
  type PrefSettings,
} from "@/lib/api/preferences";
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
import { readInstallablePackages } from "@/lib/utils/pack";
import * as panelStore from "@/lib/userdata-store";
import { BRAND } from "@brands";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";
import { isReleaseAdminEmail } from "@/api/update";
import { useConfiguration } from "../../../context/ConfigurationWrapper";
import {
  clearCaptionControlsCache,
  getStoredCaptionsLocalRoot,
  setCaptionsLocalRoot,
} from "@/styles";
import { openDirectoryInOs } from "./gal-fs";
import aeIcon from "./assets/ae-icon.png";
import prIcon from "./assets/pr-icon.png";
import "./gal-settings.scss";

export function GalSettings({
  onPackReady,
}: {
  onPackReady?: (meta: InstalledPackMeta) => void;
}) {
  const {
    prefs,
    setPrefs,
    signedIn,
    subscription,
    refreshMarket,
    market,
    auth,
  } = useAuth();
  const { refreshStyles } = useConfiguration();
  const isAdmin = isReleaseAdminEmail(auth.email);
  const { enqueue, jobs } = useDownloadManager();
  const { ensurePackagesPath } = usePackagesPathGate();
  const {
    localVersion,
    updateVersion,
    checkForUpdates,
    checkBusy,
    handleApplyUpdate,
    updateBusy,
    showUpdateBanner,
  } = useExtensionUpdate();
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [captionsLocalPath, setCaptionsLocalPath] = useState(() =>
    getStoredCaptionsLocalRoot(),
  );
  const [captionsSourceMsg, setCaptionsSourceMsg] = useState<string | null>(
    null,
  );
  const host = currentPackHost();
  const hostIcon = host === "AE" ? aeIcon : prIcon;

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

  async function applyCaptionsLocalSource(folder: string | null) {
    setCaptionsLocalRoot(folder);
    setCaptionsLocalPath(folder || "");
    clearCaptionControlsCache();
    setCaptionsSourceMsg(
      folder ? "Using local Captions folder." : "Back to CDN / API.",
    );
    try {
      await refreshStyles();
    } catch {
      setCaptionsSourceMsg("Path saved — reopen Captions to refresh the grid.");
    }
  }

  function browseCaptionsSource() {
    selectFolder(
      captionsLocalPath || "",
      "Select Captions source folder (R2 layout)",
      (folder) => {
        if (!folder) return;
        void applyCaptionsLocalSource(folder);
      },
    );
  }

  function clearCaptionsSource() {
    void applyCaptionsLocalSource(null);
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

  const downloadLabel = activeJob
    ? activeJob.status === "installing"
      ? "Installing…"
      : `Downloading ${Math.round(activeJob.progress || 0)}%`
    : needsUpdate
      ? "Update pack"
      : packInstalled
        ? "Installed"
        : "Download pack";

  const apiServer = Number(prefs.defaultApiServer) === 1 ? 1 : 0;
  const useSystemFonts = asBool(prefs.useSystemFonts);
  const useProjectFolder = asBool(prefs.useCurrentProjectLocation);

  return (
    <div className="gal-settings gal-settings--embedded">
      <div className="gal-settings__body">
        <header className="gal-settings__page-head">
          <h1 className="gal-settings__page-title">Settings</h1>
        </header>

        <section className="gal-settings__group">
          <div className="gal-settings__row gal-settings__row--pack">
            <img
              className="gal-settings__host-icon"
              src={hostIcon}
              alt=""
              width={28}
              height={28}
            />
            <div className="gal-settings__row-copy">
              <p className="gal-settings__row-title">
                {marketPack?.name || BRAND.panelDisplayName}
              </p>
              <p className="gal-settings__row-sub">
                Pack {marketPack?.version || "—"} · Panel v{localVersion}
              </p>
            </div>
            <button
              type="button"
              className="gal-settings__row-action"
              onClick={() => void handleInstall()}
              disabled={
                !!activeJob || (!needsUpdate && packInstalled && !marketPack)
              }
              aria-label={downloadLabel}
              title={downloadLabel}
            >
              {activeJob ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
            </button>
          </div>

          <div className="gal-settings__divider" />

          <div className="gal-settings__row">
            <div className="gal-settings__row-copy">
              <p className="gal-settings__row-title">Updates</p>
              <p className="gal-settings__row-sub">
                {showUpdateBanner && updateVersion
                  ? `v${updateVersion} available`
                  : `Current v${localVersion}`}
              </p>
            </div>
            {showUpdateBanner && updateVersion ? (
              <button
                type="button"
                className="gal-settings__pill-btn"
                disabled={updateBusy}
                onClick={() => void handleApplyUpdate()}
              >
                {updateBusy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
                Install
              </button>
            ) : (
              <button
                type="button"
                className="gal-settings__pill-btn"
                disabled={checkBusy}
                onClick={() => void checkForUpdates()}
              >
                {checkBusy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RefreshCw className="size-3" />
                )}
                Check Updates
              </button>
            )}
          </div>
        </section>

        {message ? <p className="gal-settings__msg">{message}</p> : null}

        <p className="gal-settings__section-label">File System</p>
        <section className="gal-settings__group">
          <div className="gal-settings__field">
            <label className="gal-settings__field-label">
              Package Installation Directory
            </label>
            <div className="gal-settings__path-row">
              <input
                type="text"
                readOnly
                value={prefs.absCustomAbsolutePath || ""}
                placeholder="Select a folder…"
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
              Changing the path moves packages to the new destination.
            </p>
            {scanMsg ? <p className="gal-settings__msg">{scanMsg}</p> : null}
          </div>

          <div className="gal-settings__divider" />

          <div className="gal-settings__field">
            <label className="gal-settings__field-label">
              Stock Assets Directory
            </label>
            <div className="gal-settings__path-row">
              <input
                type="text"
                readOnly
                value={prefs.customStockLocation || ""}
                placeholder="Select a folder…"
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
          </div>

          <div className="gal-settings__divider" />

          <label className="gal-settings__toggle-row">
            <span>Use Project Folder</span>
            <input
              type="checkbox"
              className="gal-settings__switch"
              checked={useProjectFolder}
              onChange={(e) =>
                patch({ useCurrentProjectLocation: e.target.checked ? 1 : 0 })
              }
            />
          </label>
        </section>

        <p className="gal-settings__section-label">API Server</p>
        <section className="gal-settings__group">
          <p className="gal-settings__group-note">
            Change the server if package downloads fail.
          </p>
          <label className="gal-settings__choice">
            <input
              type="radio"
              name="defaultApiServer"
              checked={apiServer === 0}
              onChange={() => patch({ defaultApiServer: 0 })}
            />
            <span>Main API Server</span>
          </label>
          <div className="gal-settings__divider" />
          <label className="gal-settings__choice">
            <input
              type="radio"
              name="defaultApiServer"
              checked={apiServer === 1}
              onChange={() => patch({ defaultApiServer: 1 })}
            />
            <span>Proxy Server #1</span>
          </label>
        </section>

        <p className="gal-settings__section-label">UI</p>
        <section className="gal-settings__group">
          <label className="gal-settings__toggle-row">
            <span>
              Use System Fonts
              <small>Reload required</small>
            </span>
            <input
              type="checkbox"
              className="gal-settings__switch"
              checked={useSystemFonts}
              onChange={(e) => {
                patch({ useSystemFonts: e.target.checked ? 1 : 0 });
              }}
            />
          </label>
        </section>

        {isAdmin ? (
          <>
            <p className="gal-settings__section-label">Admin · Captions source</p>
            <section className="gal-settings__group">
              <p className="gal-settings__group-note">
                Local folder with the same layout as R2 (
                <strong>{BRAND.captionsCdnPrefix}/</strong>
                ): {"{Pack}/{Pack}.aep|mogrt"} + style folders. Clear to use CDN /
                API again.
              </p>
              <div className="gal-settings__field">
                <div className="gal-settings__path-row">
                  <input
                    type="text"
                    readOnly
                    value={captionsLocalPath}
                    placeholder="CDN / API (default)"
                    className="gal-settings__input"
                  />
                  <button
                    type="button"
                    className="gal-settings__icon-btn"
                    onClick={browseCaptionsSource}
                    aria-label="Browse captions source folder"
                  >
                    <Folder className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="gal-settings__icon-btn"
                    disabled={!captionsLocalPath}
                    onClick={clearCaptionsSource}
                    aria-label="Clear captions source"
                    title="Clear (use CDN)"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                {captionsSourceMsg ? (
                  <p className="gal-settings__msg">{captionsSourceMsg}</p>
                ) : null}
              </div>
            </section>
          </>
        ) : null}

        <p className="gal-settings__section-label">Restoring</p>
        <section className="gal-settings__group">
          <button
            type="button"
            className="gal-settings__danger-row"
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
