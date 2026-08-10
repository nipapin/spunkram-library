import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Play, RotateCcw, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { openMarketUrl, type CepMarketPackage, installedPackMatchesMarketItem, installedPackNeedsUpdate } from "@/api/cep-market";
import { openYoutube } from "@/lib/api/market-api";
import { readInstallablePackages } from "@/lib/utils/pack";
import { uninstallPack } from "@/lib/utils/pack-install";
import {
  activePackStorageKey,
  currentPackHost,
  LEGACY_ACTIVE_PACK_STORAGE_KEY,
  type PackHostId,
} from "@/lib/utils/pack-host";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";
import * as panelStore from "@/lib/userdata-store";
import { useDownloadManager, type DownloadJob } from "@/lib/download-manager-context";
import { usePackagesPathGate } from "@/lib/packages-path-gate";

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

function hostPrimaryType(): PackHostId | null {
  return currentPackHost();
}

function readActivePackPathForHost(host: PackHostId | null): string | undefined {
  if (!host) return undefined;
  try {
    const scoped = panelStore.getItem(activePackStorageKey(host));
    if (scoped) return scoped;
    const legacy = panelStore.getItem(LEGACY_ACTIVE_PACK_STORAGE_KEY);
    if (!legacy) return undefined;
    if (!readInstallablePackages(host).some((p) => p.path === legacy)) return undefined;
    panelStore.setItem(activePackStorageKey(host), legacy);
    return legacy;
  } catch {
    return undefined;
  }
}

function priceLabel(item: CepMarketPackage): { label: string } {
  if (item.owned) return { label: "Owned" };
  const price = item.custom_price;
  const free = !price || price === 0;
  if (free || item.action === "get_free") return { label: "Free" };
  return { label: "In subscription" };
}

function uiActionForItem(
  item: CepMarketPackage,
  opts: { installed: boolean; active: boolean; needsUpdate: boolean },
): { label: string; type: string; disabled?: boolean } {
  if (opts.installed && opts.needsUpdate) {
    return { label: "Update", type: "update" };
  }
  if (opts.installed && opts.active) {
    return { label: "Active", type: "active", disabled: true };
  }
  if (opts.installed) {
    return { label: "Switch", type: "switch" };
  }

  const serverAction = (item.action || "").toLowerCase();
  if (serverAction === "install" || serverAction === "get_free" || item.owned) {
    return {
      label: serverAction === "get_free" ? "Get Free" : "Install",
      type: "install",
    };
  }
  if (serverAction === "buy") {
    return { label: "Buy", type: "buy" };
  }
  if (item.owned) return { label: "Install", type: "install" };
  return { label: "Buy", type: "buy" };
}

function findInstalledMeta(item: CepMarketPackage, installed: InstalledPackMeta[]): InstalledPackMeta | undefined {
  return installed.find((p) => installedPackMatchesMarketItem(p, item));
}

function pathsEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

function jobStatusLabel(job: DownloadJob): string {
  switch (job.status) {
    case "queued":
      return "Queued";
    case "downloading":
      return `Downloading ${job.progress}%`;
    case "installing":
      return "Installing…";
    case "done":
      return "Installed";
    case "error":
      return job.error || "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return job.status;
  }
}

function jobWipeProgress(job: DownloadJob): number {
  if (job.status === "queued") return 0;
  if (job.status === "installing") return Math.max(95, job.progress || 0);
  return Math.max(0, Math.min(100, job.progress || 0));
}

/** Circular ring with cancel (Epic-style) — progress 0–100. */
function CancelProgressButton({
  progress,
  label,
  onCancel,
}: {
  progress: number;
  label: string;
  onCancel: () => void;
}) {
  const size = 22;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, progress));
  const offset = c - (pct / 100) * c;

  return (
    <button
      type="button"
      aria-label={`Cancel — ${label}`}
      title={label}
      onClick={onCancel}
      className="relative flex size-[22px] shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:text-destructive"
    >
      <svg className="absolute inset-0 -rotate-90" width={size} height={size} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <X className="relative z-10 size-2.5" />
    </button>
  );
}

function MarketCard({
  item,
  subscribeUrl,
  installedMeta,
  activePackPath,
  job,
  onSwitchPack,
  onRemovePack,
  onInstall,
  onCancelJob,
  onRetryJob,
}: {
  item: CepMarketPackage;
  subscribeUrl?: string | null;
  installedMeta?: InstalledPackMeta;
  activePackPath?: string;
  job?: DownloadJob;
  onSwitchPack: (meta: InstalledPackMeta) => void;
  onRemovePack: (meta: InstalledPackMeta, marketPackId: string | number) => void;
  onInstall: (item: CepMarketPackage) => void;
  onCancelJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
}) {
  const installed = Boolean(installedMeta);
  const active = Boolean(installedMeta && pathsEqual(installedMeta.path, activePackPath));
  const needsUpdate = Boolean(
    installedMeta && installedPackNeedsUpdate(installedMeta, item),
  );
  const { label: price } = priceLabel(item);
  const action = uiActionForItem(item, { installed, active, needsUpdate });
  const imageSrc = `${item.image_url}${item.image_url.includes("?") ? "&" : "?"}v=${item.version || "1"}`;
  const showSubHint = action.type === "buy";
  const detailsUrl = item.details_url?.trim() || "";
  const jobBusy = job && (job.status === "queued" || job.status === "downloading" || job.status === "installing");
  const jobFailed = job && (job.status === "error" || job.status === "cancelled");
  const wipePct = jobBusy && job ? jobWipeProgress(job) : 0;
  const colorRevealRight = 100 - wipePct;

  function runAction(type: string) {
    if (type === "switch" && installedMeta) {
      onSwitchPack(installedMeta);
      return;
    }
    if (type === "active") return;
    if (type === "install" || type === "update") {
      onInstall(item);
      return;
    }
    if (type === "buy") {
      if (item.buy_url) openMarketUrl(item.buy_url);
      else if (subscribeUrl) openMarketUrl(subscribeUrl);
      else openMotionflowSubscribe();
    }
  }

  function onImageError(e: { currentTarget: HTMLImageElement }) {
    e.currentTarget.style.opacity = "0.2";
  }

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-xl border border-white/10 bg-card/60 transition-colors hover:border-primary/40",
        active && "ring-1 ring-primary/50",
        installed && !active && "ring-1 ring-primary/20",
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-secondary/40">
        {/* Base grayscale + color linear-wipe (left → right) */}
        <img
          src={imageSrc}
          alt=""
          className={cn("size-full object-cover transition-[filter] duration-200", jobBusy && "grayscale")}
          onError={onImageError}
        />
        {jobBusy && (
          <img
            src={imageSrc}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full object-cover transition-[clip-path] duration-200 ease-out"
            style={{ clipPath: `inset(0 ${colorRevealRight}% 0 0)` }}
            onError={onImageError}
          />
        )}
        <div className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {price}
        </div>
        {item.version && (
          <div className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur">
            v{item.version}
          </div>
        )}
        {active ? (
          <div className="absolute bottom-1.5 left-1.5 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            active
          </div>
        ) : installed ? (
          <div className="absolute bottom-1.5 left-1.5 rounded-md bg-primary/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
            installed
          </div>
        ) : null}
        {item.video_id && !jobBusy && (
          <button
            type="button"
            aria-label="Play preview"
            onClick={() => openYoutube(String(item.video_id))}
            className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/35 group-hover:opacity-100"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40">
              <Play className="size-4 fill-current" />
            </span>
          </button>
        )}
      </div>

      <div className="space-y-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-medium text-foreground",
              jobBusy && "grayscale",
            )}
            title={item.name}
          >
            {item.name}
          </h3>
          {jobBusy && job && (
            <CancelProgressButton
              progress={wipePct}
              label={jobStatusLabel(job)}
              onCancel={() => onCancelJob(job.id)}
            />
          )}
          {jobFailed && job && (
            <button
              type="button"
              aria-label={job.hasCache ? "Retry install" : "Re-download"}
              title={job.hasCache ? "Retry install from cached zip" : "Re-download"}
              onClick={() => onRetryJob(job.id)}
              className="flex size-[22px] shrink-0 items-center justify-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <RotateCcw className="size-2.5" />
            </button>
          )}
        </div>

        {jobFailed && job && (
          <p className="truncate text-[10px] text-destructive" title={job.error}>
            {jobStatusLabel(job)}
          </p>
        )}

        {showSubHint && <p className="text-[10px] leading-snug text-muted-foreground">Available free with Spunkram subscription</p>}

        <div className={cn("flex gap-1", jobBusy && "grayscale")}>
          <button
            type="button"
            disabled={action.disabled || Boolean(jobBusy)}
            onClick={() => runAction(action.type)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[10px] font-semibold transition-colors",
              action.disabled ? "cursor-not-allowed border border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : ACCENT_PILL,
            )}
          >
            {jobBusy && (action.type === "install" || action.type === "update")
              ? action.type === "update"
                ? "Updating…"
                : "Installing…"
              : action.label}
          </button>

          <button
            type="button"
            onClick={() => openMarketUrl(detailsUrl)}
            className="flex items-center justify-center gap-1 rounded-full border border-white/10 bg-secondary/50 px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            Details
          </button>

          {installedMeta && (
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemovePack(installedMeta, item.id);
              }}
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-secondary/50 text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function MarketPanel({
  onBack,
  onPacksChanged,
  onSelectPack,
  activePackPath,
}: {
  onBack: () => void;
  onOpenLogin?: () => void;
  onPacksChanged?: () => void;
  onSelectPack?: (meta: InstalledPackMeta) => void;
  activePackPath?: string;
}) {
  const { market, marketLoading, marketError, refreshMarket, subscription } = useAuth();
  const { enqueue, jobs, cancel, retry, dismissPackJobs } = useDownloadManager();
  const { ensurePackagesPath } = usePackagesPathGate();
  const [packTick, setPackTick] = useState(0);
  const [installError, setInstallError] = useState<string | null>(null);
  const onPacksChangedRef = useRef(onPacksChanged);
  onPacksChangedRef.current = onPacksChanged;
  const handledDoneJobIdsRef = useRef(new Set<string>());

  const hostType = useMemo(() => hostPrimaryType(), []);
  const hostLabel = hostType === "AE" ? "After Effects" : hostType === "PR" ? "Premiere Pro" : "this host";

  const subscriptionActive = Boolean(market?.subscription_active) || subscription.subscribed;
  const subscribeUrl = market?.subscribe_url;

  async function gatePackagesPath(): Promise<boolean> {
    const ok = await ensurePackagesPath();
    if (!ok) {
      setInstallError("Choose a packages folder to install packs.");
      return false;
    }
    return true;
  }

  function handleRetryJob(jobId: string) {
    setInstallError(null);
    void (async () => {
      if (!(await gatePackagesPath())) return;
      retry(jobId);
    })();
  }

  function handleRemove(meta: InstalledPackMeta, marketPackId: string | number) {
    uninstallPack(meta);
    dismissPackJobs(marketPackId);
    if (meta.marketId != null && String(meta.marketId) !== String(marketPackId)) {
      dismissPackJobs(meta.marketId);
    }
    // Clear host active pack if this was the open one.
    if (hostType) {
      try {
        const key = activePackStorageKey(hostType);
        const active = panelStore.getItem(key);
        if (active && pathsEqual(active, meta.path)) {
          panelStore.removeItem(key);
        }
      } catch {
        // ignore
      }
    }
    setPackTick((t) => t + 1);
    onPacksChanged?.();
  }

  function handleSwitch(meta: InstalledPackMeta) {
    onSelectPack?.(meta);
  }

  function handleInstall(item: CepMarketPackage) {
    setInstallError(null);
    void (async () => {
      if (!(await gatePackagesPath())) return;
      enqueue(item, {
        useWhenReady: true,
        onReady: (meta) => {
          setPackTick((t) => t + 1);
          onPacksChanged?.();
          onSelectPack?.(meta);
        },
      });
    })();
  }

  const jobsByPackId = useMemo(() => {
    const map = new Map<string, DownloadJob>();
    for (const j of jobs) {
      const id = String(j.pack.id);
      const prev = map.get(id);
      if (!prev) {
        map.set(id, j);
        continue;
      }
      const prevBusy = prev.status === "queued" || prev.status === "downloading" || prev.status === "installing";
      const nextBusy = j.status === "queued" || j.status === "downloading" || j.status === "installing";
      if (nextBusy || (!prevBusy && j.status !== "done")) {
        map.set(id, j);
      }
    }
    return map;
  }, [jobs]);

  // Refresh installed list once per newly completed job (done jobs stay in `jobs`).
  useEffect(() => {
    let sawNewDone = false;
    for (const j of jobs) {
      if (j.status !== "done" || handledDoneJobIdsRef.current.has(j.id)) continue;
      handledDoneJobIdsRef.current.add(j.id);
      sawNewDone = true;
    }
    if (!sawNewDone) return;
    setPackTick((t) => t + 1);
    onPacksChangedRef.current?.();
  }, [jobs]);

  useEffect(() => {
    void refreshMarket();
    // Mount-only: refreshMarket identity changes after catalog load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packages = market?.Packages ?? [];

  const filtered = useMemo(() => {
    if (!hostType) return packages;
    return packages.filter((p) => p.primary_type === hostType);
  }, [packages, hostType]);

  const installedList = useMemo(() => {
    void packTick;
    return readInstallablePackages();
  }, [packTick, market]);

  const resolvedActivePath = useMemo(() => {
    if (activePackPath) return activePackPath;
    return readActivePackPathForHost(hostType);
  }, [activePackPath, packTick, hostType]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-2.5 py-2">
        <button
          type="button"
          onClick={onBack}
          className="mr-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <button
          type="button"
          onClick={() => openMotionflowSubscribe()}
          className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-card/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          Web store
        </button>
      </div>

      {!subscriptionActive && (
        <div className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2 text-[11px] text-foreground">
          <span className="flex-1">
            Packs are available free with a Spunkram subscription from <strong>$9.9/month</strong>
          </span>
          <button
            type="button"
            onClick={openMotionflowSubscribe}
            className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold", ACCENT_PILL)}
          >
            Subscribe
          </button>
        </div>
      )}

      {installError && (
        <div className="mx-2.5 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
          {installError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {marketLoading && !market ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="text-xs font-medium text-foreground">Please wait</p>
            <p className="text-[10px]">Loading in progress...</p>
          </div>
        ) : marketError ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs text-destructive">{marketError}</p>
            <button
              type="button"
              onClick={() => void refreshMarket(true)}
              className={cn("rounded-full px-3 py-1.5 text-xs font-medium", ACCENT_PILL)}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full min-h-40 items-center justify-center text-xs text-muted-foreground">
            No packages for {hostLabel}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
            {filtered.map((item) => {
              const job = jobsByPackId.get(String(item.id));
              // Installed state comes only from disk/prefs — never from a stale
              // done job.meta (that made Remove look like a no-op).
              const meta = findInstalledMeta(item, installedList);
              return (
                <MarketCard
                  key={String(item.id)}
                  item={item}
                  subscribeUrl={subscribeUrl}
                  installedMeta={meta}
                  activePackPath={resolvedActivePath}
                  job={job}
                  onSwitchPack={handleSwitch}
                  onRemovePack={handleRemove}
                  onInstall={handleInstall}
                  onCancelJob={cancel}
                  onRetryJob={handleRetryJob}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
