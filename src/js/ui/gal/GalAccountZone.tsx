import { useState } from "react";
import { ArrowLeft, LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BRAND } from "@brands";
import { version as EXTENSION_VERSION } from "../../../shared/shared";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";
import { GalProfile } from "./GalProfile";
import { GalSettings } from "./GalSettings";
import "./gal-account-zone.scss";

export type GalAccountTab = "profile" | "settings";

export function GalAccountZone({
  tab,
  onTabChange,
  onClose,
  onPackReady,
}: {
  tab: GalAccountTab;
  onTabChange: (tab: GalAccountTab) => void;
  onClose: () => void;
  onPackReady?: (meta: InstalledPackMeta) => void;
}) {
  const { logout } = useAuth();
  const [logoutBusy, setLogoutBusy] = useState(false);

  async function handleLogout() {
    setLogoutBusy(true);
    await logout();
    setLogoutBusy(false);
  }

  return (
    <div className="gal-account-zone">
      <aside className="gal-account-zone__rail">
        <div className="gal-account-zone__rail-top">
          <button
            type="button"
            className="gal-account-zone__back"
            onClick={onClose}
            aria-label="Back"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <p className="gal-account-zone__brand" title={BRAND.panelDisplayName}>
            {BRAND.panelDisplayName}
          </p>
        </div>

        <nav className="gal-account-zone__nav" aria-label="Account">
          <button
            type="button"
            className={
              tab === "profile"
                ? "gal-account-zone__nav-item is-active"
                : "gal-account-zone__nav-item"
            }
            aria-current={tab === "profile" ? "page" : undefined}
            onClick={() => onTabChange("profile")}
          >
            <User className="size-3.5" aria-hidden />
            Profile
          </button>
          <button
            type="button"
            className={
              tab === "settings"
                ? "gal-account-zone__nav-item is-active"
                : "gal-account-zone__nav-item"
            }
            aria-current={tab === "settings" ? "page" : undefined}
            onClick={() => onTabChange("settings")}
          >
            <Settings className="size-3.5" aria-hidden />
            Settings
          </button>
        </nav>

        <div className="gal-account-zone__rail-foot">
          <button
            type="button"
            className="gal-account-zone__logout"
            disabled={logoutBusy}
            onClick={() => void handleLogout()}
          >
            <LogOut className="size-3.5" aria-hidden />
            Log Out
          </button>
          <span className="gal-account-zone__version">v{EXTENSION_VERSION}</span>
        </div>
      </aside>

      <div className="gal-account-zone__main">
        {tab === "profile" ? (
          <GalProfile />
        ) : (
          <GalSettings onPackReady={onPackReady} />
        )}
      </div>
    </div>
  );
}
