import { useLayoutEffect, useRef, useState } from "react";
import { Scissors, Video, Sparkles, ShoppingBag, User, Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/notifications-context";
import { useDownloadManager } from "@/lib/download-manager-context";
import "./panel-header.scss";

const NAV_ITEMS = [
  { id: "editing", label: "Editing", icon: Scissors },
  { id: "footages", label: "Footages", icon: Video },
  { id: "ai-tools", label: "AI Tools", icon: Sparkles },
] as const;

export function PanelHeader({
  active,
  onSelect,
  onOpenAccount,
  onOpenSettings,
}: {
  active: string;
  onSelect: (id: string) => void;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}) {
  const { signedIn, subscription } = useAuth();
  const { unreadMarketCount, clearUnread } = useNotifications();
  const { activeCount } = useDownloadManager();
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = useState({ left: 0, width: 0, visible: false });
  const [animateThumb, setAnimateThumb] = useState(false);

  const navIndex = NAV_ITEMS.findIndex((item) => item.id === active);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const el = navIndex >= 0 ? tabRefs.current[navIndex] : null;

    const place = () => {
      if (!nav || !el) {
        setThumb((prev) => ({ ...prev, visible: false }));
        return;
      }
      setThumb({
        left: el.offsetLeft,
        width: el.offsetWidth,
        visible: true,
      });
    };

    place();
    const frame = requestAnimationFrame(() => setAnimateThumb(true));
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    if (nav) ro?.observe(nav);
    if (el) ro?.observe(el);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [navIndex]);

  return (
    <header className="panel-header">
      <button
        type="button"
        className="panel-header__logo"
        aria-label="Settings"
        title="Extension settings"
        onClick={onOpenSettings}
      >
        <img src={logo} alt="Spunkram logo" width={38} height={38} />
      </button>

      <nav ref={navRef} className="panel-header__nav">
        <span
          className={
            "panel-header__thumb" +
            (thumb.visible ? " panel-header__thumb--on" : "") +
            (animateThumb ? " panel-header__thumb--animate" : "")
          }
          style={{
            transform: `translateX(${thumb.left}px)`,
            width: thumb.width,
          }}
          aria-hidden
        />
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              onClick={() => onSelect(item.id)}
              aria-label={item.label}
              aria-pressed={isActive}
              className={isActive ? "panel-header__tab panel-header__tab--active" : "panel-header__tab"}
            >
              <Icon className="size-3.5" strokeWidth={2.25} />
              <span className="panel-header__tab-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        className={
          active === "market"
            ? "panel-header__market panel-header__market--active"
            : "panel-header__market"
        }
        onClick={() => {
          clearUnread();
          onSelect("market");
        }}
        aria-pressed={active === "market"}
        aria-label="Market"
      >
        {activeCount > 0 ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
        ) : (
          <ShoppingBag className="size-3.5" strokeWidth={2.25} />
        )}
        <span className="panel-header__tab-label">Market</span>
        {unreadMarketCount > 0 && (
          <span className="panel-header__badge">
            {unreadMarketCount > 9 ? "9+" : unreadMarketCount}
          </span>
        )}
      </button>

      <button
        type="button"
        className={
          active === "account"
            ? "panel-header__account panel-header__account--active"
            : "panel-header__account"
        }
        aria-label="Account"
        onClick={onOpenAccount}
      >
        <User className="size-4" strokeWidth={2.25} />
        {signedIn && (
          <span
            className={
              subscription.subscribed
                ? "panel-header__status panel-header__status--on"
                : "panel-header__status panel-header__status--free"
            }
          />
        )}
      </button>
    </header>
  );
}
