import { useState } from "react";
import { ExternalLink, Loader2, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { FogBackground } from "@/components/fog-background";
import logo from "@/assets/logo.png";

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

export function LoginScreen() {
  const { loginWithMotionflow, cancelLogin, loginBusy, loginCode } = useAuth();
  const [message, setMessage] = useState<{
    tone: "error" | "info" | "success";
    text: string;
  } | null>(null);

  async function handleSignIn() {
    setMessage({ tone: "info", text: "Opening browser to sign in…" });
    const result = await loginWithMotionflow();
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message || "Sign in failed" });
      return;
    }
    setMessage({ tone: "success", text: result.message || "Signed in" });
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-hidden px-6 text-foreground">
      <FogBackground className="pointer-events-none absolute inset-0 z-0" />

      <div className="relative z-10 flex w-full max-w-xs flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-b from-primary to-primary/70 shadow-[0_0_20px_2px] shadow-primary/50 ring-1 ring-inset ring-white/15">
            <img src={logo} alt="Spunkram" width={48} height={48} className="size-11 object-contain" />
          </div>
          <div>
            <h1 className="text-base font-semibold drop-shadow-[0_1px_8px_rgba(0,0,0,0.65)]">
              Welcome to Spunkram
            </h1>
            <p className="mt-1 max-w-xs text-[11px] text-muted-foreground drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
              Sign in with your Motionflow account to use the Spunkram extension — packs, subscriptions, and AI tools.
            </p>
          </div>
        </div>

        {message && (
          <div
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-[11px] backdrop-blur-md",
              message.tone === "error" &&
                "border-destructive/40 bg-destructive/20 text-destructive",
              message.tone === "success" &&
                "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
              message.tone === "info" &&
                "border-white/10 bg-card/70 text-muted-foreground",
            )}
          >
            {message.text}
          </div>
        )}

        {loginBusy && loginCode && (
          <div className="w-full rounded-xl border border-primary/30 bg-card/70 px-3 py-3 text-center backdrop-blur-md">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Confirm this code in the browser
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-widest text-foreground">
              {loginCode}
            </p>
            <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Waiting for confirmation…
            </p>
          </div>
        )}

        <div className="flex w-full flex-col gap-2">
          {loginBusy ? (
            <button
              type="button"
              onClick={cancelLogin}
              className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-card/70 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-md transition-colors hover:bg-card"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSignIn()}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium",
                ACCENT_PILL,
              )}
            >
              <LogIn className="size-3.5" />
              Sign in to Spunkram
              <ExternalLink className="size-3 opacity-70" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
