import { Scissors, Video, Sparkles, ShoppingBag, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/notifications-context";
import { useDownloadManager } from "@/lib/download-manager-context";

const NAV_ITEMS = [
  { id: "editing", label: "Editing", icon: Scissors },
  { id: "footages", label: "Footages", icon: Video },
  { id: "ai-tools", label: "AI Tools", icon: Sparkles },
] as const;

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

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

  return (
    <header className="flex items-center gap-2 border-b border-white/5 px-2.5 py-2.5">
      <button
        type="button"
        aria-label="Settings"
        title="Extension settings"
        onClick={onOpenSettings}
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-primary to-primary/70 shadow-[0_0_16px_2px] shadow-primary/60 ring-1 ring-inset ring-white/15 transition-transform duration-200 hover:scale-110"
      >
        <img src={logo} alt="Spunkram logo" width={38} height={38} className="size-9 object-contain" />
      </button>

      <nav className="flex flex-1 items-center gap-1 rounded-full border border-white/10 bg-card/70 px-1.5 py-1 backdrop-blur">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-label={item.label}
              aria-pressed={isActive}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? ACCENT_PILL
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" strokeWidth={2.25} />
              <span className="hidden whitespace-nowrap min-[490px]:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => {
          clearUnread();
          onSelect("market");
        }}
        aria-pressed={active === "market"}
        className={cn(
          "relative flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors min-[490px]:px-3",
          ACCENT_PILL,
        )}
        aria-label="Market"
      >
        {activeCount > 0 ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2.25} />
        ) : (
          <ShoppingBag className="size-3.5" strokeWidth={2.25} />
        )}
        <span className="hidden whitespace-nowrap min-[490px]:inline">Market</span>
        {unreadMarketCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-background">
            {unreadMarketCount > 9 ? "9+" : unreadMarketCount}
          </span>
        )}
      </button>

      <button
        type="button"
        aria-label="Account"
        onClick={onOpenAccount}
        className={cn(
          "relative flex size-10 shrink-0 items-center justify-center rounded-full border border-solid border-white/10 bg-card/70 text-white transition-colors hover:bg-white/10",
          active === "account" && "ring-1 ring-primary/50",
        )}
      >
        <User className="size-4.5" />
        {signedIn && (
          <span
            className={cn(
              "absolute right-0.5 top-0.5 size-2 rounded-full ring-2 ring-background",
              subscription.subscribed ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
        )}
      </button>
    </header>
  );
}
