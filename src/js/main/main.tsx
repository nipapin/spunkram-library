import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lock, XCircle } from "lucide-react";
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
import { fetchUpdateInfo, isRemoteNewer } from "@/api/update";
import { fetchGenerationsStatus } from "@/api/credits";
import { applyExtensionUpdate } from "@/utils/extension-update";
import { ensureFfmpeg } from "@/utils/ffmpeg";
import { version as LOCAL_VERSION } from "../../shared/shared";
import {
  loadInstalledPack,
  packInitErrorMessage,
  readInstallablePackages,
} from "@/lib/utils/pack";
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
import {
  generationLimitForTier,
  SPUNKRAM_FREE_TIER,
  SPUNKRAM_SUBSCRIBED_TIER,
} from "@/lib/config/entitlements";
import "./main.scss";

const ACTIVE_PACK_STORAGE_KEY = "spunkram.activePackPath";
const CATEGORY_BY_PACK_KEY = "spunkram.categoryByPack";
const GENERATIONS_STORAGE_KEY = "spunkram.generations";

function loadCategoryByPack(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CATEGORY_BY_PACK_KEY);
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
    localStorage.setItem(CATEGORY_BY_PACK_KEY, JSON.stringify(map));
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

function loadGenerationsState(limit: number): GenerationsState {
  const fallback: GenerationsState = {
    monthly: limit,
    extra: 0,
    monthKey: currentMonthKey(),
    limit,
  };
  try {
    const raw = localStorage.getItem(GENERATIONS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GenerationsState>;
    if (parsed.monthKey !== fallback.monthKey) return fallback;
    const storedLimit =
      typeof parsed.limit === "number" ? parsed.limit : SPUNKRAM_SUBSCRIBED_TIER.generations;
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
    localStorage.setItem(GENERATIONS_STORAGE_KEY, JSON.stringify(state));
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
  return (
    <div className="mx-2.5 mt-2.5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2 text-[11px] text-foreground">
      <span className="flex-1">
        Free plan: {SPUNKRAM_FREE_TIER.freePackCount} free pack (coming soon) ·{" "}
        {SPUNKRAM_FREE_TIER.generations} AI generations
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

function StatusToast() {
  const { statusMessage } = usePanelUI();
  if (!statusMessage) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-2.5 bottom-14 z-30 flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium shadow-lg backdrop-blur",
        statusMessage.tone === "error"
          ? "border-destructive/40 bg-destructive/15 text-destructive-foreground"
          : statusMessage.tone === "success"
            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
            : "border-white/10 bg-card/90 text-foreground",
      )}
    >
      {statusMessage.tone === "error" ? (
        <XCircle className="size-3.5 shrink-0" />
      ) : statusMessage.tone === "success" ? (
        <CheckCircle2 className="size-3.5 shrink-0" />
      ) : null}
      <span className="min-w-0 flex-1">{statusMessage.text}</span>
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
  const { accessTier, isFreeUser } = useAuth();

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

  // Subscribers unlock everything; purchasers unlock paid content they own.
  // Free users may use non–purchase-gated packs (the dedicated free pack ships later).
  const unlocked = accessTier === "subscribed" || accessTier === "purchased";
  const packRequiresPurchase = !!packSettings?.main.required_purchase_code;
  const freePackUnlocked = isFreeUser && !packRequiresPurchase;
  const canApply = unlocked || freePackUnlocked;
  const isLocked = useCallback(
    (item: PackTreeItem) => !canApply && (packRequiresPurchase || !!item.group.premium),
    [canApply, packRequiresPurchase],
  );

  return (
    <>
      {isFreeUser && <FreePlanBanner onOpenAccount={onOpenAccount} />}
      {packRequiresPurchase && !unlocked && (
        <PurchaseGateBanner onOpenAccount={onOpenAccount} />
      )}
      <PanelToolbar
        tutorialsOpen={tutorialsOpen}
        onToggleTutorials={() => setTutorialsOpen(!tutorialsOpen)}
        query={query}
        onQuery={setQuery}
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
            packName={packSettings?.main.name}
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
  const { signedIn, authReady, generationLimit, isFreeUser } = useAuth();
  const { setShowFavoritesOnly } = usePanelUI();
  const [nav, setNav] = useState("editing");
  const [tutorialsOpen, setTutorialsOpen] = useState(false);
  const [tree, setTree] = useState<PackTreeNode[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [packError, setPackError] = useState<string | null>(null);
  const [assetsPath, setAssetsPath] = useState("");
  const [packFilePath, setPackFilePath] = useState("");
  const [packSettings, setPackSettings] = useState<PackSettings | null>(null);
  const [monthlyGens, setMonthlyGens] = useState(() =>
    loadGenerationsState(generationLimitForTier("free")).monthly,
  );
  const [extraGens, setExtraGens] = useState(() =>
    loadGenerationsState(generationLimitForTier("free")).extra,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateZxpUrl, setUpdateZxpUrl] = useState<string | null>(null);
  const [updateChangelog, setUpdateChangelog] = useState("");
  const [updateChannel, setUpdateChannel] = useState<"stable" | "beta">("stable");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<string | undefined>();
  const [updateError, setUpdateError] = useState<string | null>(null);

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
        try {
          localStorage.setItem(ACTIVE_PACK_STORAGE_KEY, loaded.meta.path);
        } catch {
          // ignore storage errors
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setPackError(packInitErrorMessage(message));
      });
  }, []);

  useEffect(() => {
    if (!packFilePath || !category) return;
    persistCategoryForPack(packFilePath, category);
  }, [packFilePath, category]);

  const reloadPackList = useCallback(() => {
    const installed = readInstallablePackages();
    if (installed.length === 0) {
      setPackError("No installed pack found");
      setPackFilePath("");
      return;
    }

    let preferredPath: string | null = null;
    try {
      preferredPath = localStorage.getItem(ACTIVE_PACK_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    const preferred = installed.find((p) => p.path === preferredPath);
    applyPack(preferred ?? installed[0]);
  }, [applyPack]);

  useEffect(() => {
    reloadPackList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefetch ffmpeg into userdata on panel start (not on first Captions use).
  useEffect(() => {
    ensureFfmpeg().catch((err) => {
      console.warn(
        "[spunkram] ffmpeg download failed:",
        err instanceof Error ? err.message : err,
      );
    });
  }, []);

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

  const handleApplyUpdate = useCallback(async () => {
    if (!updateZxpUrl || !updateVersion || updateBusy) return;
    setUpdateBusy(true);
    setUpdateError(null);
    setUpdateProgress(`Downloading v${updateVersion}…`);
    try {
      await applyExtensionUpdate(updateZxpUrl, (p) => {
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
    } catch (err) {
      setUpdateBusy(false);
      setUpdateProgress(undefined);
      setUpdateError(err instanceof Error ? err.message : String(err));
    }
  }, [updateZxpUrl, updateVersion, updateBusy]);

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
    const next = loadGenerationsState(generationLimit);
    setMonthlyGens(next.monthly);
    setExtraGens(next.extra);
  }, [generationLimit]);

  useEffect(() => {
    saveGenerationsState({
      monthly: monthlyGens,
      extra: extraGens,
      monthKey: currentMonthKey(),
      limit: generationLimit,
    });
  }, [monthlyGens, extraGens, generationLimit]);

  /** Server (`user_generations`) is source of truth — localStorage is cache only. */
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
    setSettingsOpen(false);
    setNav(id);
    if (id === "editing") {
      setTutorialsOpen(false);
      setShowFavoritesOnly(false);
    }
  }

  function openSettings() {
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
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
        <LoginScreen />
      </div>
    );
  }

  const showUpdateBanner = Boolean(updateVersion && updateZxpUrl);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <PanelHeader
        active={settingsOpen ? "settings" : nav}
        onSelect={handleNav}
        onOpenAccount={openAccount}
        onOpenSettings={openSettings}
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

      {settingsOpen || nav === "settings" ? (
        <section className="min-h-0 flex-1 overflow-hidden">
          <SettingsPanel
            onBack={() => {
              setSettingsOpen(false);
              setNav((prev) => (prev === "settings" ? "editing" : prev));
            }}
          />
        </section>
      ) : nav === "account" ? (
        <section className="min-h-0 flex-1 overflow-hidden">
          <AccountPanel onBack={() => setNav("editing")} />
        </section>
      ) : nav === "market" ? (
        <section className="min-h-0 flex-1 overflow-hidden">
          <MarketPanel
            onBack={() => setNav("editing")}
            onOpenLogin={openAccount}
            onPacksChanged={reloadPackList}
            activePackPath={packFilePath}
            onSelectPack={(meta) => {
              applyPack(meta);
              setNav("editing");
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

      <StatusToast />
    </div>
  );
}

export const App = () => {
  return (
    <AuthProvider>
      <PanelUIProvider>
        <AppShell />
      </PanelUIProvider>
    </AuthProvider>
  );
};
