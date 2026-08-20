import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpCircle,
  FolderOpen,
  Loader2,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { resolvePackEntitlementContextForScan } from "@/api/cep-market";
import {
  asBool,
  clearInstalledPackagesInPreferences,
  clearPreferencesFile,
  resolvePreferencesPath,
  type PrefSettings,
} from "@/lib/api/preferences";
import { selectFolder } from "@/lib/utils/bolt";
import {
  notifyPackagesRescan,
  resolvePackagesInstallRoot,
  scanAndRegisterPacksAtRoot,
} from "@/lib/utils/pack-install";
import { EXTENSION_VERSION } from "@/lib/config/masked";
import {
  fetchSpunkramVersions,
  isReleaseAdminEmail,
  type SpunkramVersionEntry,
} from "@/api/update";
import { applyExtensionUpdate } from "@/utils/extension-update";
import * as panelStore from "@/lib/userdata-store";
import { clearAllActivePackStorageKeys } from "@/lib/utils/pack-host";

const ACCENT_PILL = "pill-brand";

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-white/[0.03]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-3.5 accent-[rgb(var(--primary))]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-foreground">{label}</span>
        {hint && (
          <span className="block text-[10px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}

function PathBrowse({
  value,
  disabled,
  onBrowse,
}: {
  value: string;
  disabled?: boolean;
  onBrowse: () => void;
}) {
  return (
    <div className="mt-1 flex gap-1.5">
      <input
        type="text"
        readOnly
        disabled={disabled}
        value={value}
        placeholder="No folder selected"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-background/40 px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground disabled:opacity-40"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onBrowse}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-secondary/60 px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
      >
        <FolderOpen className="size-3.5" />
        Browse
      </button>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs glass-card rounded-[20px] p-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">{body}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "flex flex-1 items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium",
              destructive
                ? "border border-destructive/50 bg-destructive/20 text-destructive"
                : ACCENT_PILL,
            )}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex flex-1 items-center justify-center rounded-full border border-white/10 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const { prefs, setPrefs, auth, signedIn, subscription } = useAuth();
  const [confirm, setConfirm] = useState<"reset" | "remove" | null>(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = isReleaseAdminEmail(auth.email);

  const [versions, setVersions] = useState<SpunkramVersionEntry[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [pointerStable, setPointerStable] = useState<string | null>(null);
  const [pointerBeta, setPointerBeta] = useState<string | null>(null);
  const [installBusy, setInstallBusy] = useState(false);
  const [installProgress, setInstallProgress] = useState<string | undefined>();
  const [installError, setInstallError] = useState<string | null>(null);
  const [packagesScanMsg, setPackagesScanMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setVersionsLoading(true);
    setVersionsError(null);
    fetchSpunkramVersions().then((data) => {
      if (cancelled) return;
      setVersionsLoading(false);
      if (!data) {
        setVersionsError("Could not load version list (deploy next-app + sign in).");
        return;
      }
      setVersions(data.versions);
      setPointerStable(data.current.stable);
      setPointerBeta(data.current.beta);
      const preferred =
        data.versions.find((v) => v.version === data.current.beta) ||
        data.versions.find((v) => v.version !== EXTENSION_VERSION) ||
        data.versions[0];
      if (preferred) setSelectedVersion(preferred.version);
    });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const selectedEntry = useMemo(
    () => versions.find((v) => v.version === selectedVersion),
    [versions, selectedVersion],
  );

  const canInstall =
    Boolean(selectedEntry?.zxpUrl) &&
    selectedEntry?.version !== EXTENSION_VERSION &&
    !installBusy;

  async function installSelectedVersion() {
    if (!selectedEntry?.zxpUrl || installBusy) return;
    setInstallBusy(true);
    setInstallError(null);
    setInstallProgress(`Downloading v${selectedEntry.version}…`);
    try {
      await applyExtensionUpdate(selectedEntry.zxpUrl, (p) => {
        if (p.phase === "download") {
          if (p.totalBytes && p.totalBytes > 0) {
            const pct = Math.min(99, Math.round((p.bytesReceived / p.totalBytes) * 100));
            setInstallProgress(`Downloading v${selectedEntry.version}… ${pct}%`);
          } else {
            setInstallProgress(`Downloading v${selectedEntry.version}…`);
          }
        } else if (p.phase === "extract") {
          setInstallProgress("Extracting…");
        } else if (p.phase === "apply") {
          setInstallProgress("Applying…");
        } else {
          setInstallProgress("Reloading…");
        }
      });
    } catch (err) {
      setInstallBusy(false);
      setInstallProgress(undefined);
      setInstallError(err instanceof Error ? err.message : String(err));
    }
  }

  function patch(partial: Partial<PrefSettings>) {
    setPrefs({ ...prefs, ...partial });
  }

  function browsePackages() {
    selectFolder(
      prefs.absCustomAbsolutePath || resolvePackagesInstallRoot(null) || "",
      "Select packages folder",
      (folder) => {
        if (!folder) return;
        void (async () => {
          patch({
            absCustomAbsolutePath: folder,
            useCustomPathBySubscription: 1,
          });
          const entitlement = signedIn
            ? await resolvePackEntitlementContextForScan({
                signedIn: true,
                purchases: subscription.purchases,
              })
            : null;
          const scan = scanAndRegisterPacksAtRoot(folder, entitlement);
          if (scan.found === 0) {
            setPackagesScanMsg("Folder saved. No pack files found under AE/ or PR/ yet.");
          } else if (scan.rejected > 0 && scan.added + scan.updated === 0) {
            setPackagesScanMsg(
              `Found ${scan.found} pack(s), but none are licensed to your account.`,
            );
          } else if (scan.added + scan.updated > 0) {
            const rejectedNote =
              scan.rejected > 0 ? ` ${scan.rejected} skipped (not licensed).` : "";
            setPackagesScanMsg(
              `Found ${scan.found} pack(s): ${scan.added} registered, ${scan.updated} updated.${rejectedNote}`,
            );
            notifyPackagesRescan(scan);
          } else {
            setPackagesScanMsg(`Found ${scan.found} pack(s) — already registered.`);
          }
        })();
      },
    );
  }

  function browseAssets() {
    selectFolder(
      prefs.customStockLocation || "",
      "Select assets folder",
      (folder) =>
        patch({
          customStockLocation: folder,
          useCustomPathForAssets: 1,
        }),
    );
  }

  function reloadExtension() {
    if (window.location?.reload) window.location.reload();
  }

  function resetAllSettings() {
    setBusy(true);
    setConfirm(null);
    // Match Beta: empty the prefs file; reload rebuilds defaults from scratch.
    clearPreferencesFile();
    try {
      clearAllActivePackStorageKeys((key) => panelStore.removeItem(key));
    } catch {
      // ignore
    }
    reloadExtension();
  }

  function removePackageFiles() {
    setBusy(true);
    setConfirm(null);
    clearInstalledPackagesInPreferences();
    try {
      clearAllActivePackStorageKeys((key) => panelStore.removeItem(key));
    } catch {
      // ignore
    }
    reloadExtension();
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="mx-2.5 mt-2 flex items-center gap-2 rounded-2xl px-2.5 py-1.5 glass-bar">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-full border border-[rgb(42,36,64)] bg-[rgb(14,12,26)]/50 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-[rgb(14,12,26)]"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground">
          <Settings2 className="size-3.5 text-primary" />
          Settings
        </div>
        <span
          className="ml-auto rounded-full border border-[rgb(42,36,64)] bg-[rgb(14,12,26)]/50 px-2 py-0.5 text-[10px] text-muted-foreground"
          title="Revision"
        >
          {EXTENSION_VERSION}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <section className="mb-3 glass-card rounded-[20px] p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            File System
          </h3>

          <div className="mb-1 text-xs text-foreground">Packages path</div>
          <p className="mb-1 text-[10px] text-muted-foreground">
            Packs install under AE/ or PR/ inside this folder. Existing packs there
            are imported automatically when you pick or change this path.
          </p>
          <PathBrowse
            value={prefs.absCustomAbsolutePath || ""}
            onBrowse={browsePackages}
          />
          {packagesScanMsg ? (
            <p className="mt-1.5 text-[10px] text-primary">{packagesScanMsg}</p>
          ) : null}
          {(prefs.absCustomAbsolutePath || "").trim() ? (
            <p className="mt-1.5 break-all text-[10px] text-muted-foreground">
              Installs go to {resolvePackagesInstallRoot(null)}
              {"\\"}
              {"{AE|PR}"}
            </p>
          ) : null}

          <div className="mt-3">
            <div className="mb-1 text-xs text-foreground">Assets download path</div>
            <p className="mb-1 text-[10px] text-muted-foreground">
              Stock footage downloads land here. Asked on download if empty.
            </p>
            <PathBrowse
              value={prefs.customStockLocation || ""}
              onBrowse={browseAssets}
            />
            <div className="mt-2">
              <ToggleRow
                label="Use project location"
                hint="Footage only — downloads next to the open project; does not change the assets path above"
                checked={asBool(prefs.useCurrentProjectLocation)}
                onChange={(v) => patch({ useCurrentProjectLocation: v ? 1 : 0 })}
              />
            </div>
          </div>
        </section>

        <section className="mb-3 glass-card rounded-[20px] p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Render Options
          </h3>
          <ToggleRow
            label="Use System Fonts"
            hint="Reload required"
            checked={asBool(prefs.useSystemFonts)}
            onChange={(v) => patch({ useSystemFonts: v ? 1 : 0 })}
          />
        </section>

        {isAdmin && (
          <section className="mb-3 glass-card rounded-[20px] p-3 ring-1 ring-inset ring-primary/20">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Admin · Builds
            </h3>
            <p className="mb-2 text-[10px] text-muted-foreground">
              All uploaded ZXPs from R2. Current:{" "}
              <span className="text-foreground">v{EXTENSION_VERSION}</span>
              {pointerBeta ? (
                <>
                  {" "}
                  · beta pointer <span className="text-foreground">v{pointerBeta}</span>
                </>
              ) : null}
              {pointerStable ? (
                <>
                  {" "}
                  · stable <span className="text-foreground">v{pointerStable}</span>
                </>
              ) : null}
            </p>

            {versionsLoading ? (
              <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading versions…
              </div>
            ) : versionsError ? (
              <p className="text-[11px] text-destructive">{versionsError}</p>
            ) : versions.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No uploaded builds found.</p>
            ) : (
              <>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Version
                </label>
                <select
                  value={selectedVersion}
                  onChange={(e) => setSelectedVersion(e.target.value)}
                  disabled={installBusy}
                  className="mb-2 w-full rounded-lg border border-white/10 bg-background/50 px-2.5 py-2 text-xs text-foreground focus:border-primary/50"
                >
                  {versions.map((v) => {
                    const tags: string[] = [];
                    if (v.channel === "beta") tags.push("beta");
                    else tags.push("stable");
                    if (v.version === EXTENSION_VERSION) tags.push("installed");
                    if (v.version === pointerBeta) tags.push("beta→");
                    if (v.version === pointerStable) tags.push("latest→");
                    return (
                      <option key={v.version} value={v.version}>
                        v{v.version}
                        {tags.length ? ` (${tags.join(", ")})` : ""}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  disabled={!canInstall}
                  onClick={() => void installSelectedVersion()}
                  className={cn(
                    "flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-opacity",
                    ACCENT_PILL,
                    !canInstall && "cursor-not-allowed opacity-50",
                  )}
                >
                  {installBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="size-3.5" />
                  )}
                  {installBusy
                    ? installProgress || "Installing…"
                    : selectedEntry?.version === EXTENSION_VERSION
                      ? "Already installed"
                      : `Install v${selectedVersion || "…"}`}
                </button>
                {installError && (
                  <p className="mt-1.5 text-[11px] text-destructive">{installError}</p>
                )}
              </>
            )}
          </section>
        )}

        <section className="glass-card rounded-[20px] p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Restoring An Extension
          </h3>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={reloadExtension}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
            >
              <RotateCcw className="size-3.5" />
              Reload extension
            </button>
            <button
              type="button"
              onClick={() => setConfirm("reset")}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10"
            >
              <Settings2 className="size-3.5" />
              Reset all settings
            </button>
            <button
              type="button"
              onClick={() => setConfirm("remove")}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
            >
              <Trash2 className="size-3.5" />
              Remove package files
            </button>
          </div>
          <p className="mt-2 truncate text-[9px] text-muted-foreground" title={resolvePreferencesPath()}>
            Prefs: {resolvePreferencesPath()}
          </p>
        </section>
      </div>

      {confirm === "reset" && (
        <ConfirmDialog
          title="Reset all settings?"
          body="preferences.json will be cleared. You will need to sign in again."
          confirmLabel={busy ? "Working…" : "Reset"}
          onConfirm={resetAllSettings}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "remove" && (
        <ConfirmDialog
          title="Remove package files?"
          body="Clears all installed package entries from preferences.json. This cannot be undone."
          confirmLabel={busy ? "Working…" : "Remove"}
          destructive
          onConfirm={removePackageFiles}
          onCancel={() => setConfirm(null)}
        />
      )}
      {busy && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
