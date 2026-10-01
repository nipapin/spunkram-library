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
  } = useAuth();
  const { jobs, enqueue, cancel, retry } = useDownloadManager();
  const { ensurePackagesPath } = usePackagesPathGate();
  const host = useOdinHost() === "AEFT" ? "AE" : "PR";
  const pack = selectOdinPackage(
    market?.Packages || [],
    host,
    subscription.subscribed,
  );
  const job = pack
    ? jobs.find((item) => String(item.pack.id) === String(pack.id))
    : undefined;
  const [error, setError] = useState("");
  const [choosingPath, setChoosingPath] = useState(false);
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
  const ready =
    signedIn &&
    authReady &&
    !marketLoading &&
    Boolean(market) &&
    !marketError &&
    !subscription.error &&
    hostReady;
  const busy =
    choosingPath ||
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
        !pack ||
        matchesOdinInstall(workspace.activePackMeta!, pack)),
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
    try {
      if (!(await ensurePackagesPath()) || currentSession.current !== session)
        return;
      if (job?.status === "error") {
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
    const key = `${auth.token}:${host}:${pack.id}`;
    const existing = readInstallablePackages().find((meta) =>
      matchesOdinInstall(meta, pack),
    );
    if (existing) {
      if (activating.current !== key) {
        activating.current = key;
        workspace.applyPack(existing);
      }
      return;
    }
    if (subscription.subscribed || attempted.current === key || job) return;
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
  ]);

  useEffect(() => {
    if (
      workspace.isTestPack ||
      !signedIn ||
      job?.status !== "done" ||
      !job.meta ||
      completed.current === job.id ||
      !pack ||
      !matchesOdinInstall(job.meta, pack)
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

  return {
    host,
    hostLabel: host === "AE" ? "After Effects" : "Premiere Pro",
    isDemo: !subscription.subscribed,
    pack,
    installed,
    busy,
    loading: !authReady || marketLoading || (!market && !marketError),
    error:
      error ||
      job?.error ||
      marketError ||
      subscription.error ||
      (ready && !pack
        ? !subscription.subscribed
          ? "Demo package is not available from the server yet."
          : "No package is available for this Adobe application."
        : ""),
    progress: job?.progress || 0,
    phase: choosingPath ? "Choose an installation folder" : job?.status,
    install,
    cancel: () => {
      if (job) cancel(job.id);
    },
    refresh: () => {
      setError("");
      void refreshMarket(true);
    },
  };
}
