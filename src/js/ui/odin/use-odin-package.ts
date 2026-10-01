import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDownloadManager } from "@/lib/download-manager-context";
import { usePackagesPathGate } from "@/lib/packages-path-gate";
import { readInstallablePackages } from "@/lib/utils/pack";
import type { usePackWorkspace } from "@/lib/use-pack-workspace";
import {
  getResolvedHostSync,
  getResolvedHostAppId,
} from "@/lib/utils/host-identity";
import { normalizePackHost } from "@/lib/utils/pack-host";
import { useOdinHost } from "./use-odin-host";
import {
  isOdinDemo,
  matchesOdinInstall,
  selectOdinPackage,
} from "./odin-package-selection";

export function useOdinPackage(workspace: ReturnType<typeof usePackWorkspace>) {
  const {
    auth,
    authReady,
    signedIn,
    market,
    marketLoading,
    marketError,
    subscription,
    refreshMarket,
    recheck,
  } = useAuth();
  const { jobs, enqueue, cancel, retry } = useDownloadManager();
  const { ensurePackagesPath } = usePackagesPathGate();
  const host = useOdinHost() === "AEFT" ? "AE" : "PR";
  const pack = selectOdinPackage(
    market?.Packages || [],
    host,
    subscription.subscribed,
  );
  const targetKey = pack ? `${auth.token}:${host}:${pack.id}:${pack.version || ""}` : "";
  const currentTarget = useRef(targetKey);
  currentTarget.current = targetKey;
  const job = pack
    ? jobs.find((item) => String(item.pack.id) === String(pack.id) && item.pack.version === pack.version)
    : undefined;
  const [error, setError] = useState("");
  const [choosingPath, setChoosingPath] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const retrying = useRef(false);
  const attempted = useRef("");
  const activating = useRef("");
  const completed = useRef("");
  const installing = useRef(false);
  const currentSession = useRef(auth.token);
  currentSession.current = auth.token;
  const native = typeof window.cep !== "undefined";
  const [hostReady, setHostReady] = useState(
    !native || Boolean(getResolvedHostSync()),
  );
  useEffect(() => {
    if (!native || getResolvedHostSync()) {
      setHostReady(true);
      return;
    }
    let active = true;
    void getResolvedHostAppId().then(() => {
      if (active) setHostReady(true);
    });
    return () => {
      active = false;
    };
  }, [native]);

  // Odin has no remote subscription notifications. Recheck on focus, every
  // minute, and at the current expiry so an open panel switches editions too.
  useEffect(() => {
    if (!signedIn || !authReady || workspace.isTestPack) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (!active || checking) return;
      checking = true;
      try { await recheck(); } catch { /* Auth keeps the last verified edition on connection errors. */ }
      finally { checking = false; }
    };
    const interval = window.setInterval(() => void check(), 60_000);
    const expires = Date.parse(subscription.renews_at || "");
    const delay = expires - Date.now() + 1000;
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
  }, [signedIn, authReady, auth.token, subscription.renews_at, workspace.isTestPack, recheck]);

  useEffect(() => {
    if (workspace.isTestPack) return;
    for (const item of jobs) {
      if (!["queued", "downloading", "installing"].includes(item.status)) continue;
      if (!signedIn || (pack && (String(item.pack.id) !== String(pack.id) || item.pack.version !== pack.version))) cancel(item.id);
    }
  }, [signedIn, pack, jobs, cancel, workspace.isTestPack]);
  const ready =
    signedIn &&
    authReady &&
    !marketLoading &&
    Boolean(market) &&
    !marketError &&
    !subscription.error &&
    !checkingAccount &&
    hostReady;
  const busy =
    checkingAccount || choosingPath ||
    Boolean(
      job && ["queued", "downloading", "installing"].includes(job.status),
    );
  const editionMatches =
    workspace.activePackMeta &&
    normalizePackHost(
      workspace.activePackMeta.appID || workspace.activePackMeta.load,
    ) === host &&
    isOdinDemo(workspace.activePackMeta) === !subscription.subscribed;
  const installed = Boolean(
    (workspace.isTestPack || editionMatches) &&
      workspace.packFilePath &&
      !workspace.packError &&
      (workspace.isTestPack ||
        (ready && pack && matchesOdinInstall(workspace.activePackMeta!, pack) &&
          workspace.activePackMeta?.version === pack.version)),
  );

  async function install() {
    if (workspace.isTestPack) return;
    if (!pack || !ready || installing.current || busy) return;
    if (!native) {
      setError("Open Odin Pro in Adobe to install the package.");
      return;
    }
    installing.current = true;
    setChoosingPath(true);
    setError("");
    const session = auth.token;
    const target = targetKey;
    try {
      if (!(await ensurePackagesPath({ useDefault: true })) || currentSession.current !== session || currentTarget.current !== target)
        return;
      if (job && ["error", "cancelled"].includes(job.status)) {
        retry(job.id);
        return;
      }
      enqueue(pack, { useWhenReady: false });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to install the package",
      );
    } finally {
      installing.current = false;
      setChoosingPath(false);
    }
  }

  useEffect(() => {
    if (workspace.isTestPack || !ready || !pack || busy || installed || !native)
      return;
    const key = targetKey;
    const existing = readInstallablePackages().find((meta) =>
      matchesOdinInstall(meta, pack) && meta.version === pack.version,
    );
    if (existing && !(activating.current === key && workspace.packError)) {
      if (activating.current !== key) {
        activating.current = key;
        workspace.applyPack(existing);
      }
      return;
    }
    if (attempted.current === key || (job && ["error", "cancelled"].includes(job.status))) return;
    attempted.current = key;
    void install();
  }, [
    ready,
    workspace.isTestPack,
    pack,
    busy,
    installed,
    native,
    host,
    auth.token,
    subscription.subscribed,
    job,
    workspace.applyPack,
    workspace.packError,
    targetKey,
  ]);

  useEffect(() => {
    if (
      workspace.isTestPack ||
      !signedIn ||
      job?.status !== "done" ||
      !job.meta ||
      completed.current === job.id ||
      !pack ||
      !matchesOdinInstall(job.meta, pack) || job.meta.version !== pack.version
    )
      return;
    completed.current = job.id;
    workspace.reloadPackList();
    workspace.applyPack(job.meta);
  }, [
    signedIn,
    job,
    pack,
    workspace.reloadPackList,
    workspace.applyPack,
    workspace.isTestPack,
  ]);

  const packageError = error || job?.error || marketError || subscription.error ||
    (job?.status === "done" && completed.current === job.id ? workspace.packError : "") ||
    (ready && !pack ? "No package is available for this Adobe application." : "");
  return {
    host,
    hostLabel: host === "AE" ? "After Effects" : "Premiere Pro",
    isDemo: !subscription.subscribed,
    pack,
    installed,
    blocking: !workspace.isTestPack && (busy || !installed),
    busy,
    loading: checkingAccount || !authReady || marketLoading || (!market && !marketError),
    error: packageError,
    progress: job?.progress || 0,
    phase: choosingPath ? "preparing" : job?.status,
    install,
    refresh: async () => {
      if (retrying.current) return;
      retrying.current = true;
      setCheckingAccount(true);
      setError("");
      try {
        const result = await recheck();
        if (!result.ok) {
          setError(result.message || "Unable to verify your account. Please try again.");
          return;
        }
        await refreshMarket(true);
        attempted.current = "";
        if (currentTarget.current === targetKey && job && ["error", "cancelled"].includes(job.status)) retry(job.id);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unable to set up your library");
      } finally {
        retrying.current = false;
        setCheckingAccount(false);
      }
    },
  };
}
