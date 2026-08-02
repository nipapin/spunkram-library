import { useState } from "react";
import {
  ArrowLeft,
  FolderOpen,
  Loader2,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  asBool,
  loadPreferencesFile,
  resolvePreferencesPath,
  savePreferencesFile,
  DEFAULT_PREF_SETTINGS,
  type PrefSettings,
} from "@/lib/api/preferences";
import { selectFolder } from "@/lib/utils/bolt";
import { EXTENSION_VERSION } from "@/lib/config/masked";
import { fs, path } from "@/lib/cep/node";

const ACCENT_PILL =
  "bg-gradient-to-b from-primary to-primary/70 text-primary-foreground border border-primary/60 shadow-md shadow-primary/40 ring-1 ring-inset ring-white/15";

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
      <div className="w-full max-w-xs rounded-xl border border-white/10 bg-card p-4 shadow-2xl">
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
  const { prefs, setPrefs } = useAuth();
  const [confirm, setConfirm] = useState<"reset" | "remove" | null>(null);
  const [busy, setBusy] = useState(false);

  function patch(partial: Partial<PrefSettings>) {
    setPrefs({ ...prefs, ...partial });
  }

  function browsePackages() {
    selectFolder(
      prefs.absCustomAbsolutePath || "",
      "Select packages folder",
      (folder) => patch({ absCustomAbsolutePath: folder }),
    );
  }

  function browseAssets() {
    selectFolder(
      prefs.customStockLocation || "",
      "Select assets folder",
      (folder) =>
        patch({
          customStockLocation: folder,
          useCurrentProjectLocation: 0,
        }),
    );
  }

  function reloadExtension() {
    if (window.location?.reload) window.location.reload();
  }

  function resetAllSettings() {
    setBusy(true);
    const file = loadPreferencesFile();
    file.PrefSettings = { ...DEFAULT_PREF_SETTINGS };
    savePreferencesFile(file);
    setPrefs({ ...DEFAULT_PREF_SETTINGS });
    setBusy(false);
    setConfirm(null);
    reloadExtension();
  }

  function removePackageFiles() {
    setBusy(true);
    try {
      const file = loadPreferencesFile();
      const packages = Array.isArray(file.packages) ? file.packages : [];
      for (const pkg of packages) {
        const packPath =
          pkg && typeof pkg === "object" && "path" in pkg
            ? String((pkg as { path?: string }).path || "")
            : "";
        if (!packPath || typeof fs?.existsSync !== "function") continue;
        const dir = path.dirname(packPath);
        // Best-effort: remove sibling preview assets folder only; leave pack removal to host.
        const assets = path.join(dir, "Spunkram Preview Assets");
        if (fs.existsSync(assets) && typeof fs.rmSync === "function") {
          try {
            fs.rmSync(assets, { recursive: true, force: true });
          } catch {
            // ignore
          }
        }
      }
      file.packages = [];
      savePreferencesFile(file);
    } finally {
      setBusy(false);
      setConfirm(null);
      reloadExtension();
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-2.5 py-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back
        </button>
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Settings2 className="size-3.5 text-primary" />
          Settings
        </div>
        <span
          className="rounded-full border border-white/10 bg-card/70 px-2 py-0.5 text-[10px] text-muted-foreground"
          title="Revision"
        >
          {EXTENSION_VERSION}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <section className="mb-3 rounded-xl border border-white/10 bg-card/60 p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            File System
          </h3>
          <ToggleRow
            label="Use custom path for packages"
            checked={asBool(prefs.useCustomPathBySubscription)}
            onChange={(v) => patch({ useCustomPathBySubscription: v ? 1 : 0 })}
          />
          <PathBrowse
            value={prefs.absCustomAbsolutePath || ""}
            disabled={!asBool(prefs.useCustomPathBySubscription)}
            onBrowse={browsePackages}
          />

          <div className="mt-2">
            <ToggleRow
              label="Use custom path for assets"
              checked={asBool(prefs.useCustomPathForAssets)}
              onChange={(v) =>
                patch({
                  useCustomPathForAssets: v ? 1 : 0,
                  ...(v ? { useCurrentProjectLocation: 0 } : {}),
                })
              }
            />
            <PathBrowse
              value={prefs.customStockLocation || ""}
              disabled={!asBool(prefs.useCustomPathForAssets)}
              onBrowse={browseAssets}
            />
            <ToggleRow
              label="Use project location"
              checked={asBool(prefs.useCurrentProjectLocation)}
              onChange={(v) =>
                patch({
                  useCurrentProjectLocation: v ? 1 : 0,
                  ...(v ? { useCustomPathForAssets: 0 } : {}),
                })
              }
            />
          </div>
        </section>

        <section className="mb-3 rounded-xl border border-white/10 bg-card/60 p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            API Server
          </h3>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-white/[0.03]">
            <input
              type="radio"
              name="defaultApiServer"
              checked={Number(prefs.defaultApiServer) === 0}
              onChange={() => patch({ defaultApiServer: 0 })}
              className="accent-[rgb(var(--primary))]"
            />
            <span className="text-xs text-foreground">Main API Server</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-white/[0.03]">
            <input
              type="radio"
              name="defaultApiServer"
              checked={Number(prefs.defaultApiServer) === 1}
              onChange={() => patch({ defaultApiServer: 1 })}
              className="accent-[rgb(var(--primary))]"
            />
            <span className="text-xs text-foreground">Proxy Server #1</span>
          </label>
        </section>

        <section className="mb-3 rounded-xl border border-white/10 bg-card/60 p-3">
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

        <section className="rounded-xl border border-white/10 bg-card/60 p-3">
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
          body="Preferences will be restored to defaults. Installed packages stay listed."
          confirmLabel={busy ? "Working…" : "Reset"}
          onConfirm={resetAllSettings}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "remove" && (
        <ConfirmDialog
          title="Remove package files?"
          body="Clears installed package list and tries to remove preview asset folders. This cannot be undone."
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
