import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Download,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
import { BRAND } from "@brands";
import logo from "@/assets/odin.webp";
import { useOdinHost } from "./use-odin-host";
import { selectOdinPackage } from "./odin-package-selection";

export function OdinProfile({
  onPackage,
  onLibrary,
  installed,
  testPack,
  version,
}: {
  onPackage: () => void;
  onLibrary: () => void;
  installed: boolean;
  testPack?: boolean;
  version?: string;
}) {
  const { auth, subscription, market, logout, revoke, recheck } = useAuth();
  const host = useOdinHost() === "PPRO" ? "PR" : "AE";
  const hostLabel = host === "PR" ? "Premiere Pro" : "After Effects";
  const pack = selectOdinPackage(market?.Packages || [], host, true);
  const preview =
    pack?.image_url?.replace(
      /^http:\/\/api\.get-atomx\.com\//,
      "https://api.get-atomx.com/",
    ) || BRAND.packagePreviews?.[host];
  const [failedPreview, setFailedPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  async function act(
    action: () => Promise<{ ok: boolean; message?: string } | void>,
    refresh = false,
  ) {
    setBusy(true);
    setRefreshing(refresh);
    setError("");
    try {
      const result = await action();
      if (result && !result.ok)
        setError(result.message || "Could not complete this action");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not complete this action",
      );
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }
  return (
    <div className="odin-profile">
      <section className="odin-profile__hero">
        <span className="odin-profile__avatar">
          {(auth.email || "O").slice(0, 1).toUpperCase()}
        </span>
        <div>
          <p className="odin-profile__email">{auth.email}</p>
          <span
            className={`odin-profile__status ${subscription.subscribed ? "current" : ""}`}
          >
            {subscription.subscribed ? (
              <ShieldCheck size={12} />
            ) : (
              <span className="odin-profile__status-dot" />
            )}
            {subscription.subscribed ? "Subscription active" : "Free account"}
          </span>
        </div>
        <button
          type="button"
          className="odin-profile__icon-button"
          aria-label="Log out"
          data-tooltip="Log out"
          disabled={busy}
          onClick={() => void act(logout)}
        >
          <LogOut size={17} />
        </button>
      </section>
      {(error || subscription.error) && (
        <p role="alert" className="odin-error">
          {error || subscription.error}
        </p>
      )}
      <section
        className="odin-profile__package"
        aria-label="Your Odin Pro pack"
      >
        <div className="odin-profile__cover">
          {preview && failedPreview !== preview ? (
            <img
              src={preview}
              alt={`Odin Pro for ${hostLabel} pack preview`}
              onError={() => setFailedPreview(preview)}
            />
          ) : (
            <img
              className="odin-profile__cover-logo"
              src={logo}
              alt="Odin Pro"
            />
          )}
          <span className="odin-profile__host">{hostLabel}</span>
          {testPack && <span className="odin-profile__test">Local test</span>}
        </div>
        <div className="odin-profile__package-body">
          <div className="odin-profile__package-title">
            <div>
              <h2>Odin Pro</h2>
              <p>
                {version || pack?.version
                  ? `Version ${version || pack?.version}`
                  : `For ${hostLabel}`}
              </p>
            </div>
            {installed && (
              <span className="odin-profile__installed">
                <Check size={13} /> Ready
              </span>
            )}
          </div>
          <div className="odin-profile__package-actions">
            <button
              type="button"
              className={
                subscription.subscribed
                  ? "odin-primary"
                  : "odin-outline"
              }
              onClick={installed ? onLibrary : onPackage}
            >
              {installed ? <ChevronRight size={16} /> : <Download size={16} />}
              {installed
                ? "Open library"
                : subscription.subscribed
                  ? "Download Pack"
                  : "Demo package"}
            </button>
            {!subscription.subscribed && (
              <button
                type="button"
                className="odin-primary"
                onClick={() => openMotionflowSubscribe()}
              >
                Subscribe <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </div>
      </section>
      <div className="odin-profile__links">
        <span>Subscription status</span>
        <button
          type="button"
          className="odin-profile__refresh"
          disabled={busy}
          onClick={() => void act(recheck, true)}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Checking…" : "Refresh"}
        </button>
      </div>
      <section className="odin-profile__devices">
        <div className="odin-profile__section-title">
          <h2>Active devices</h2>
          <span>{subscription.devices.length}</span>
        </div>
        {subscription.devices.length === 0 && (
          <p className="odin-profile__no-devices">No active devices</p>
        )}
        {subscription.devices.map((device) => (
          <div className="odin-profile__device" key={device.id}>
            <span className="odin-profile__device-icon">
              <Monitor size={20} />
            </span>
            <div>
              <strong>
                {device.name || device.user_fingerprint || "Device"}
              </strong>
              <p>
                {device.ip}
                {device.current && (
                  <span className="odin-profile__this-device">This device</span>
                )}
              </p>
            </div>
            <button
              type="button"
              className="odin-profile__icon-button odin-profile__remove"
              aria-label={`Remove device ${device.name || device.id}`}
              data-tooltip="Remove device"
              disabled={busy}
              onClick={() => void act(() => revoke(device.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
