import { Download, Loader2, Package, RefreshCw } from "lucide-react";
import type { useOdinPackage } from "./use-odin-package";

export function OdinPackagePanel({
  model,
}: {
  model: ReturnType<typeof useOdinPackage>;
}) {
  return (
    <section
      className="odin-empty odin-install"
      aria-label="Odin package installation"
    >
      <div className="odin-empty__icon">
        <Package size={36} />
      </div>
      <span className="odin-install__host">{model.hostLabel}</span>
      <h2>Odin Pro{model.isDemo ? " Demo" : " Pack"}</h2>
      <p>
        {model.isDemo
          ? "Your free account includes Demo. It will be installed automatically."
          : `Download your pack for ${model.hostLabel} to get started.`}
      </p>
      {model.loading ? (
        <div role="status">
          <Loader2 className="animate-spin" size={18} /> Loading package…
        </div>
      ) : model.busy ? (
        <div className="odin-install__progress" role="status">
          <p>
            {model.phase === "installing"
              ? "Installing…"
              : model.phase === "Choose an installation folder"
                ? model.phase
                : `Downloading… ${Math.round(model.progress)}%`}
          </p>
          <progress max={100} value={model.progress} />
          <button type="button" className="odin-outline" onClick={model.cancel}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          {model.error && (
            <p className="odin-error" role="alert">
              {model.error}
            </p>
          )}
          {model.pack && (
            <button
              type="button"
              className="odin-primary"
              onClick={() => void model.install()}
            >
              <Download size={16} />
              {model.installed
                ? "Reinstall"
                : model.isDemo
                  ? "Install Demo"
                  : "Download Pack"}
            </button>
          )}
          {model.error && (
            <button
              type="button"
              className="odin-outline"
              onClick={model.refresh}
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          )}
        </>
      )}
    </section>
  );
}
