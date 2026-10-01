import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Loader2, Sparkles, User, X } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { PanelUIProvider, usePanelUI } from "@/lib/panel-ui-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { PackagesPathGateProvider } from "@/lib/packages-path-gate";
import {
  DownloadManagerProvider,
  useDownloadManager,
} from "@/lib/download-manager-context";
import { usePackWorkspace } from "@/lib/use-pack-workspace";
import { LoginScreen } from "@/components/login-screen";
import { OdinPackagePanel } from "./OdinPackagePanel";
import { useOdinPackage } from "./use-odin-package";
import { useOdinHost } from "./use-odin-host";
import { loadOdinDevPack } from "./odin-dev-pack";
import { OdinTooltips } from "./OdinTooltips";
import { SettingsPanel } from "@/components/settings-panel";
import { BRAND } from "@brands";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
import { openLinkInBrowser } from "@/lib/utils/bolt";
import { OdinLibrary } from "./OdinLibrary";
import { OdinProfile } from "./OdinProfile";
import { AiToolsPanel } from "@/components/ai-tools-panel";
import { useGenerationsBalance } from "@/hooks/use-generations-balance";
import logo from "@/assets/odin.webp";
import "./odin-panel.scss";

export function OdinHeader({
  onSettings,
  onProfile,
}: {
  onSettings: () => void;
  onProfile: () => void;
}) {
  return (
    <header className="odin-header">
      <button
        type="button"
        className="odin-header__logo"
        onClick={onSettings}
        aria-label="Settings"
      >
        <img src={logo} alt="Odin Pro" width={36} height={36} />
      </button>
      <button
        type="button"
        className="odin-header__profile"
        onClick={onProfile}
        aria-label="Profile"
      >
        <User size={22} />
      </button>
    </header>
  );
}

function OdinOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <section
      ref={ref}
      className="odin-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
        if (event.key === "Tab") {
          const items = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), a[href], select, [tabindex="0"]',
            ) || [],
          ).filter((item) => item.offsetParent !== null);
          const first = items[0],
            last = items[items.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === ref.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="odin-overlay__heading">
        <button type="button" aria-label="Back to library" onClick={onClose}>
          <ArrowLeft size={18} />
        </button>
        <h1>{title}</h1>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="odin-overlay__content">{children}</div>
    </section>
  );
}

function OdinActivity() {
  const { jobs, cancel } = useDownloadManager();
  const { statusMessage } = usePanelUI();
  const active = jobs.find((job) =>
    ["queued", "downloading", "installing"].includes(job.status),
  );
  return (
    <>
      {active && (
        <div className="odin-download" role="status">
          <Loader2 size={14} className="animate-spin" />
          <span>
            {active.pack.name} · {Math.round(active.progress || 0)}%
          </span>
          <button
            type="button"
            aria-label="Cancel download"
            onClick={() => cancel(active.id)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {statusMessage && (
        <div
          className={`odin-status odin-status--${statusMessage.tone}`}
          role={statusMessage.tone === "error" ? "alert" : "status"}
        >
          {statusMessage.text}
        </div>
      )}
    </>
  );
}

function OdinShell() {
  const { signedIn, authReady, subscription } = useAuth();
  const host = useOdinHost() === "PPRO" ? "PR" : "AE";
  const workspace = usePackWorkspace({
    loadTestPack:
      import.meta.env.DEV && BRAND.devPack?.host === host
        ? loadOdinDevPack
        : undefined,
  });
  const packageModel = useOdinPackage(workspace);
  const generations = useGenerationsBalance();
  const { showStatus } = usePanelUI();
  const [overlay, setOverlay] = useState<
    "profile" | "settings" | "package" | "ai-tools" | null
  >(null);
  const [upgradeTool, setUpgradeTool] = useState<string | null>(null);
  const upgradeCloseRef = useRef<HTMLButtonElement>(null);
  const upgradeTriggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (upgradeTool) upgradeCloseRef.current?.focus();
  }, [upgradeTool]);
  useEffect(() => {
    if (!signedIn) setOverlay(null);
  }, [signedIn]);
  if (!authReady)
    return (
      <div className="odin-boot" role="status">
        <img src={logo} width={48} height={48} alt="Odin Pro" />
        <Loader2 size={18} className="animate-spin" />
        <p>Loading Odin Pro…</p>
      </div>
    );
  if (!signedIn) return <LoginScreen />;
  const close = () => {
    setUpgradeTool(null);
    setOverlay(null);
  };
  const dismissUpgrade = () => {
    setUpgradeTool(null);
    setTimeout(() => upgradeTriggerRef.current?.focus(), 0);
  };
  const tutorials = () => {
    const url = BRAND.tutorialsUrl?.trim();
    if (!url) {
      showStatus("Tutorials link is not configured yet.", "error");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      showStatus("Tutorials link must start with https:// or http://", "error");
      return;
    }
    openLinkInBrowser(url);
  };
  return (
    <div className="odin-app">
      <div
        className="odin-app__workspace"
        aria-hidden={overlay ? true : undefined}
        inert={overlay ? true : undefined}
      >
        <OdinHeader
          onSettings={() => setOverlay("settings")}
          onProfile={() => setOverlay("profile")}
        />
        <OdinLibrary
          workspace={workspace}
          packageModel={packageModel}
          onTutorials={tutorials}
          onAiTools={() => setOverlay("ai-tools")}
        />
      </div>
      {overlay && (
        <OdinOverlay
          title={
            {
              profile: "Profile",
              settings: "Settings",
              package: "Package",
              "ai-tools": "AI Tools",
            }[overlay]
          }
          onClose={close}
        >
          {overlay === "profile" ? (
            <OdinProfile
              onPackage={() => setOverlay("package")}
              onLibrary={close}
              installed={packageModel.installed}
              testPack={workspace.isTestPack}
              version={workspace.packSettings?.main.version}
            />
          ) : overlay === "settings" ? (
            <div className="odin-settings">
              <SettingsPanel onBack={close} />
            </div>
          ) : overlay === "ai-tools" ? (
            <section className="odin-ai-tools">
              <div className="odin-ai-tools__panel" inert={upgradeTool ? true : undefined}>
                <AiToolsPanel
                  monthly={generations.monthly}
                  extra={generations.extra}
                  monthlyLimit={generations.monthlyLimit}
                  isFreeUser={generations.isFreeUser}
                  onUse={() => void generations.refresh()}
                  onNoCredits={(tool) => {
                    upgradeTriggerRef.current = document.activeElement as HTMLElement;
                    setUpgradeTool(tool);
                  }}
                />
              </div>
              {upgradeTool && (
                <div className="odin-ai-upgrade__backdrop" onClick={dismissUpgrade}>
                  <div
                    className="odin-ai-upgrade"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="odin-ai-upgrade-title"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        dismissUpgrade();
                      }
                    }}
                  >
                    <div className="odin-ai-upgrade__top">
                      <span className="odin-ai-upgrade__icon"><Sparkles size={20} /></span>
                      <button ref={upgradeCloseRef} type="button" aria-label="Close upgrade prompt" onClick={dismissUpgrade}><X size={18} /></button>
                    </div>
                    <span className="odin-ai-upgrade__eyebrow">Odin Pro AI</span>
                    <h2 id="odin-ai-upgrade-title">
                      {subscription.subscribed ? "More generations needed" : `Unlock ${upgradeTool}`}
                    </h2>
                    <p>
                      {subscription.subscribed
                        ? `You need more generations to use ${upgradeTool}. Check your Odin Pro plan to continue.`
                        : `You're ready to use ${upgradeTool}. Subscribe to Odin Pro to run this tool and unlock AI generations.`}
                    </p>
                    <button type="button" className="odin-ai-upgrade__cta" onClick={openMotionflowSubscribe}>
                      {subscription.subscribed ? "View plan" : "Explore Odin Pro"}
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <OdinPackagePanel model={packageModel} />
          )}
        </OdinOverlay>
      )}
      <OdinActivity />
      <OdinTooltips />
    </div>
  );
}

export function OdinApp() {
  return (
    <AuthProvider>
      <PanelUIProvider>
        <NotificationsProvider>
          <PackagesPathGateProvider>
            <DownloadManagerProvider>
              <OdinShell />
            </DownloadManagerProvider>
          </PackagesPathGateProvider>
        </NotificationsProvider>
      </PanelUIProvider>
    </AuthProvider>
  );
}
