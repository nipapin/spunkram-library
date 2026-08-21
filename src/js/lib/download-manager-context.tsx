import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  downloadAndInstallOrUpdatePack,
  hasCachedPackZip,
  installCachedPack,
  installedPackMatchesMarketItem,
  type CepMarketPackage,
} from "@/api/cep-market";
import { handleUnauthorized } from "@/lib/api/session";
import { usePanelUI } from "@/lib/panel-ui-context";
import { readInstallablePackages } from "@/lib/utils/pack";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";
import { friendlyErrorMessage } from "@/utils/user-error";
import { reportSupportError } from "@/api/support";

export type DownloadJobStatus =
  | "queued"
  | "downloading"
  | "installing"
  | "done"
  | "error"
  | "cancelled";

export type DownloadJob = {
  id: string;
  pack: CepMarketPackage;
  status: DownloadJobStatus;
  progress: number; // 0–100
  useWhenReady: boolean;
  error?: string;
  meta?: InstalledPackMeta;
  /** True when a zip is on disk and install can be retried offline. */
  hasCache?: boolean;
};

type EnqueueOpts = {
  useWhenReady?: boolean;
  onReady?: (meta: InstalledPackMeta) => void;
};

type DownloadManagerContextValue = {
  jobs: DownloadJob[];
  activeCount: number;
  enqueue: (pack: CepMarketPackage, opts?: EnqueueOpts) => string;
  cancel: (jobId: string) => void;
  clearFinished: () => void;
  /** Drop finished/error jobs for a market pack (after uninstall). */
  dismissPackJobs: (packId: string | number) => void;
  setUseWhenReady: (jobId: string, value: boolean) => void;
  /** Retry install from cached zip (or re-download if cache missing). */
  retry: (jobId: string) => void;
};

const DownloadManagerContext = createContext<DownloadManagerContextValue | null>(
  null,
);

export function DownloadManagerProvider({
  children,
  onPackReady,
}: {
  children: ReactNode;
  /** Called when useWhenReady job finishes successfully. */
  onPackReady?: (meta: InstalledPackMeta) => void;
}) {
  const { showStatus } = usePanelUI();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(new Set<string>());
  const abortControllers = useRef(new Map<string, AbortController>());
  const readyHandlers = useRef(new Map<string, (meta: InstalledPackMeta) => void>());
  /** Prefer cache install when retrying a failed job. */
  const preferCacheRef = useRef(new Set<string>());

  const updateJob = useCallback((id: string, patch: Partial<DownloadJob>) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    );
  }, []);

  const releaseIfActive = useCallback((jobId: string) => {
    if (activeJobIdRef.current !== jobId) return false;
    activeJobIdRef.current = null;
    runningRef.current = false;
    abortControllers.current.delete(jobId);
    return true;
  }, []);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    const nextId = queueRef.current.find((id) => !cancelledRef.current.has(id));
    if (!nextId) return;
    queueRef.current = queueRef.current.filter((id) => id !== nextId);
    runningRef.current = true;
    activeJobIdRef.current = nextId;

    const jobSnap = await new Promise<DownloadJob | undefined>((resolve) => {
      setJobs((prev) => {
        resolve(prev.find((j) => j.id === nextId));
        return prev;
      });
    });

    if (!jobSnap || cancelledRef.current.has(nextId)) {
      if (releaseIfActive(nextId)) void pump();
      return;
    }

    const installedList = readInstallablePackages();
    const installedMeta = installedList.find((p) =>
      installedPackMatchesMarketItem(p, jobSnap.pack),
    );

    const preferCache =
      !installedMeta &&
      (preferCacheRef.current.has(nextId) || hasCachedPackZip(jobSnap.pack));
    preferCacheRef.current.delete(nextId);

    const controller = new AbortController();
    abortControllers.current.set(nextId, controller);

    updateJob(nextId, {
      status: preferCache ? "installing" : "downloading",
      progress: preferCache ? 90 : 0,
      error: undefined,
      hasCache: preferCache || hasCachedPackZip(jobSnap.pack),
    });

    try {
      let result = preferCache
        ? await installCachedPack(jobSnap.pack)
        : await downloadAndInstallOrUpdatePack(jobSnap.pack, installedMeta, {
            signal: controller.signal,
            onProgress: ({ bytesReceived, totalBytes }) => {
              if (cancelledRef.current.has(nextId)) return;
              const pct =
                totalBytes && totalBytes > 0
                  ? Math.min(90, Math.round((bytesReceived / totalBytes) * 100))
                  : Math.min(80, Math.round(bytesReceived / (1024 * 50)));
              updateJob(nextId, { status: "downloading", progress: pct });
            },
            onPhase: (phase) => {
              if (cancelledRef.current.has(nextId)) return;
              if (phase === "installing") {
                updateJob(nextId, { status: "installing", progress: 95 });
              } else {
                updateJob(nextId, { status: "downloading" });
              }
            },
          });

      // Cache vanished between check and install — only then re-download.
      if (preferCache && !result.ok && result.code === "NO_CACHE") {
        if (cancelledRef.current.has(nextId)) {
          updateJob(nextId, { status: "cancelled" });
          return;
        }
        updateJob(nextId, { status: "downloading", progress: 0, hasCache: false });
        result = await downloadAndInstallOrUpdatePack(jobSnap.pack, installedMeta, {
          signal: controller.signal,
          onProgress: ({ bytesReceived, totalBytes }) => {
            if (cancelledRef.current.has(nextId)) return;
            const pct =
              totalBytes && totalBytes > 0
                ? Math.min(90, Math.round((bytesReceived / totalBytes) * 100))
                : Math.min(80, Math.round(bytesReceived / (1024 * 50)));
            updateJob(nextId, { status: "downloading", progress: pct });
          },
          onPhase: (phase) => {
            if (cancelledRef.current.has(nextId)) return;
            if (phase === "installing") {
              updateJob(nextId, { status: "installing", progress: 95 });
            } else {
              updateJob(nextId, { status: "downloading" });
            }
          },
        });
      }

      if (cancelledRef.current.has(nextId) || (!result.ok && result.code === "ABORTED")) {
        updateJob(nextId, { status: "cancelled" });
      } else if (!result.ok) {
        if (result.code === "UNAUTHORIZED") handleUnauthorized();
        const message = friendlyErrorMessage(result.message);
        updateJob(nextId, {
          status: "error",
          error: message,
          progress: 0,
          hasCache: Boolean(result.cachedZipPath) || hasCachedPackZip(jobSnap.pack),
        });
        showStatus(message, "error", 6000);
        reportSupportError("pack.download", result.message, {
          error_code: result.code || null,
          pack_id: String(jobSnap.pack.id),
          pack_name: jobSnap.pack.name,
        });
      } else {
        updateJob(nextId, {
          status: "done",
          progress: 100,
          meta: result.meta,
          hasCache: false,
        });
        showStatus(
          installedMeta ? `Updated: ${jobSnap.pack.name}` : `Installed: ${jobSnap.pack.name}`,
          "success",
          4000,
        );
        // Re-read useWhenReady from latest job state (user may have toggled Switch).
        const latest = await new Promise<DownloadJob | undefined>((resolve) => {
          setJobs((prev) => {
            resolve(prev.find((j) => j.id === nextId));
            return prev;
          });
        });
        if (latest?.useWhenReady ?? jobSnap.useWhenReady) {
          readyHandlers.current.get(nextId)?.(result.meta);
          onPackReady?.(result.meta);
        }
      }
    } catch (e) {
      if (cancelledRef.current.has(nextId)) {
        updateJob(nextId, { status: "cancelled" });
      } else {
        const message = friendlyErrorMessage(e);
        updateJob(nextId, {
          status: "error",
          error: message,
          hasCache: hasCachedPackZip(jobSnap.pack),
        });
        showStatus(message, "error", 6000);
        reportSupportError("pack.download", e, {
          pack_id: String(jobSnap.pack.id),
          pack_name: jobSnap.pack.name,
        });
      }
    } finally {
      readyHandlers.current.delete(nextId);
      // Only continue the queue if we still own the active slot.
      // Cancel may have already released the lock and started the next job.
      if (releaseIfActive(nextId)) void pump();
    }
  }, [onPackReady, releaseIfActive, showStatus, updateJob]);

  const enqueue = useCallback(
    (pack: CepMarketPackage, opts?: EnqueueOpts) => {
      const id = `dl-${pack.id}-${Date.now()}`;
      const useWhenReady = opts?.useWhenReady !== false;
      const cached = hasCachedPackZip(pack);
      if (opts?.onReady) readyHandlers.current.set(id, opts.onReady);
      if (cached) preferCacheRef.current.add(id);
      setJobs((prev) => [
        {
          id,
          pack,
          status: "queued",
          progress: 0,
          useWhenReady,
          hasCache: cached,
        },
        ...prev,
      ]);
      queueRef.current.push(id);
      showStatus(
        cached ? `Installing from cache: ${pack.name}` : `Queued: ${pack.name}`,
        "info",
        2500,
      );
      void pump();
      return id;
    },
    [pump, showStatus],
  );

  const cancel = useCallback(
    (jobId: string) => {
      cancelledRef.current.add(jobId);
      queueRef.current = queueRef.current.filter((id) => id !== jobId);
      abortControllers.current.get(jobId)?.abort();
      abortControllers.current.delete(jobId);
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId &&
          (j.status === "queued" ||
            j.status === "downloading" ||
            j.status === "installing")
            ? { ...j, status: "cancelled" }
            : j,
        ),
      );

      // Release the pump lock immediately so the next pack can start.
      // The aborted job's finally will no-op if it no longer owns the slot.
      if (releaseIfActive(jobId)) {
        void pump();
      }
    },
    [pump, releaseIfActive],
  );

  const clearFinished = useCallback(() => {
    setJobs((prev) =>
      prev.filter(
        (j) =>
          j.status === "queued" ||
          j.status === "downloading" ||
          j.status === "installing",
      ),
    );
  }, []);

  const dismissPackJobs = useCallback((packId: string | number) => {
    const id = String(packId);
    setJobs((prev) =>
      prev.filter((j) => {
        if (String(j.pack.id) !== id) return true;
        // Keep in-flight jobs; drop terminal ones that would ghost "installed".
        return (
          j.status === "queued" ||
          j.status === "downloading" ||
          j.status === "installing"
        );
      }),
    );
  }, []);

  const setUseWhenReady = useCallback((jobId: string, value: boolean) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, useWhenReady: value } : j)),
    );
  }, []);

  const retry = useCallback(
    (jobId: string) => {
      setJobs((prev) => {
        const job = prev.find((j) => j.id === jobId);
        if (!job || (job.status !== "error" && job.status !== "cancelled")) {
          return prev;
        }
        cancelledRef.current.delete(jobId);
        if (job.hasCache || hasCachedPackZip(job.pack)) {
          preferCacheRef.current.add(jobId);
        }
        queueRef.current.push(jobId);
        void pump();
        return prev.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: "queued" as const,
                progress: 0,
                error: undefined,
                hasCache: j.hasCache || hasCachedPackZip(j.pack),
              }
            : j,
        );
      });
    },
    [pump],
  );

  const activeCount = useMemo(
    () =>
      jobs.filter(
        (j) =>
          j.status === "queued" ||
          j.status === "downloading" ||
          j.status === "installing",
      ).length,
    [jobs],
  );

  const value = useMemo(
    () => ({
      jobs,
      activeCount,
      enqueue,
      cancel,
      clearFinished,
      dismissPackJobs,
      setUseWhenReady,
      retry,
    }),
    [
      jobs,
      activeCount,
      enqueue,
      cancel,
      clearFinished,
      dismissPackJobs,
      setUseWhenReady,
      retry,
    ],
  );

  return (
    <DownloadManagerContext.Provider value={value}>
      {children}
    </DownloadManagerContext.Provider>
  );
}

export function useDownloadManager(): DownloadManagerContextValue {
  const ctx = useContext(DownloadManagerContext);
  if (!ctx) {
    return {
      jobs: [],
      activeCount: 0,
      enqueue: () => "",
      cancel: () => undefined,
      clearFinished: () => undefined,
      dismissPackJobs: () => undefined,
      setUseWhenReady: () => undefined,
      retry: () => undefined,
    };
  }
  return ctx;
}
