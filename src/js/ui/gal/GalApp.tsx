import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LoginScreen } from "@/components/login-screen";
import { UpdateBanner } from "@/components/update-banner";
import { PanelUIProvider, usePanelUI } from "@/lib/panel-ui-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import {
  DownloadManagerProvider,
  useDownloadManager,
} from "@/lib/download-manager-context";
import { PackagesPathGateProvider } from "@/lib/packages-path-gate";
import { useExtensionUpdate } from "@/lib/use-extension-update";
import { FootagesPanel } from "@/footages";
import { usePackWorkspace } from "@/lib/use-pack-workspace";
import { asBool, readPrefSettings } from "@/lib/api/preferences";
import { cn } from "@/lib/utils";
import {
  GalAccountZone,
  type GalAccountTab,
} from "./GalAccountZone";
import { GalProfileMenu } from "./GalProfileMenu";
import { GalEffectsWorkspace } from "./GalEffectsWorkspace";
import { GalBootScreen } from "./GalBootScreen";
import { GalScriptsPanel } from "./scripts/GalScriptsPanel";
import {
  collectPosterPathsForPreload,
  holdPosterWarmup,
  posterWarmupIdentity,
  preloadPosters,
} from "@/lib/utils/preview-preload";
import logo from "./assets/logo.png";
import tabEffects from "./assets/tab-effects.png";
import tabStock from "./assets/tab-stock.png";
import tabScripts from "./assets/tab-scripts.png";
import "./gal-panel.scss";

type GalNav = "effects" | "stock" | "scripts";
type GalOverlay = GalAccountTab | null;

const NAV: { id: GalNav; label: string; icon: string }[] = [
  { id: "effects", label: "Effects", icon: tabEffects },
  { id: "stock", label: "Stock", icon: tabStock },
  { id: "scripts", label: "Scripts", icon: tabScripts },
];

function DownloadFloat() {
  const { jobs, cancel, activeCount } = useDownloadManager();
  const active = jobs.filter(
    (j) =>
      j.status === "queued" ||
      j.status === "downloading" ||
      j.status === "installing",
  );

  if (!activeCount || active.length === 0) return null;

  const top = active[0];
  const pct = Math.max(
    0,
    Math.min(100, top.progress || (top.status === "queued" ? 0 : 8)),
  );
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
      className="gal-download-float"
    >
      <svg className="gal-download-float__ring" viewBox="0 0 40 40" aria-hidden>
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
        />
      </svg>
      {top.status === "queued" ? (
        <Loader2 className="gal-download-float__spin size-4 animate-spin" />
      ) : (
        <span className="gal-download-float__pct">{Math.round(pct)}</span>
      )}
    </button>
  );
}

function galBootErrorMessage(code?: string): string {
  if (code === "NO_OFFLINE_ASSETS") {
    return "Required files are missing. Try again.";
  }
  if (code === "UNAUTHORIZED") {
    return "Session expired — sign in again, then retry.";
  }
  if (code === "NO_INSTALL_ROOT") {
    return "Could not resolve a download folder.";
  }
  return code || "Something went wrong while starting. Try again.";
}

function computeGalBootPercent(args: {
  authReady: boolean;
  catalogReady: boolean;
  waitForAssets: boolean;
  assetsFrac: number;
  previewFrac: number;
}): number {
  if (!args.authReady) return 6;
  let pct = 10;
  pct += args.catalogReady ? 25 : 6;
  if (args.waitForAssets) {
    pct += Math.round(20 * Math.max(0, Math.min(1, args.assetsFrac)));
  } else {
    pct += 20;
  }
  pct += Math.round(44 * Math.max(0, Math.min(1, args.previewFrac)));
  return Math.max(4, Math.min(98, pct));
}

function GalStatusToast() {
  const { statusMessage } = usePanelUI();
  if (!statusMessage) return null;
  return (
    <div
      role={statusMessage.tone === "error" ? "alert" : "status"}
      className={cn(
        "gal-status-toast",
        statusMessage.tone === "error" && "gal-status-toast--error",
        statusMessage.tone === "success" && "gal-status-toast--success",
      )}
    >
      {statusMessage.tone === "error" ? (
        <XCircle className="size-3.5 shrink-0" aria-hidden />
      ) : statusMessage.tone === "success" ? (
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
      )}
      <span>{statusMessage.text}</span>
    </div>
  );
}

function GalShell() {
  const { authReady, signedIn } = useAuth();
  const { setShowFavoritesOnly } = usePanelUI();
  const [nav, setNav] = useState<GalNav>("effects");
  const [overlay, setOverlay] = useState<GalOverlay>(null);
  const [compactTabs, setCompactTabs] = useState(false);
  const [previewFrac, setPreviewFrac] = useState(0);
  const [previewDone, setPreviewDone] = useState(false);
  const [bootPct, setBootPct] = useState(4);
  const shellRef = useRef<HTMLDivElement>(null);
  const bootPctRef = useRef(4);
  const uiReadyRef = useRef(false);
  const sectionsRef = useRef<ReturnType<typeof usePackWorkspace>["sections"]>(
    [],
  );
  const workspace = usePackWorkspace();
  sectionsRef.current = workspace.sections;
  const {
    localVersion,
    updateVersion,
    updateChangelog,
    updateChannel,
    updateBusy,
    updateProgress,
    updateError,
    hasPendingNatives,
    showUpdateBanner,
    handleApplyUpdate,
  } = useExtensionUpdate();

  useEffect(() => {
    const useSystem = asBool(readPrefSettings().useSystemFonts);
    document.documentElement.dataset.galFonts = useSystem ? "system" : "inter";
  }, []);

  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      setCompactTabs(el.clientWidth < 400);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [authReady, signedIn]);

  const onSelectNav = useCallback(
    (id: GalNav) => {
      setOverlay(null);
      setNav(id);
      if (id !== "effects") setShowFavoritesOnly(false);
    },
    [setShowFavoritesOnly],
  );

  const catalogReady = !workspace.structureLoading;
  const waitForAssets = signedIn && !workspace.galAssetsReady;
  const assetsError =
    workspace.galAssetsSync?.phase === "error"
      ? galBootErrorMessage(workspace.galAssetsSync.error)
      : null;
  const assetsFrac =
    !waitForAssets
      ? 1
      : workspace.galAssetsSync && workspace.galAssetsSync.total > 0
        ? workspace.galAssetsSync.done / workspace.galAssetsSync.total
        : workspace.galAssetsSync?.phase === "checking"
          ? 0.12
          : 0.04;
  const bootReady =
    signedIn &&
    catalogReady &&
    !waitForAssets &&
    previewDone &&
    !assetsError;

  useEffect(() => {
    if (!authReady || !signedIn) {
      uiReadyRef.current = false;
      bootPctRef.current = 4;
      setBootPct(4);
      setPreviewDone(false);
      setPreviewFrac(0);
    }
  }, [authReady, signedIn]);

  useEffect(() => {
    if (bootReady) uiReadyRef.current = true;
  }, [bootReady]);

  useEffect(() => {
    if (uiReadyRef.current) return;
    const next = computeGalBootPercent({
      authReady,
      catalogReady: catalogReady && signedIn,
      waitForAssets,
      assetsFrac,
      previewFrac,
    });
    const clipped = Math.max(bootPctRef.current, next);
    bootPctRef.current = clipped;
    setBootPct(clipped);
  }, [
    authReady,
    signedIn,
    catalogReady,
    waitForAssets,
    assetsFrac,
    previewFrac,
  ]);

  useEffect(() => {
    if (!authReady || !signedIn || uiReadyRef.current) return;
    if (workspace.structureLoading) return;
    if (workspace.tree.length > 0 && !workspace.activeRootId) return;

    const rootId = workspace.activeRootId || "all";
    const identity = posterWarmupIdentity(
      rootId,
      workspace.assetsPath,
      workspace.assetsBaseUrl || "",
    );
    const paths = collectPosterPathsForPreload(sectionsRef.current, {
      assetsPath: workspace.assetsPath,
      assetsBaseUrl: workspace.assetsBaseUrl,
      assetsHost: workspace.assetsHost,
      settings: workspace.packSettings,
    });

    const signal = { cancelled: false };
    setPreviewDone(false);
    setPreviewFrac(paths.length === 0 ? 1 : 0);

    void preloadPosters(
      paths,
      (done, total) => {
        if (signal.cancelled) return;
        setPreviewFrac(total > 0 ? done / total : 1);
      },
      signal,
    ).then((cleanup) => {
      if (signal.cancelled) {
        cleanup();
        return;
      }
      holdPosterWarmup(identity, cleanup);
      setPreviewFrac(1);
      setPreviewDone(true);
    });

    return () => {
      signal.cancelled = true;
    };
  }, [
    authReady,
    signedIn,
    workspace.structureLoading,
    workspace.tree.length,
    workspace.activeRootId,
    workspace.assetsPath,
    workspace.assetsBaseUrl,
    workspace.assetsHost,
    workspace.packSettings,
  ]);

  if (!authReady || (signedIn && !bootReady && !assetsError)) {
    return <GalBootScreen percent={bootPct} />;
  }

  if (!signedIn) return <LoginScreen />;

  if (assetsError && !workspace.galAssetsReady) {
    return (
      <GalBootScreen
        percent={bootPct}
        error={assetsError}
        onRetry={() => workspace.retryGalAssetsSync()}
      />
    );
  }

  return (
    <div className="gal-shell" ref={shellRef}>
      {!overlay ? (
        <header className="gal-toolbar">
          <button
            type="button"
            className="gal-toolbar__brand"
            onClick={() => setOverlay("settings")}
            aria-label="Open settings"
          >
            <img
              className="gal-toolbar__logo"
              src={logo}
              alt=""
              draggable={false}
            />
            <span className="gal-toolbar__version" title={`Panel v${localVersion}`}>
              v{localVersion}
            </span>
          </button>
          <div
            className={compactTabs ? "gal-pills is-compact" : "gal-pills"}
            role="tablist"
            aria-label="Gal"
          >
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={nav === item.id}
                aria-label={item.label}
                title={item.label}
                className={nav === item.id ? "is-active" : undefined}
                onClick={() => onSelectNav(item.id)}
              >
                <img
                  className="gal-pills__icon"
                  src={item.icon}
                  alt=""
                  width={16}
                  height={16}
                  draggable={false}
                />
                <span className="gal-pills__label">{item.label}</span>
              </button>
            ))}
          </div>
          <GalProfileMenu
            onOpenProfile={() => setOverlay("profile")}
            onOpenSettings={() => setOverlay("settings")}
          />
        </header>
      ) : null}

      {showUpdateBanner && updateVersion ? (
        <div className="gal-update-banner">
          <UpdateBanner
            version={updateVersion}
            localVersion={localVersion}
            changelog={updateChangelog}
            channel={updateChannel}
            busy={updateBusy}
            progressLabel={updateProgress}
            error={updateError}
            onUpdate={handleApplyUpdate}
          />
        </div>
      ) : null}

      {hasPendingNatives && !showUpdateBanner ? (
        <div className="gal-native-pending" role="status">
          Native plugin update pending. Restart Premiere Pro / After Effects to
          complete.
        </div>
      ) : null}

      <div className="gal-shell__body">
        {overlay ? (
          <GalAccountZone
            tab={overlay}
            onTabChange={setOverlay}
            onClose={() => setOverlay(null)}
            onPackReady={(meta) => {
              workspace.applyPack(meta);
            }}
          />
        ) : nav === "effects" ? (
          <GalEffectsWorkspace workspace={workspace} />
        ) : nav === "stock" ? (
          <div className="gal-stock">
            <FootagesPanel />
          </div>
        ) : (
          <GalScriptsPanel />
        )}
      </div>

      <DownloadFloat />
      <GalStatusToast />
    </div>
  );
}

export function GalApp() {
  return (
    <AuthProvider>
      <PanelUIProvider>
        <NotificationsProvider>
          <PackagesPathGateProvider>
            <DownloadManagerProvider>
              <GalShell />
            </DownloadManagerProvider>
          </PackagesPathGateProvider>
        </NotificationsProvider>
      </PanelUIProvider>
    </AuthProvider>
  );
}
