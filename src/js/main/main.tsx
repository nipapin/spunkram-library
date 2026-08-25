import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Lock, ArrowUpRight, X, XCircle } from "lucide-react";
import { PanelHeader } from "@/components/panel-header";
import { PanelToolbar } from "@/components/panel-toolbar";
import { PanelSidebar } from "@/components/panel-sidebar";
import { FootageGrid } from "@/components/footage-grid";
import { TutorialsPanel } from "@/components/tutorials-panel";
import { PanelFooter } from "@/components/panel-footer";
import { AiToolsPanel } from "@/components/ai-tools-panel";
import { MarketPanel } from "@/components/market-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { AccountPanel } from "@/components/account-panel";
import { LoginScreen } from "@/components/login-screen";
import { UpdateBanner } from "@/components/update-banner";
import { FootagesPanel } from "@/footages";
import { PanelUIProvider, usePanelUI } from "@/lib/panel-ui-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { NotificationsProvider, useNotifications } from "@/lib/notifications-context";
import {
  DownloadManagerProvider,
  useDownloadManager,
} from "@/lib/download-manager-context";
import { PackagesPathGateProvider } from "@/lib/packages-path-gate";
import { fetchUpdateInfo, isRemoteNewer } from "@/api/update";
import { fetchGenerationsStatus } from "@/api/credits";
import {
  applyExtensionUpdate,
  finalizePendingNativeUpdate,
  hasPendingNativeUpdate,
} from "@/utils/extension-update";
import { ensureFfmpeg } from "@/utils/ffmpeg";
import { preloadVoiceoverPreviews } from "@/api/voiceover";
import { openMarketUrl, resolvePackEntitlementContextForScan } from "@/api/cep-market";
import { version as LOCAL_VERSION } from "../../shared/shared";
import {
  readInstallablePackages,
  loadInstalledPack,
  packInitErrorMessage,
} from "@/lib/utils/pack";
import {
  PACKAGES_RESCAN_EVENT,
  scanAndRegisterPacksAtRoot,
} from "@/lib/utils/pack-install";
import {
  buildPackEntitlementContext,
  isPackEntitled,
} from "@/lib/utils/pack-entitlement";
import { readPrefSettings } from "@/lib/api/preferences";
import {
  activePackStorageKey,
  currentPackHost,
  LEGACY_ACTIVE_PACK_STORAGE_KEY,
  packMetaMatchesHost,
  type PackHostId,
} from "@/lib/utils/pack-host";
import {
  buildPackTree,
  collectAllContentSections,
  collectContentSections,
  filterContentSections,
  filterFavoriteSections,
  findPackTreeNode,
  getFirstPackRoot,
  type PackContentSection,
} from "@/lib/utils/pack-tree";
import type { InstalledPackMeta, PackSettings, PackTreeItem, PackTreeNode } from "@/lib/utils/pack-types";
import { revokePreviewObjectUrls } from "@/lib/utils/pack-preview";
import { cn } from "@/lib/utils";
import * as panelStore from "@/lib/userdata-store";
import { storageKey } from "@brands";
import { friendlyErrorMessage } from "@/utils/user-error";
import "./main.scss";

const CATEGORY_BY_PACK_KEY = storageKey("categoryByPack");
const GENERATIONS_STORAGE_KEY = storageKey("generations");

function hostActivePackKey(host: PackHostId | null = currentPackHost()): string | null {
  return host ? activePackStorageKey(host) : null;
}

function readActivePackPath(host: PackHostId | null = currentPackHost()): string | null {
  const key = hostActivePackKey(host);
  if (!key) return null;
  try {
    const scoped = panelStore.getItem(key);
    if (scoped) return scoped;
    // One-time migration from pre-split key: only if path is in this host's list.
    const legacy = panelStore.getItem(LEGACY_ACTIVE_PACK_STORAGE_KEY);
    if (!legacy || !host) return null;
    const match = readInstallablePackages(host).some((p) => p.path === legacy);
    if (!match) return null;
    panelStore.setItem(key, legacy);
    return legacy;
  } catch {
    return null;
  }
}

function writeActivePackPath(packPath: string, host: PackHostId | null = currentPackHost()) {
  const key = hostActivePackKey(host);
  if (!key || !packPath) return;
  try {
    panelStore.setItem(key, packPath);
  } catch {
    // ignore storage errors
  }
}

function loadCategoryByPack(): Record<string, string> {
  try {
    const raw = panelStore.getItem(CATEGORY_BY_PACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [path, id] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id === "string" && id) out[path] = id;
    }
    return out;
  } catch {
    return {};
  }
}

function persistCategoryForPack(packPath: string, categoryId: string) {
  if (!packPath || !categoryId) return;
  try {
    const map = loadCategoryByPack();
    if (map[packPath] === categoryId) return;
    map[packPath] = categoryId;
    panelStore.setItem(CATEGORY_BY_PACK_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function resolveCategoryForPack(tree: PackTreeNode[], packPath: string): string {
  const saved = loadCategoryByPack()[packPath];
  if (saved && findPackTreeNode(tree, saved)) return saved;
  return getFirstPackRoot(tree)?.id ?? "";
}

type GenerationsState = {
  monthly: number;
  extra: number;
  monthKey: string;
  /** Allotment the stored monthly counter was capped against. */
  limit: number;
};

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

function loadGenerationsState(limit: number | null): GenerationsState {
  const monthKey = currentMonthKey();
  if (limit == null || limit <= 0) {
    return { monthly: 0, extra: 0, monthKey, limit: 0 };
  }
  const fallback: GenerationsState = {
    monthly: limit,
    extra: 0,
    monthKey,
    limit,
  };
  try {
    const raw = panelStore.getItem(GENERATIONS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GenerationsState>;
    if (parsed.monthKey !== fallback.monthKey) return fallback;
    const storedLimit = typeof parsed.limit === "number" ? parsed.limit : limit;
    let monthly = typeof parsed.monthly === "number" ? parsed.monthly : limit;
    // Tier changed (e.g. free → subscribed): top up to the new allotment.
    if (storedLimit !== limit) {
      monthly = Math.min(limit, Math.max(0, monthly + (limit - storedLimit)));
    }
    monthly = Math.max(0, Math.min(limit, monthly));
    return {
      monthly,
      extra: typeof parsed.extra === "number" ? parsed.extra : 0,
      monthKey: fallback.monthKey,
      limit,
    };
  } catch {
    return fallback;
  }
}

function saveGenerationsState(state: GenerationsState): void {
  try {
    panelStore.setItem(GENERATIONS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

function PurchaseGateBanner({ onOpenAccount }: { onOpenAccount: () => void }) {
  return (
    <div className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
      <Lock className="size-3.5 shrink-0" />
      <span className="flex-1">
        Free plan includes 1 free pack. Subscribe or buy a pack to unlock this content.
      </span>
      <button
        type="button"
        onClick={onOpenAccount}
        className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-1 font-medium text-amber-100 transition-colors hover:bg-amber-500/30"
      >
        Upgrade
      </button>
    </div>
  );
}

function FreePlanBanner({ onOpenAccount }: { onOpenAccount: () => void }) {
  const { generationLimit, freePackSlots } = useAuth();
  const packPart =
    freePackSlots != null
      ? `${freePackSlots} free pack${freePackSlots === 1 ? "" : "s"} (coming soon)`
      : "Free pack slot (coming soon)";
  const genPart =
    generationLimit != null ? `${generationLimit} AI generations` : "AI generations included";

  return (
    <div className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2 text-[11px] text-foreground">
      <span className="flex-1">
        Free plan: {packPart} · {genPart}
      </span>
      <button
        type="button"
        onClick={onOpenAccount}
        className="shrink-0 rounded-full bg-primary/20 px-2.5 py-1 font-medium text-primary transition-colors hover:bg-primary/30"
      >
        Upgrade
      </button>
    </div>
  );
}

function DownloadFloat() {
  const { jobs, cancel, activeCount } = useDownloadManager();
  const active = jobs.filter(
    (j) =>
      j.status === "queued" ||
      j.status === "downloading" ||
      j.status === "installing",
  );
  if (activeCount === 0 || active.length === 0) return null;
  const top = active[0];
  const pct = Math.max(0, Math.min(100, top.progress || (top.status === "queued" ? 0 : 8)));
  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const label =
    top.status === "queued"
      ? `Queued: ${top.pack.name}`
      : top.status === "installing"
        ? `Installing: ${top.pack.name}`
        : `Downloading: ${top.pack.name}`;

  return (
    <button
      type="button"
      title={`${label} — click to cancel`}
      aria-label={`${label}. Cancel`}
      onClick={() => cancel(top.id)}
      className="absolute bottom-3 right-3 z-40 flex size-11 items-center justify-center rounded-full border border-primary/40 bg-card/95 text-primary shadow-lg shadow-black/40 backdrop-blur transition hover:border-destructive/50 hover:text-destructive"
    >
      <svg className="absolute inset-0 size-full -rotate-90 p-0.5" viewBox="0 0 40 40" aria-hidden>
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="2.5"
        />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      {top.status === "queued" ? (
        <Loader2 className="relative size-4 animate-spin" />
      ) : (
        <span className="relative text-[9px] font-bold tabular-nums text-foreground">
          {Math.round(pct)}
        </span>
      )}
      {active.length > 1 ? (
        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
          {active.length}
        </span>
      ) : null}
    </button>
  );
}

function StatusToast({ onOpenMarket }: { onOpenMarket?: () => void }) {
  const { statusMessage, clearStatus } = usePanelUI();
  if (!statusMessage) return null;

  const card = statusMessage.card;
  if (card) {
    const img = card.imageUrl?.trim() || "";
    return (
      <div className="pointer-events-none absolute bottom-3 left-3 z-30 w-[min(100%-1.5rem,300px)]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-card via-card to-primary/20 shadow-2xl shadow-black/50 ring-1 ring-inset ring-white/10">
          <div className="flex gap-0">
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-3.5 pr-2">
              <div className="min-w-0">
                {card.subtitle ? (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {card.subtitle}
                  </p>
                ) : null}
                <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-foreground">
                  {card.title}
                </p>
              </div>
              <button
                type="button"
                className="pointer-events-auto inline-flex w-fit items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => {
                  if (card.detailsUrl) openMarketUrl(card.detailsUrl);
                  else onOpenMarket?.();
                  clearStatus();
                }}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <ArrowUpRight className="size-3" strokeWidth={2.5} />
                </span>
                Details
              </button>
            </div>
            <div className="relative w-[108px] shrink-0 self-stretch bg-black/30">
              {img ? (
                <img
                  src={img}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-primary/10" />
              )}
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-card/40" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role={statusMessage.tone === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-none absolute bottom-3 left-1/2 z-40 flex w-[min(100%-1.25rem,360px)] -translate-x-1/2 items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-medium leading-snug shadow-xl backdrop-blur-md",
        statusMessage.tone === "error"
          ? "border-rose-400/35 bg-[#1a1014]/95 text-rose-100"
          : statusMessage.tone === "success"
            ? "border-emerald-500/30 bg-emerald-950/90 text-emerald-100"
            : "border-white/10 bg-card/95 text-foreground",
      )}
    >
      {statusMessage.tone === "error" ? (
        <XCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
      ) : statusMessage.tone === "success" ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
      ) : null}
      <span className="min-w-0 flex-1 pt-px">{statusMessage.text}</span>
      <button
        type="button"
        aria-label="Dismiss"
        className="pointer-events-auto mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white"
        onClick={clearStatus}
      >
        <X className="size-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function EditingWorkspace({
  tree,
  category,
  setCategory,
  query,
  setQuery,
  tutorialsOpen,
  setTutorialsOpen,
  assetsPath,
  packFilePath,
  packSettings,
  packError,
  onOpenAccount,
}: {
  tree: PackTreeNode[];
  category: string;
  setCategory: (id: string) => void;
  query: string;
  setQuery: (q: string) => void;
  tutorialsOpen: boolean;
  setTutorialsOpen: (open: boolean) => void;
  assetsPath: string;
  packFilePath: string;
  packSettings: PackSettings | null;
  packError: string | null;
  onOpenAccount: () => void;
}) {
  const { showFavoritesOnly, favoriteIds, focusMode } = usePanelUI();
  const { signedIn, subscription, market, isFreeUser } = useAuth();

  const entitlementCtx = useMemo(
    () =>
      buildPackEntitlementContext({
        signedIn,
        subscriptionActive: subscription.subscribed,
        purchases: subscription.purchases,
        catalog: market?.Packages ?? [],
      }),
    [signedIn, subscription.subscribed, subscription.purchases, market?.Packages],
  );

  const activePackMeta = useMemo((): InstalledPackMeta | null => {
    if (!packSettings?.main.name || !packFilePath) return null;
    return {
      name: packSettings.main.name,
      author: packSettings.main.cc_author_username || "Unknown",
      version: packSettings.main.version || "1.0",
      path: packFilePath,
      appID: packSettings.main.software_id,
      appVersion: packSettings.main.software_version,
    };
  }, [packSettings, packFilePath]);

  const canApply = useMemo(
    () => activePackMeta != null && isPackEntitled(activePackMeta, entitlementCtx),
    [activePackMeta, entitlementCtx],
  );
  const packRequiresPurchase = !!packSettings?.main.required_purchase_code;

  const sections: PackContentSection[] = useMemo(() => {
    if (!tree.length) return [];

    const hasQuery = query.trim().length > 0;

    if (showFavoritesOnly) {
      return filterContentSections(
        filterFavoriteSections(collectAllContentSections(tree), favoriteIds),
        query,
      );
    }

    // Global search across the whole pack, independent of sidebar selection.
    if (hasQuery) {
      return filterContentSections(collectAllContentSections(tree), query);
    }

    const node = findPackTreeNode(tree, category) ?? getFirstPackRoot(tree);
    if (!node) return [];
    return filterContentSections(collectContentSections(node), "");
  }, [tree, category, query, showFavoritesOnly, favoriteIds]);

  // Subscribers / owned / purchased packs only — verified against market + /me.
  // When user isn't entitled to the pack, all items are locked.
  const isLocked = useCallback(
    (item: PackTreeItem) => !canApply,
    [canApply],
  );

  return (
    <>
      {!canApply && signedIn && packRequiresPurchase && (
        <PurchaseGateBanner onOpenAccount={onOpenAccount} />
      )}
      {signedIn && isFreeUser && !packRequiresPurchase && (
        <FreePlanBanner onOpenAccount={onOpenAccount} />
      )}
      <PanelToolbar
        tutorialsOpen={tutorialsOpen}
        onToggleTutorials={() => setTutorialsOpen(!tutorialsOpen)}
        query={query}
        onQuery={setQuery}
        packName={packSettings?.main.name}
      />
      <div className="flex min-h-0 flex-1">
        {tutorialsOpen ? (
          <div className="min-h-0 min-w-0 flex-1">
            <TutorialsPanel activePackName={packSettings?.main.name ?? ""} />
          </div>
        ) : (
          <>
        {!focusMode && (
          <PanelSidebar
            tree={tree}
            active={category}
            onSelect={setCategory}
          />
        )}
        {packError ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            {packError}
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-2.5">
            <FootageGrid
              sections={sections}
              assetsPath={assetsPath}
              packFilePath={packFilePath}
              settings={packSettings}
              isLocked={isLocked}
            />
          </div>
        )}
          </>
        )}
      </div>
      <PanelFooter />
    </>
  );
}

function AppShell() {
  const { signedIn, authReady, generationLimit, isFreeUser, refreshMarket, subscription } =
    useAuth();
  const { setShowFavoritesOnly, showStatus } = usePanelUI();
  const { onExtensionUpdateHint } = useNotifications();
  const [nav, setNav] = useState(() =>
    readInstallablePackages().length === 0 ? "market" : "editing",
  );
  const [prevNav, setPrevNav] = useState<string | null>(null);
  const [tutorialsOpen, setTutorialsOpen] = useState(false);
  const [tree, setTree] = useState<PackTreeNode[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [packError, setPackError] = useState<string | null>(null);
  const [assetsPath, setAssetsPath] = useState("");
  const [packFilePath, setPackFilePath] = useState("");
  const [packSettings, setPackSettings] = useState<PackSettings | null>(null);
  const [hasInstalledPacks, setHasInstalledPacks] = useState(
    () => readInstallablePackages().length > 0,
  );
  const [hasUserNavigated, setHasUserNavigated] = useState(false);
  const [monthlyGens, setMonthlyGens] = useState(0);
  const [extraGens, setExtraGens] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateZxpUrl, setUpdateZxpUrl] = useState<string | null>(null);
  const [updateChangelog, setUpdateChangelog] = useState("");
  const [updateChannel, setUpdateChannel] = useState<"stable" | "beta">("stable");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<string | undefined>();
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [hasPendingNatives, setHasPendingNatives] = useState(false);

  const applyPack = useCallback((meta: InstalledPackMeta) => {
    revokePreviewObjectUrls();
    loadInstalledPack(meta)
      .then((loaded) => {
        const nextTree = buildPackTree(loaded.pack.structure);
        setTree(nextTree);
        setAssetsPath(loaded.assetsPath);
        setPackFilePath(loaded.meta.path);
        setPackSettings(loaded.pack.settings);
        setCategory(resolveCategoryForPack(nextTree, loaded.meta.path));
        setPackError(null);
        writeActivePackPath(loaded.meta.path);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setPackError(packInitErrorMessage(message));
      });
  }, [showStatus]);

  useEffect(() => {
    if (!packFilePath || !category) return;
    persistCategoryForPack(packFilePath, category);
  }, [packFilePath, category]);

  const reloadPackList = useCallback(async () => {
    const custom = (readPrefSettings().absCustomAbsolutePath || "").trim();
    if (custom) {
      const entitlement = signedIn
        ? await resolvePackEntitlementContextForScan({
            signedIn: true,
            purchases: subscription.purchases,
          })
        : null;
      scanAndRegisterPacksAtRoot(custom, entitlement);
    }

    const installed = readInstallablePackages();
    setHasInstalledPacks(installed.length > 0);
    if (installed.length === 0) {
      setPackError("No installed pack found");
      setPackFilePath("");
      setTree([]);
      setPackSettings(null);
      setAssetsPath("");
      setCategory("");
      setNav("market");
      return;
    }

    const preferredPath = readActivePackPath();
    const preferred = preferredPath
      ? installed.find((p) => p.path === preferredPath)
      : undefined;
    applyPack(preferred ?? installed[0]);
  }, [applyPack, signedIn, subscription.purchases]);

  useEffect(() => {
    void reloadPackList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authReady) return;
    void reloadPackList();
  }, [authReady, signedIn, subscription.purchases, reloadPackList]);

  useEffect(() => {
    const onRescan = () => {
      void reloadPackList();
    };
    window.addEventListener(PACKAGES_RESCAN_EVENT, onRescan);
    return () => window.removeEventListener(PACKAGES_RESCAN_EVENT, onRescan);
  }, [reloadPackList]);

  // G-04: Auto-switch to Editing when packs become available and user hasn't navigated.
  // On first paint host may be null → readInstallablePackages returns []. Once host
  // environment is ready and packs are found, land on Editing rather than Market.
  useEffect(() => {
    if (hasInstalledPacks && nav === "market" && !hasUserNavigated && !settingsOpen) {
      setNav("editing");
    }
  }, [hasInstalledPacks, nav, hasUserNavigated, settingsOpen]);

  // Prefetch market catalog once signed in (Market tab / notifications).
  useEffect(() => {
    if (!authReady || !signedIn) return;
    void refreshMarket();
  }, [authReady, signedIn, refreshMarket]);

  // Download voice samples locally so Voiceover playback isn't gated on the network.
  useEffect(() => {
    if (!authReady || !signedIn) return;
    void preloadVoiceoverPreviews();
  }, [authReady, signedIn]);

  // Prefetch ffmpeg after the shell is up so unzip/download cannot freeze Loading.
  useEffect(() => {
    if (!authReady) return;
    const timer = window.setTimeout(() => {
      ensureFfmpeg().catch((err) => {
        console.warn(
          "[spunkram] ffmpeg download failed:",
          err instanceof Error ? err.message : err,
        );
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [authReady]);

  // Promote Motionflow.dll (etc.) written as *.pending-update while host held the lock.
  useEffect(() => {
    try {
      const { remaining } = finalizePendingNativeUpdate();
      setHasPendingNatives(remaining.length > 0);
      if (remaining.length > 0) {
        showStatus(
          "Restart Premiere Pro / After Effects to finish the native plugin update.",
          "info",
          12000,
        );
      }
    } catch (err) {
      console.warn(
        "[spunkram] pending native finalize failed:",
        err instanceof Error ? err.message : err,
      );
      // Check if there are still pending updates even after error
      setHasPendingNatives(hasPendingNativeUpdate());
    }
  }, [showStatus]);

  // Re-check after sign-in so beta testers get beta.json (Bearer required).
  useEffect(() => {
    if (!authReady || !signedIn) return;
    let cancelled = false;
    fetchUpdateInfo().then((info) => {
      if (cancelled || !info?.version || !info.zxpUrl) return;
      if (!isRemoteNewer(LOCAL_VERSION, info.version)) {
        setUpdateVersion(null);
        setUpdateZxpUrl(null);
        setUpdateChangelog("");
        setUpdateChannel("stable");
        return;
      }
      setUpdateVersion(info.version);
      setUpdateZxpUrl(info.zxpUrl);
      setUpdateChangelog(typeof info.changelog === "string" ? info.changelog : "");
      setUpdateChannel(info.channel === "beta" ? "beta" : "stable");
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, signedIn]);

  // WSS wake-up when a new ZXP is uploaded — re-check /api/cep/update (beta gate).
  useEffect(() => {
    if (!authReady || !signedIn) return;
    return onExtensionUpdateHint(() => {
      void fetchUpdateInfo().then((info) => {
        if (!info?.version || !info.zxpUrl) return;
        if (!isRemoteNewer(LOCAL_VERSION, info.version)) return;
        setUpdateVersion(info.version);
        setUpdateZxpUrl(info.zxpUrl);
        setUpdateChangelog(typeof info.changelog === "string" ? info.changelog : "");
        setUpdateChannel(info.channel === "beta" ? "beta" : "stable");
        showStatus(`Update available: v${info.version}`, "info", 8000);
      });
    });
  }, [authReady, signedIn, onExtensionUpdateHint, showStatus]);

  const handleApplyUpdate = useCallback(async () => {
    if (!updateZxpUrl || !updateVersion || updateBusy) return;
    setUpdateBusy(true);
    setUpdateError(null);
    setUpdateProgress(`Downloading v${updateVersion}…`);
    try {
      const result = await applyExtensionUpdate(updateZxpUrl, (p) => {
        if (p.phase === "download") {
          if (p.totalBytes && p.totalBytes > 0) {
            const pct = Math.min(99, Math.round((p.bytesReceived / p.totalBytes) * 100));
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
      });
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

  useEffect(() => {
    const hex = packSettings?.inside_option_sets?.header_color_hex;
    const root = document.documentElement;
    const match = typeof hex === "string" ? hex.match(/^#?([0-9a-f]{6})$/i) : null;
    if (match) {
      const value = match[1];
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      root.style.setProperty("--primary", `${r}, ${g}, ${b}`);
    } else {
      root.style.removeProperty("--primary");
    }
    return () => {
      root.style.removeProperty("--primary");
    };
  }, [packSettings]);

  useEffect(() => {
    if (generationLimit == null) return;
    const next = loadGenerationsState(generationLimit);
    setMonthlyGens(next.monthly);
    setExtraGens(next.extra);
  }, [generationLimit]);

  useEffect(() => {
    if (generationLimit == null) return;
    saveGenerationsState({
      monthly: monthlyGens,
      extra: extraGens,
      monthKey: currentMonthKey(),
      limit: generationLimit,
    });
  }, [monthlyGens, extraGens, generationLimit]);

  /** Server (`user_generations`) is source of truth — userdata store is cache only. */
  const refreshGenerationsFromServer = useCallback(async () => {
    const status = await fetchGenerationsStatus();
    if (!status?.authenticated) return;
    const monthly =
      typeof status.subscription_generations_left === "number"
        ? status.subscription_generations_left
        : typeof status.remaining === "number"
          ? status.remaining
          : null;
    const extra =
      typeof status.extra_generations_left === "number"
        ? status.extra_generations_left
        : null;
    if (monthly !== null) setMonthlyGens(Math.max(0, monthly));
    if (extra !== null) setExtraGens(Math.max(0, extra));
  }, []);

  useEffect(() => {
    if (!authReady || !signedIn) return;
    void refreshGenerationsFromServer();
  }, [authReady, signedIn, generationLimit, refreshGenerationsFromServer]);

  const aiToolsProps = {
    monthly: monthlyGens,
    extra: extraGens,
    monthlyLimit: generationLimit,
    isFreeUser,
    onUse: () => {
      void refreshGenerationsFromServer();
    },
  };

  function handleNav(id: string) {
    if (id === "editing" && !hasInstalledPacks) return;
    setSettingsOpen(false);
    setNav(id);
    setHasUserNavigated(true);
    if (id === "editing") {
      setTutorialsOpen(false);
      setShowFavoritesOnly(false);
    }
  }

  function defaultWorkspaceNav(): string {
    return hasInstalledPacks ? "editing" : "market";
  }

  function openSettings() {
    setPrevNav(nav);
    setSettingsOpen(true);
    setNav("settings");
  }

  function openAccount() {
    setSettingsOpen(false);
    setNav("account");
  }

  if (!authReady) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="spunkram-shell flex h-full w-full flex-col overflow-hidden text-foreground">
        <div className="spunkram-shell__mesh" />
        <div className="spunkram-shell__grid" />
        <div className="spunkram-shell__content">
          <LoginScreen />
        </div>
      </div>
    );
  }

  const showUpdateBanner = Boolean(updateVersion && updateZxpUrl);

  return (
    <div className="spunkram-shell flex h-full w-full flex-col overflow-hidden text-foreground">
      <div className="spunkram-shell__mesh" />
      <div className="spunkram-shell__grid" />
      <div className="spunkram-shell__content">
      <PanelHeader
        active={settingsOpen ? "settings" : nav}
        onSelect={handleNav}
        onOpenAccount={openAccount}
        onOpenSettings={openSettings}
        editingDisabled={!hasInstalledPacks}
      />

      {showUpdateBanner && updateVersion ? (
        <UpdateBanner
          version={updateVersion}
          localVersion={LOCAL_VERSION}
          changelog={updateChangelog}
          channel={updateChannel}
          busy={updateBusy}
          progressLabel={updateProgress}
          error={updateError}
          onUpdate={handleApplyUpdate}
        />
      ) : null}

      {hasPendingNatives && !showUpdateBanner && (
        <div className="mx-2.5 mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
          <span className="flex-1">
            Native plugin update pending. Restart the host application to complete.
          </span>
        </div>
      )}

      <DownloadFloat />

      {settingsOpen || nav === "settings" ? (
        <section className="min-h-0 flex-1 overflow-hidden">
          <SettingsPanel
            onBack={() => {
              setSettingsOpen(false);
              setNav(prevNav || defaultWorkspaceNav());
              setPrevNav(null);
            }}
          />
        </section>
      ) : nav === "account" ? (
        <section className="min-h-0 flex-1 overflow-hidden">
          <AccountPanel onBack={() => setNav(defaultWorkspaceNav())} />
        </section>
      ) : nav === "market" ? (
        <section className="min-h-0 flex-1 overflow-hidden">
          <MarketPanel
            onOpenLogin={openAccount}
            onPacksChanged={reloadPackList}
            activePackPath={packFilePath}
            onSelectPack={(meta) => {
              const host = currentPackHost();
              if (host && !packMetaMatchesHost(meta, host)) return;
              applyPack(meta);
              // Stay on current nav so background "Use when ready" doesn't yank the user.
            }}
          />
        </section>
      ) : nav === "ai-tools" ? (
        <section className="min-h-0 flex-1 overflow-hidden">
          <AiToolsPanel {...aiToolsProps} />
        </section>
      ) : nav === "footages" ? (
        <section className="min-h-0 flex-1 overflow-hidden">
          <FootagesPanel />
        </section>
      ) : (
        <EditingWorkspace
          tree={tree}
          category={category}
          setCategory={setCategory}
          query={query}
          setQuery={setQuery}
          tutorialsOpen={tutorialsOpen}
          setTutorialsOpen={setTutorialsOpen}
          assetsPath={assetsPath}
          packFilePath={packFilePath}
          packSettings={packSettings}
          packError={packError}
          onOpenAccount={openAccount}
        />
      )}

      <StatusToast
        onOpenMarket={() => {
          setSettingsOpen(false);
          setNav("market");
        }}
      />
      </div>
    </div>
  );
}

export const App = () => {
  return (
    <AuthProvider>
      <PanelUIProvider>
        <NotificationsProvider>
          <PackagesPathGateProvider>
            <DownloadManagerProvider>
              <AppShell />
            </DownloadManagerProvider>
          </PackagesPathGateProvider>
        </NotificationsProvider>
      </PanelUIProvider>
    </AuthProvider>
  );
};
