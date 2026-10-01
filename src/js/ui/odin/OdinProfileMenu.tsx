import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { odinAccountInitial } from "./OdinProfile";

export function OdinProfileMenu({
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
  const initial = odinAccountInitial(auth.email);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="odin-profile-menu"
      onMouseEnter={() => { if (!busy) setOpen(true); }}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="odin-profile-menu__trigger"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>{initial}</span>
      </button>
      {open && (
        <div className="odin-profile-menu__dropdown" role="menu" aria-label="Account">
          <div className="odin-profile-menu__surface">
            <div className="odin-profile-menu__identity">
              <span className="odin-profile-menu__identity-avatar" aria-hidden>{initial}</span>
              <span className="odin-profile-menu__identity-copy">
                <strong title={auth.email || undefined}>{auth.email || "Signed in"}</strong>
                <small className={subscription.subscribed ? "is-active" : ""}>
                  {subscription.subscribed ? "Subscription active" : "Free account"}
                </small>
              </span>
            </div>
            <button
              type="button"
              role="menuitem"
              className="odin-profile-menu__item"
              onClick={() => { setOpen(false); onOpenProfile(); }}
            >
              <User size={16} aria-hidden /> Profile
            </button>
            <button
              type="button"
              role="menuitem"
              className="odin-profile-menu__item"
              onClick={() => { setOpen(false); onOpenSettings(); }}
            >
              <Settings size={16} aria-hidden /> Settings
            </button>
            <div className="odin-profile-menu__divider" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="odin-profile-menu__item odin-profile-menu__item--logout"
              disabled={busy}
              onClick={() => void handleLogout()}
            >
              <LogOut size={16} aria-hidden /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
