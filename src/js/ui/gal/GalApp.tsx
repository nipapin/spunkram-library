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
import { BRAND } from "@brands";
import {
  GalAccountZone,
  type GalAccountTab,
} from "./GalAccountZone";
import { GalProfileMenu } from "./GalProfileMenu";
import { GalEffectsWorkspace } from "./GalEffectsWorkspace";
import { GalScriptsPanel } from "./scripts/GalScriptsPanel";
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

function AssetsSyncOverlay({
  ready,
  sync,
  structureLoading,
  onRetry,
}: {
  ready: boolean;
  sync: {
    phase: string;
    total: number;
    done: number;
    current?: string;
    error?: string;
  } | null;
  structureLoading: boolean;
  onRetry: () => void;
}) {
  if (ready) return null;

  const phase = sync?.phase;
  const isError = phase === "error";
  const total = sync?.total ?? 0;
  const done = sync?.done ?? 0;
  const pct =
    total > 0
      ? Math.max(0, Math.min(100, Math.round((done / total) * 100)))
      : phase === "checking" || structureLoading || !sync
        ? 8
        : 0;

  const title = isError
    ? "Couldn’t download media assets"
    : phase === "downloading"
      ? "Downloading media assets"
      : "Preparing media assets";

  const detail = isError
    ? sync?.error === "NO_OFFLINE_ASSETS"
      ? "The server returned no offline media for this host."
      : sync?.error === "UNAUTHORIZED"
        ? "Session expired — sign in again, then retry."
        : sync?.error || "Something went wrong while syncing."
    : phase === "downloading" && total > 0
      ? `${done} of ${total} files`
      : "Needed once so Premiere can relink project footage.";

  const fileHint =
    !isError && sync?.current
      ? sync.current.replace(/^Projects\/_Assets\//, "").split("/").pop()
      : null;

  return (
    <div
      className="gal-assets-gate"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="gal-assets-gate-title"
      aria-busy={!isError}
    >
      <div className="gal-assets-gate__card">
        <img
          className="gal-assets-gate__logo"
          src={logo}
          alt=""
          draggable={false}
        />
        <h2 id="gal-assets-gate-title" className="gal-assets-gate__title">
          {title}
        </h2>
        <p className="gal-assets-gate__detail">{detail}</p>
        {fileHint ? (
          <p className="gal-assets-gate__file" title={sync?.current}>
            {fileHint}
          </p>
        ) : null}

        {!isError ? (
          <div
            className="gal-assets-gate__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className="gal-assets-gate__bar-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        <p className="gal-assets-gate__pct">
          {isError ? "Download incomplete" : phase === "downloading" ? `${pct}%` : "Please wait…"}
        </p>

        {isError ? (
          <button
            type="button"
            className="gal-assets-gate__retry"
            onClick={onRetry}
          >
            Retry download
          </button>
        ) : (
          <p className="gal-assets-gate__hint">
            Effects stay locked until media finishes downloading.
          </p>
        )}
      </div>
    </div>
  );
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
  const shellRef = useRef<HTMLDivElement>(null);
  const workspace = usePackWorkspace();
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

  if (!authReady) {
    return (
      <div className="gal-shell gal-shell--boot">
        <img className="gal-toolbar__logo" src={logo} alt="" />
        <p>Starting {BRAND.panelDisplayName}…</p>
      </div>
    );
  }

  if (!signedIn) return <LoginScreen />;

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
      <AssetsSyncOverlay
        ready={workspace.galAssetsReady}
        sync={workspace.galAssetsSync}
        structureLoading={workspace.structureLoading}
        onRetry={() => workspace.retryGalAssetsSync()}
      />
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
