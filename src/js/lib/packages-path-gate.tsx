/**
 * Gate pack installs behind an explicit packages-folder choice.
 * Shows an in-panel dialog (not a silent native picker / default `_ABS`).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { readPrefSettings } from "@/lib/api/preferences";
import { selectFolder } from "@/lib/utils/bolt";
import { hasConfiguredPackagesInstallPath } from "@/lib/utils/pack-install";
import { cn } from "@/lib/utils";

const ACCENT_PILL = "pill-brand";

type PackagesPathGateValue = {
  /** Resolves true once a packages path is configured (existing or newly chosen). */
  ensurePackagesPath: () => Promise<boolean>;
};

const PackagesPathGateContext = createContext<PackagesPathGateValue | null>(null);

export function PackagesPathGateProvider({ children }: { children: ReactNode }) {
  const { prefs, updatePrefs } = useAuth();
  const [open, setOpen] = useState(false);
  const waiterRef = useRef<{ resolve: (ok: boolean) => void } | null>(null);

  const finish = useCallback((ok: boolean) => {
    const waiter = waiterRef.current;
    waiterRef.current = null;
    setOpen(false);
    waiter?.resolve(ok);
  }, []);

  const ensurePackagesPath = useCallback((): Promise<boolean> => {
    if (hasConfiguredPackagesInstallPath()) {
      const fromDisk = readPrefSettings();
      const diskPath = (fromDisk.absCustomAbsolutePath || "").trim();
      if (diskPath && diskPath !== (prefs.absCustomAbsolutePath || "").trim()) {
        updatePrefs({
          absCustomAbsolutePath: diskPath,
          useCustomPathBySubscription: 1,
        });
      }
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      if (waiterRef.current) waiterRef.current.resolve(false);
      waiterRef.current = { resolve };
      setOpen(true);
    });
  }, [prefs.absCustomAbsolutePath, updatePrefs]);

  const onChooseFolder = useCallback(() => {
    selectFolder(
      (prefs.absCustomAbsolutePath || "").trim(),
      "Select packages folder",
      (folder) => {
        if (!folder) return;
        updatePrefs({
          absCustomAbsolutePath: folder,
          useCustomPathBySubscription: 1,
        });
        finish(true);
      },
    );
  }, [finish, prefs.absCustomAbsolutePath, updatePrefs]);

  const value = useMemo(
    () => ({ ensurePackagesPath }),
    [ensurePackagesPath],
  );

  return (
    <PackagesPathGateContext.Provider value={value}>
      {children}
      {open ? (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-xl border border-white/10 bg-card p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="packages-path-title"
          >
            <h3
              id="packages-path-title"
              className="text-sm font-semibold text-foreground"
            >
              Choose packages install folder
            </h3>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Before installing a pack, pick where Spunkram should store packs.
              They are saved under AE/ or PR/ inside this folder. You can change it
              later in Settings.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onChooseFolder}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-full px-3 py-2 text-xs font-medium",
                  ACCENT_PILL,
                )}
              >
                Choose folder…
              </button>
              <button
                type="button"
                onClick={() => finish(false)}
                className="flex flex-1 items-center justify-center rounded-full border border-white/10 bg-secondary/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PackagesPathGateContext.Provider>
  );
}

export function usePackagesPathGate(): PackagesPathGateValue {
  const ctx = useContext(PackagesPathGateContext);
  if (!ctx) {
    throw new Error("usePackagesPathGate must be used within PackagesPathGateProvider");
  }
  return ctx;
}
