import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/notifications-context";
import { usePanelUI } from "@/lib/panel-ui-context";
import { fetchUpdateInfo, isRemoteNewer } from "@/api/update";
import {
  applyExtensionUpdate,
  finalizePendingNativeUpdate,
  hasPendingNativeUpdate,
} from "@/utils/extension-update";
import { pendingNativesOnly } from "@/utils/replace-live-file";
import {
  getEffectiveLocalVersion,
  readCrossHostAppliedVersion,
  reloadPanelHard,
} from "@/utils/extension-version";
import {
  CROSS_HOST_UPDATE_POLL_MS,
  shouldReloadExtensionForAppliedUpdate,
} from "@/utils/cross-host-update";
import { friendlyErrorMessage } from "@/utils/user-error";
import { version as BUILD_VERSION } from "../../shared/shared";

/**
 * Panel ZXP auto-update: poll `/api/cep/update` after sign-in, wake on WSS
 * `extension.update`, apply via `applyExtensionUpdate`. Shared by Gal + Spunkram.
 *
 * Local version is max(build embed, CSXS manifest, apply stamp) so CEF-cached
 * JS cannot leave the UpdateBanner stuck after a successful install.
 *
 * When AE and Premiere are both open, the host that finishes apply writes a
 * Roaming handshake. The other host polls that file and reloads the panel
 * (not the host app) so the Update banner cannot stay on already-applied code.
 */
export function useExtensionUpdate() {
  const { authReady, signedIn } = useAuth();
  const { showStatus } = usePanelUI();
  const { onExtensionUpdateHint } = useNotifications();

  const localVersion = useMemo(() => getEffectiveLocalVersion(BUILD_VERSION), []);

  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateZxpUrl, setUpdateZxpUrl] = useState<string | null>(null);
  const [updateChangelog, setUpdateChangelog] = useState("");
  const [updateChannel, setUpdateChannel] = useState<"stable" | "beta">("stable");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<string | undefined>();
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [hasPendingNatives, setHasPendingNatives] = useState(false);

  const clearUpdate = useCallback(() => {
    setUpdateVersion(null);
    setUpdateZxpUrl(null);
    setUpdateChangelog("");
    setUpdateChannel("stable");
  }, []);

  const applyRemoteInfo = useCallback(
    (
      info: {
        version: string;
        zxpUrl: string;
        changelog?: string;
        channel?: string;
      },
      opts?: { toast?: boolean },
    ) => {
      // Re-read disk each check — stamp/manifest may change after apply.
      const effective = getEffectiveLocalVersion(BUILD_VERSION);
      if (!isRemoteNewer(effective, info.version)) {
        clearUpdate();
        return false;
      }
      setUpdateVersion(info.version);
      setUpdateZxpUrl(info.zxpUrl);
      setUpdateChangelog(
        typeof info.changelog === "string" ? info.changelog : "",
      );
      setUpdateChannel(info.channel === "beta" ? "beta" : "stable");
      if (opts?.toast) {
        showStatus(`Update available: v${info.version}`, "info", 8000);
      }
      return true;
    },
    [clearUpdate, showStatus],
  );

  // Promote Motionflow.dll (etc.) written as *.pending-update while host held the lock.
  useEffect(() => {
    try {
      const { remaining } = finalizePendingNativeUpdate();
      const nativeLeft = pendingNativesOnly(remaining);
      setHasPendingNatives(nativeLeft.length > 0);
      if (nativeLeft.length > 0) {
        showStatus(
          "Restart Premiere Pro / After Effects to finish the native plugin update.",
          "info",
          12000,
        );
      }
    } catch (err) {
      console.warn(
        "[extension-update] pending native finalize failed:",
        err instanceof Error ? err.message : err,
      );
      setHasPendingNatives(hasPendingNativeUpdate());
    }
  }, [showStatus]);

  // Other host applied this ZXP: reload the panel HTML, not Premiere / After Effects.
  const reloadingPanelRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tick = () => {
      if (reloadingPanelRef.current) return;
      const applied = readCrossHostAppliedVersion();
      if (
        !shouldReloadExtensionForAppliedUpdate({
          runningVersion: BUILD_VERSION,
          appliedVersion: applied,
          targetVersion: updateVersion,
          applying: updateBusy,
        })
      ) {
        return;
      }
      reloadingPanelRef.current = true;
      reloadPanelHard();
    };
    tick();
    const id = window.setInterval(tick, CROSS_HOST_UPDATE_POLL_MS);
    return () => window.clearInterval(id);
  }, [updateBusy, updateVersion]);

  // Re-check after sign-in so beta testers get beta.json (Bearer required).
  useEffect(() => {
    if (!authReady || !signedIn) return;
    let cancelled = false;
    fetchUpdateInfo().then((info) => {
      if (cancelled || !info?.version || !info.zxpUrl) return;
      applyRemoteInfo({
        version: info.version,
        zxpUrl: info.zxpUrl,
        changelog: info.changelog,
        channel: info.channel,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, signedIn, applyRemoteInfo]);

  // WSS wake-up when a new ZXP is uploaded — re-check /api/cep/update (beta gate).
  useEffect(() => {
    if (!authReady || !signedIn) return;
    return onExtensionUpdateHint(() => {
      void fetchUpdateInfo().then((info) => {
        if (!info?.version || !info.zxpUrl) return;
        applyRemoteInfo(
          {
            version: info.version,
            zxpUrl: info.zxpUrl,
            changelog: info.changelog,
            channel: info.channel,
          },
          { toast: true },
        );
      });
    });
  }, [authReady, signedIn, onExtensionUpdateHint, applyRemoteInfo]);

  const handleApplyUpdate = useCallback(async () => {
    if (!updateZxpUrl || !updateVersion || updateBusy) return;
    setUpdateBusy(true);
    setUpdateError(null);
    setUpdateProgress(`Downloading v${updateVersion}…`);
    try {
      const result = await applyExtensionUpdate(
        updateZxpUrl,
        (p) => {
          if (p.phase === "download") {
            if (p.totalBytes && p.totalBytes > 0) {
              const pct = Math.min(
                99,
                Math.round((p.bytesReceived / p.totalBytes) * 100),
              );
              setUpdateProgress(`Downloading v${updateVersion}… ${pct}%`);
            } else {
              setUpdateProgress(`Downloading v${updateVersion}…`);
            }
          } else if (p.phase === "extract") {
            setUpdateProgress("Extracting…");
          } else if (p.phase === "apply") {
            setUpdateProgress("Applying update…");
          } else {
            setUpdateProgress("Reloading…");
          }
        },
        updateVersion,
      );
      if (result.pendingNatives.length > 0) {
        setHasPendingNatives(true);
        setUpdateProgress("Reloading… Restart host to finish natives.");
        showStatus(
          "Panel updated. Restart Premiere Pro / After Effects to finish the native plugin update.",
          "info",
          12000,
        );
      }
    } catch (err) {
      setUpdateBusy(false);
      setUpdateProgress(undefined);
      setUpdateError(friendlyErrorMessage(err));
    }
  }, [updateZxpUrl, updateVersion, updateBusy, showStatus]);

  const [checkBusy, setCheckBusy] = useState(false);
  const checkForUpdates = useCallback(async () => {
    if (checkBusy || updateBusy) return;
    setCheckBusy(true);
    try {
      const info = await fetchUpdateInfo();
      if (!info?.version || !info.zxpUrl) {
        showStatus("Could not reach the update server.", "error", 6000);
        return;
      }
      const found = applyRemoteInfo(
        {
          version: info.version,
          zxpUrl: info.zxpUrl,
          changelog: info.changelog,
          channel: info.channel,
        },
        { toast: true },
      );
      if (!found) {
        showStatus(`You're up to date (v${localVersion}).`, "success", 5000);
      }
    } catch (err) {
      showStatus(friendlyErrorMessage(err), "error", 6000);
    } finally {
      setCheckBusy(false);
    }
  }, [
    checkBusy,
    updateBusy,
    applyRemoteInfo,
    showStatus,
    localVersion,
  ]);

  return {
    localVersion,
    updateVersion,
    updateChangelog,
    updateChannel,
    updateBusy,
    updateProgress,
    updateError,
    hasPendingNatives,
    showUpdateBanner: Boolean(updateVersion && updateZxpUrl),
    handleApplyUpdate,
    checkForUpdates,
    checkBusy,
  };
}
