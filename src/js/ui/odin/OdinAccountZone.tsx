import { useState } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SettingsPanel } from "@/components/settings-panel";
import { OdinProfile } from "./OdinProfile";

export type OdinAccountTab = "profile" | "settings";

export function OdinAccountZone({
  tab,
  onTabChange,
  onPackage,
  onLibrary,
  installed,
  testPack,
  version,
}: {
  tab: OdinAccountTab;
  onTabChange: (tab: OdinAccountTab) => void;
  onPackage: () => void;
  onLibrary: () => void;
  installed: boolean;
  testPack?: boolean;
  version?: string;
}) {
  const { logout } = useAuth();
  const [logoutBusy, setLogoutBusy] = useState(false);

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await logout();
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <div className="odin-account-zone">
      <nav className="odin-account-zone__nav" aria-label="Account">
        <button
          type="button"
          className={tab === "profile" ? "odin-account-zone__item is-active" : "odin-account-zone__item"}
          aria-current={tab === "profile" ? "page" : undefined}
          onClick={() => onTabChange("profile")}
        >
          <User size={16} aria-hidden /> Profile
        </button>
        <button
          type="button"
          className={tab === "settings" ? "odin-account-zone__item is-active" : "odin-account-zone__item"}
          aria-current={tab === "settings" ? "page" : undefined}
          onClick={() => onTabChange("settings")}
        >
          <Settings size={16} aria-hidden /> Settings
        </button>
        <button
          type="button"
          className="odin-account-zone__item odin-account-zone__item--logout"
          disabled={logoutBusy}
          onClick={() => void handleLogout()}
        >
          <LogOut size={16} aria-hidden /> Log out
        </button>
      </nav>
      <div className="odin-account-zone__content">
        {tab === "profile" ? (
          <OdinProfile
            onPackage={onPackage}
            onLibrary={onLibrary}
            installed={installed}
            testPack={testPack}
            version={version}
          />
        ) : (
          <div className="odin-settings">
            <SettingsPanel onBack={() => onTabChange("profile")} />
          </div>
        )}
      </div>
    </div>
  );
}
