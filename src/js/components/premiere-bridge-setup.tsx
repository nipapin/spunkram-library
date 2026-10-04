import { useState } from "react";
import { csi, cepHostAppId } from "@/lib/utils/bolt";
import { os } from "@/lib/cep/node";
import { installMacPremiereBridge, macBridgeStatus, MAC_BRIDGE_SETUP_HELP } from "@/lib/utils/premiere-native";

/** Checking files is cheap; no extraction or admin prompt during panel startup. */
export function PremiereBridgeSetup() {
  const [status, setStatus] = useState(() => {
    if (typeof window === "undefined" || !window.cep || os.platform() !== "darwin" || cepHostAppId() !== "PPRO") return null;
    return macBridgeStatus();
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!status || (status.installed && !status.restartRequired)) return null;

  async function install() {
    setBusy(true);
    setError(null);
    try {
      await installMacPremiereBridge(csi.getSystemPath("extension"));
      setStatus(macBridgeStatus());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not install Motionflow Bridge. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-2.5 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200" role="status">
      <div className="flex items-center gap-2">
        <span className="flex-1">
          {status.restartRequired
            ? "Motionflow Bridge installed. Restart Premiere Pro. If it is not added automatically, use Preferences > Control Surface > Add > Motionflow Bridge."
            : "Transitions need Motionflow Bridge. Install it once to enable them on this Mac."}
        </span>
        {!status.restartRequired && (
          <button type="button" disabled={busy} onClick={() => void install()}
            title={MAC_BRIDGE_SETUP_HELP}
            className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-1 font-medium disabled:opacity-50">
            {busy ? "Installing…" : "Install Bridge"}
          </button>
        )}
      </div>
      {error && <p className="mt-1.5" role="alert">{error}</p>}
    </div>
  );
}
