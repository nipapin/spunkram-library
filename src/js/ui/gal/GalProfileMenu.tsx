import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  galAccountPlanLabel,
  resolveGalAccountPlan,
} from "@/lib/utils/gal-plan";
import { currentPackHost } from "@/lib/utils/pack-host";
import { accountInitial } from "./GalProfile";
import "./gal-account.scss";

export function GalProfileMenu({
  onOpenProfile,
  onOpenSettings,
}: {
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}) {
  const { auth, subscription, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const host = currentPackHost();

  const galPlan = useMemo(
    () =>
      resolveGalAccountPlan({
        subscribed: subscription.subscribed,
        purchases: subscription.purchases,
        host,
      }),
    [subscription.subscribed, subscription.purchases, host],
  );

  const statusLabel = subscription.error
    ? "Error"
    : galAccountPlanLabel(galPlan);
  const planAccent = !subscription.error && galPlan !== "free";
  const initial = accountInitial(auth.email, auth.name);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setBusy(true);
    setOpen(false);
    await logout();
    setBusy(false);
  }

  return (
    <div className="gal-profile-menu" ref={rootRef}>
      <button
        type="button"
        className="gal-profile-menu__trigger"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="gal-profile-menu__avatar" aria-hidden>
          {initial}
        </span>
      </button>

      {open ? (
        <div className="gal-profile-menu__dropdown" role="menu">
          <div className="gal-profile-menu__card">
            <div className="gal-profile-menu__card-avatar" aria-hidden>
              {initial}
            </div>
            <div className="gal-profile-menu__card-copy">
              <p className="gal-profile-menu__email">
                {auth.email || "Signed in"}
              </p>
              <p className="gal-profile-menu__plan">
                Plan{" "}
                <span
                  className={
                    planAccent
                      ? "gal-profile-menu__plan-value"
                      : "gal-profile-menu__plan-value is-muted"
                  }
                >
                  {statusLabel}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            className="gal-profile-menu__item"
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
          >
            <User className="size-3.5" aria-hidden />
            Profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="gal-profile-menu__item"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <Settings className="size-3.5" aria-hidden />
            Settings
          </button>

          <div className="gal-profile-menu__divider" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="gal-profile-menu__item gal-profile-menu__item--danger"
            disabled={busy}
            onClick={() => void handleLogout()}
          >
            <LogOut className="size-3.5" aria-hidden />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
