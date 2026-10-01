import { useEffect, useRef } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import logo from "@/assets/odin.webp";
import type { useOdinPackage } from "./use-odin-package";

export function OdinPackagePanel({
  model,
  fullscreen = false,
}: {
  model: ReturnType<typeof useOdinPackage>;
  fullscreen?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (fullscreen) ref.current?.focus();
  }, [fullscreen]);
  const progress = Math.round(Math.max(0, Math.min(100, model.progress)));
  const failed = Boolean(model.error) && !model.busy;
  const phase = model.phase === "installing" ? "Installing your library…"
    : model.phase === "done" ? "Opening your library…"
    : model.phase === "downloading" ? "Downloading your library…"
    : "Preparing your library…";
  return (
    <section
      ref={ref}
      className={fullscreen ? "odin-provision" : "odin-empty odin-install"}
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen ? true : undefined}
      aria-label="Setting up Odin Pro"
      tabIndex={fullscreen ? -1 : undefined}
      onKeyDown={(event) => {
        if (!fullscreen) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
        }
        if (event.key === "Tab") {
          event.preventDefault();
          (ref.current?.querySelector<HTMLButtonElement>("button:not([disabled])") || ref.current)?.focus();
        }
      }}
    >
      <div className="odin-provision__content">
      <img src={logo} alt="Odin Pro" width={60} height={60} />
      <span className="odin-install__host">{model.hostLabel}</span>
      <h2>Odin Pro{model.isDemo ? " Demo" : " Pack"}</h2>
      <p>
        {model.isDemo
          ? "Setting up the Demo library for your free account."
          : "Setting up the full library included in your subscription."}
      </p>
      {!failed ? (
        <div className="odin-provision__progress" aria-live="polite" aria-busy="true">
          <div className="odin-provision__phase">
            <Loader2 className="animate-spin" size={16} />
            <span>{model.loading ? "Checking your account…" : phase}</span>
            <strong>{progress}%</strong>
          </div>
          <progress max={100} value={progress} aria-label="Library setup progress" />
          <small>Your library will open automatically when it is ready.</small>
        </div>
      ) : (
        <>
          <p className="odin-error" role="alert">{model.error}</p>
          <button type="button" className="odin-primary" onClick={model.refresh}>
            <RefreshCw size={16} /> Retry setup
          </button>
        </>
      )}
      </div>
    </section>
  );
}
