import { BRAND } from "@brands";
import logo from "./assets/logo.png";

export function GalBootScreen({
  percent,
  error,
  onRetry,
}: {
  percent: number;
  error?: string | null;
  onRetry?: () => void;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const isError = Boolean(error);

  return (
    <div
      className="gal-shell gal-shell--boot"
      role="status"
      aria-live="polite"
      aria-busy={!isError}
      aria-label={
        isError
          ? "Couldn’t finish loading"
          : `${BRAND.panelDisplayName} loading`
      }
    >
      <div className="gal-boot">
        <div className="gal-boot__mark">
          <span className="gal-boot__glow" />
          <img className="gal-boot__logo" src={logo} alt="" draggable={false} />
        </div>

        {isError ? (
          <>
            <p className="gal-boot__error">{error}</p>
            {onRetry ? (
              <button
                type="button"
                className="gal-boot__retry"
                onClick={onRetry}
              >
                Try again
              </button>
            ) : null}
          </>
        ) : (
          <div
            className="gal-boot__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="gal-boot__fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

