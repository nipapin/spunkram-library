import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, Loader2, Sparkles, X } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { PanelUIProvider, usePanelUI } from "@/lib/panel-ui-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { PackagesPathGateProvider } from "@/lib/packages-path-gate";
import {
  DownloadManagerProvider,
} from "@/lib/download-manager-context";
import { usePackWorkspace } from "@/lib/use-pack-workspace";
import { getFirstPackRoot } from "@/lib/utils/pack-tree";
import { LoginScreen } from "@/components/login-screen";
import { OdinPackagePanel } from "./OdinPackagePanel";
import { useOdinPackage } from "./use-odin-package";
import { OdinTooltips } from "./OdinTooltips";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
import { OdinLibrary } from "./OdinLibrary";
import { OdinProfileMenu } from "./OdinProfileMenu";
import { OdinAccountZone } from "./OdinAccountZone";
import { OdinAiToolsPanel } from "./OdinAiToolsPanel";
import { useGenerationsBalance } from "@/hooks/use-generations-balance";
import logo from "@/assets/odin.webp";
import "./odin-panel.scss";

export function OdinHeader({
  onHome,
  onOpenSettings,
  onOpenProfile,
}: {
  onHome: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
}) {
  return (
    <header className="odin-header">
      <button type="button" className="odin-header__logo" aria-label="Back to library" onClick={onHome}>
        <img src={logo} alt="Odin Pro" width={36} height={36} />
      </button>
      <OdinProfileMenu onOpenProfile={onOpenProfile} onOpenSettings={onOpenSettings} />
    </header>
  );
}

function OdinOverlay({
  title,
  hideTitle = false,
  onClose,
  children,
}: {
  title: string;
  hideTitle?: boolean;
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
      className={hideTitle ? "odin-overlay odin-overlay--account" : "odin-overlay"}
      role={hideTitle ? "region" : "dialog"}
      aria-modal={hideTitle ? undefined : true}
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
        if (!hideTitle && event.key === "Tab") {
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
      {!hideTitle && <div className="odin-overlay__heading">
        <button type="button" aria-label="Back to library" onClick={onClose}>
          <ArrowLeft size={18} />
        </button>
        <h1>{title}</h1>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </div>}
      <div className="odin-overlay__content">{children}</div>
    </section>
  );
}

function OdinActivity() {
  const { statusMessage } = usePanelUI();
  return (
    <>
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
  const workspace = usePackWorkspace();
  const packageModel = useOdinPackage(workspace);
  const generations = useGenerationsBalance();
  const { setShowFavoritesOnly } = usePanelUI();
  const [homeVisit, setHomeVisit] = useState(0);
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
  if (packageModel.blocking) return <OdinPackagePanel model={packageModel} fullscreen />;
  const close = () => {
    setUpgradeTool(null);
    setOverlay(null);
  };
  const home = () => {
    close();
    workspace.setQuery("");
    setShowFavoritesOnly(false);
    workspace.setCategory(getFirstPackRoot(workspace.tree)?.id || "");
    setHomeVisit((value) => value + 1);
  };
  const dismissUpgrade = () => {
    setUpgradeTool(null);
    setTimeout(() => upgradeTriggerRef.current?.focus(), 0);
  };
  const accountOverlay = overlay === "profile" || overlay === "settings";
  return (
    <div className="odin-app">
      <div
        className="odin-app__workspace"
        aria-hidden={overlay && !accountOverlay ? true : undefined}
        inert={overlay && !accountOverlay ? true : undefined}
      >
        <OdinHeader
          onHome={home}
          onOpenSettings={() => setOverlay("settings")}
          onOpenProfile={() => setOverlay("profile")}
        />
        <div className="odin-app__library" aria-hidden={overlay ? true : undefined} inert={overlay ? true : undefined}>
        <OdinLibrary
          key={homeVisit}
          workspace={workspace}
          packageModel={packageModel}
          onAiTools={() => setOverlay("ai-tools")}
        />
        </div>
      </div>
      {overlay && (
        <OdinOverlay
          hideTitle={accountOverlay}
          title={
            {
              profile: "Account",
              settings: "Account",
              package: "Package",
              "ai-tools": "AI Tools",
            }[overlay]
          }
          onClose={close}
        >
          {overlay === "profile" || overlay === "settings" ? (
            <OdinAccountZone
              tab={overlay}
              onTabChange={(tab) => setOverlay(tab)}
              onPackage={() => setOverlay("package")}
              onLibrary={close}
              installed={packageModel.installed}
              testPack={workspace.isTestPack}
              version={workspace.packSettings?.main.version}
            />
          ) : overlay === "ai-tools" ? (
            <section className="odin-ai-tools">
              <div className="odin-ai-tools__panel" inert={upgradeTool ? true : undefined}>
                <OdinAiToolsPanel
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
                        ? `Your Odin Pro subscription includes 100 AI generations per month. You don't have enough left to use ${upgradeTool}. Your balance resets next month.`
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
