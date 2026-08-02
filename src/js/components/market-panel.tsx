import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Play,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { openMarketUrl, type CepMarketPackage } from "@/api/cep-market";
import { openYoutube } from "@/lib/api/market-api";
import { readInstallablePackages } from "@/lib/utils/pack";
import { uninstallPack } from "@/lib/utils/pack-install";
import { currentHostAppId } from "@/lib/utils/apply-item";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

const ACTIVE_PACK_STORAGE_KEY = "spunkram.activePackPath";

function hostPrimaryType(): "AE" | "PR" | null {
  const host = currentHostAppId();
  if (host === "AEFT") return "AE";
  if (host === "PPRO") return "PR";
  return null;
}

function priceLabel(
  item: CepMarketPackage,
  subscriptionActive: boolean,
): { label: string } {
  const price = item.custom_price;
  const free = !price || price === 0;
  if (item.owned) return { label: "Owned" };
  if (subscriptionActive || item.action === "install") {
    return { label: free ? "Included" : "Covered by Subscription" };
  }
  if (item.action === "get_free") return { label: "Free" };
  if (free) return { label: "Free" };
  return { label: `$${price}` };
}

function uiActionForItem(
  item: CepMarketPackage,
  opts: { installed: boolean; active: boolean },
): { label: string; type: string; disabled?: boolean } {
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
  // Fallback if API omits action
  if (item.owned) return { label: "Install", type: "install" };
  return { label: "Buy", type: "buy" };
}

function findInstalledMeta(
  item: CepMarketPackage,
  installed: InstalledPackMeta[],
): InstalledPackMeta | undefined {
  const name = (item.pack_name || "").toLowerCase();
  const app = (item.primary_type || "").toUpperCase();
  return installed.find(
    (p) =>
      (p.name || "").toLowerCase() === name &&
      (p.appID || p.load || "").toUpperCase() === app,
  );
}

function MarketCard({
  item,
  subscriptionActive,
  installedMeta,
  activePackPath,
  onSwitchPack,
  onRemovePack,
}: {
  item: CepMarketPackage;
  subscriptionActive: boolean;
  installedMeta?: InstalledPackMeta;
  activePackPath?: string;
  onSwitchPack: (meta: InstalledPackMeta) => void;
  onRemovePack: (meta: InstalledPackMeta) => void;
}) {
  const installed = Boolean(installedMeta);
  const active = Boolean(installedMeta && installedMeta.path === activePackPath);
  const { label: price } = priceLabel(item, subscriptionActive);
  const action = uiActionForItem(item, { installed, active });
  const imageSrc = `${item.image_url}${item.image_url.includes("?") ? "&" : "?"}v=${item.version || "1"}`;
  const showSubHint = action.type === "buy";

  function runAction(type: string) {
    if (type === "switch" && installedMeta) {
      onSwitchPack(installedMeta);
      return;
    }
    if (type === "active") return;
    if (type === "install") {
      if (item.install_url) openMarketUrl(item.install_url);
      return;
    }
    if (type === "buy") {
      if (item.buy_url) openMarketUrl(item.buy_url);
      else openMotionflowSubscribe();
    }
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
        <img
          src={imageSrc}
          alt=""
          className="size-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
          }}
        />
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
        {item.video_id && (
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
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-xs font-medium text-foreground" title={item.name}>
              {item.name}
            </h3>
            <p className="truncate text-[10px] text-muted-foreground">
              by <span className="text-foreground/80">{item.author || "Spunkram"}</span>
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-white/10 bg-secondary/50 px-1.5 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
            {item.primary_type}
          </span>
        </div>

        {showSubHint && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            Available free with Spunkram subscription
          </p>
        )}

        <div className="flex gap-1">
          <button
            type="button"
            disabled={action.disabled}
            onClick={() => runAction(action.type)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-full px-2 py-1.5 text-[10px] font-semibold transition-colors",
              action.disabled
                ? "cursor-not-allowed border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : ACCENT_PILL,
            )}
          >
            {action.label}
          </button>
          {installedMeta && (
            <button
              type="button"
              aria-label={`Remove ${item.name}`}
              onClick={() => onRemovePack(installedMeta)}
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
  const {
    market,
    marketLoading,
    marketError,
    refreshMarket,
    subscription,
  } = useAuth();
  const [packTick, setPackTick] = useState(0);

  const hostType = useMemo(() => hostPrimaryType(), []);
  const hostLabel =
    hostType === "AE" ? "After Effects" : hostType === "PR" ? "Premiere Pro" : "this host";

  const subscriptionActive =
    Boolean(market?.subscription_active) || subscription.subscribed;

  function handleRemove(meta: InstalledPackMeta) {
    uninstallPack(meta);
    setPackTick((t) => t + 1);
    onPacksChanged?.();
  }

  function handleSwitch(meta: InstalledPackMeta) {
    onSelectPack?.(meta);
  }

  useEffect(() => {
    void refreshMarket();
  }, [refreshMarket]);

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
    try {
      return localStorage.getItem(ACTIVE_PACK_STORAGE_KEY) || undefined;
    } catch {
      return undefined;
    }
  }, [activePackPath, packTick]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-2.5 py-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <span className="mr-auto text-[10px] text-muted-foreground">
          Showing {hostLabel} packs
        </span>
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
            Packs are available free with a Spunkram subscription from{" "}
            <strong>$9.9/month</strong>
          </span>
          <button
            type="button"
            onClick={openMotionflowSubscribe}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold",
              ACCENT_PILL,
            )}
          >
            Subscribe
          </button>
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
              const meta = findInstalledMeta(item, installedList);
              return (
                <MarketCard
                  key={String(item.id)}
                  item={item}
                  subscriptionActive={subscriptionActive}
                  installedMeta={meta}
                  activePackPath={resolvedActivePath}
                  onSwitchPack={handleSwitch}
                  onRemovePack={handleRemove}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
