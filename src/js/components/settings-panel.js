import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpCircle, FolderOpen, Loader2, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useConfiguration } from "../../context/ConfigurationWrapper";
import { resolvePackEntitlementContextForScan } from "@/api/cep-market";
import { asBool, clearPreferencesFile, resolvePreferencesPath, } from "@/lib/api/preferences";
import { selectFolder } from "@/lib/utils/bolt";
import { notifyPackagesRescan, removeAllInstalledPacks, resolvePackagesInstallRoot, scanAndRegisterPacksAtRoot } from "@/lib/utils/pack-install";
import { compareVersions, fetchSpunkramVersions, isReleaseAdminEmail, } from "@/api/update";
import { applyExtensionUpdate } from "@/utils/extension-update";
import { getEffectiveLocalVersion } from "@/utils/extension-version";
import { version as BUILD_VERSION } from "../../shared/shared";
import { friendlyErrorMessage } from "@/utils/user-error";
import * as panelStore from "@/lib/userdata-store";
import { clearAllActivePackStorageKeys } from "@/lib/utils/pack-host";
import { clearCaptionControlsCache, getStoredCaptionsLocalRoot, setCaptionsLocalRoot, } from "../styles";
import { BRAND } from "@brands";
import { StyledSelect } from "./StyledSelect";
const ACCENT_PILL = "pill-brand";
function ToggleRow({ label, hint, checked, onChange, }) {
    return (_jsxs("label", { className: "flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-white/[0.03]", children: [_jsx("input", { type: "checkbox", checked: checked, onChange: (e) => onChange(e.target.checked), className: "mt-0.5 size-3.5 accent-[rgb(var(--primary))]" }), _jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block text-xs text-foreground", children: label }), hint && _jsx("span", { className: "block text-[10px] text-muted-foreground", children: hint })] })] }));
}
function PathBrowse({ value, disabled, onBrowse }) {
    return (_jsxs("div", { className: "mt-1 flex gap-1.5", children: [_jsx("input", { type: "text", readOnly: true, disabled: disabled, value: value, placeholder: "No folder selected", className: "min-w-0 flex-1 rounded-lg border border-white/10 bg-background/40 px-2.5 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground disabled:opacity-40" }), _jsxs("button", { type: "button", disabled: disabled, onClick: onBrowse, className: "flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-secondary/60 px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40", children: [_jsx(FolderOpen, { className: "size-3.5" }), "Browse"] })] }));
}
function ConfirmDialog({ title, body, confirmLabel, destructive, onConfirm, onCancel, }) {
    return (_jsx("div", { className: "absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm", children: _jsxs("div", { className: "w-full max-w-xs glass-card rounded-[20px] p-4", children: [_jsx("h3", { className: "text-sm font-semibold text-foreground", children: title }), _jsx("p", { className: "mt-1 text-[11px] text-muted-foreground", children: body }), _jsxs("div", { className: "mt-3 flex gap-2", children: [_jsx("button", { type: "button", onClick: onConfirm, className: cn("flex flex-1 items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium", destructive ? "border border-destructive/50 bg-destructive/20 text-destructive" : ACCENT_PILL), children: confirmLabel }), _jsx("button", { type: "button", onClick: onCancel, className: "flex flex-1 items-center justify-center rounded-full border border-white/10 bg-secondary/60 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground", children: "Cancel" })] })] }) }));
}
export function SettingsPanel({ onBack }) {
    const { prefs, setPrefs, auth, signedIn, subscription } = useAuth();
    const { refreshStyles } = useConfiguration();
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const isAdmin = isReleaseAdminEmail(auth.email);
    const EXTENSION_VERSION = getEffectiveLocalVersion(BUILD_VERSION);
    const [versions, setVersions] = useState([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [versionsError, setVersionsError] = useState(null);
    const [selectedVersion, setSelectedVersion] = useState("");
    const [pointerStable, setPointerStable] = useState(null);
    const [pointerBeta, setPointerBeta] = useState(null);
    const [installBusy, setInstallBusy] = useState(false);
    const [installProgress, setInstallProgress] = useState();
    const [installError, setInstallError] = useState(null);
    const [packagesScanMsg, setPackagesScanMsg] = useState(null);
    const [captionsLocalPath, setCaptionsLocalPath] = useState(() => getStoredCaptionsLocalRoot());
    const [captionsSourceMsg, setCaptionsSourceMsg] = useState(null);
    useEffect(() => {
        if (!isAdmin)
            return;
        let cancelled = false;
        setVersionsLoading(true);
        setVersionsError(null);
        fetchSpunkramVersions().then((data) => {
            if (cancelled)
                return;
            setVersionsLoading(false);
            if (!data) {
                setVersionsError("Could not load version list (deploy next-app + sign in).");
                return;
            }
            setVersions(data.versions);
            setPointerStable(data.current.stable);
            setPointerBeta(data.current.beta);
            const preferred = data.versions.find((v) => v.version === EXTENSION_VERSION) ||
                data.versions[0];
            if (preferred)
                setSelectedVersion(preferred.version);
        });
        return () => {
            cancelled = true;
        };
    }, [isAdmin]);
    const selectedEntry = useMemo(() => versions.find((v) => v.version === selectedVersion), [versions, selectedVersion]);
    const canInstall = Boolean(selectedEntry?.zxpUrl) &&
        Boolean(selectedEntry?.version) &&
        compareVersions(selectedEntry.version, EXTENSION_VERSION) !== 0 &&
        !installBusy;
    async function installSelectedVersion() {
        if (!selectedEntry?.zxpUrl || installBusy)
            return;
        setInstallBusy(true);
        setInstallError(null);
        setInstallProgress(`Downloading v${selectedEntry.version}…`);
        try {
            await applyExtensionUpdate(selectedEntry.zxpUrl, (p) => {
                if (p.phase === "download") {
                    if (p.totalBytes && p.totalBytes > 0) {
                        const pct = Math.min(99, Math.round((p.bytesReceived / p.totalBytes) * 100));
                        setInstallProgress(`Downloading v${selectedEntry.version}… ${pct}%`);
                    }
                    else {
                        setInstallProgress(`Downloading v${selectedEntry.version}…`);
                    }
                }
                else if (p.phase === "extract") {
                    setInstallProgress("Extracting…");
                }
                else if (p.phase === "apply") {
                    setInstallProgress("Applying…");
                }
                else {
                    setInstallProgress("Reloading…");
                }
            }, selectedEntry.version);
        }
        catch (err) {
            setInstallBusy(false);
            setInstallProgress(undefined);
            setInstallError(friendlyErrorMessage(err));
        }
    }
    function patch(partial) {
        setPrefs({ ...prefs, ...partial });
    }
    function browsePackages() {
        selectFolder(prefs.absCustomAbsolutePath || resolvePackagesInstallRoot(null) || "", "Select packages folder", (folder) => {
            if (!folder)
                return;
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
                }
                else if (scan.rejected > 0 && scan.added + scan.updated === 0) {
                    setPackagesScanMsg(`Found ${scan.found} pack(s), but none are licensed to your account.`);
                }
                else if (scan.added + scan.updated > 0) {
                    const rejectedNote = scan.rejected > 0 ? ` ${scan.rejected} skipped (not licensed).` : "";
                    setPackagesScanMsg(`Found ${scan.found} pack(s): ${scan.added} registered, ${scan.updated} updated.${rejectedNote}`);
                    notifyPackagesRescan(scan);
                }
                else {
                    setPackagesScanMsg(`Found ${scan.found} pack(s) — already registered.`);
                }
            })();
        });
    }
    function browseAssets() {
        selectFolder(prefs.customStockLocation || "", "Select assets folder", (folder) => patch({
            customStockLocation: folder,
            useCustomPathForAssets: 1,
        }));
    }
    async function applyCaptionsLocalSource(folder) {
        setCaptionsLocalRoot(folder);
        setCaptionsLocalPath(folder || "");
        clearCaptionControlsCache();
        setCaptionsSourceMsg(folder ? "Using local Captions folder." : "Back to CDN / API.");
        try {
            await refreshStyles();
        }
        catch {
            setCaptionsSourceMsg("Path saved — reopen Captions to refresh the grid.");
        }
    }
    function browseCaptionsSource() {
        selectFolder(captionsLocalPath || "", "Select Captions source folder (R2 layout)", (folder) => {
            if (!folder)
                return;
            void applyCaptionsLocalSource(folder);
        });
    }
    function clearCaptionsSource() {
        void applyCaptionsLocalSource(null);
    }
    function reloadExtension() {
        if (window.location?.reload)
            window.location.reload();
    }
    function resetAllSettings() {
        setBusy(true);
        setConfirm(null);
        // Match Beta: empty the prefs file; reload rebuilds defaults from scratch.
        clearPreferencesFile();
        try {
            clearAllActivePackStorageKeys((key) => panelStore.removeItem(key));
        }
        catch {
            // ignore
        }
        reloadExtension();
    }
    function removePackageFiles() {
        setBusy(true);
        setConfirm(null);
        removeAllInstalledPacks();
        try {
            clearAllActivePackStorageKeys((key) => panelStore.removeItem(key));
        }
        catch {
            // ignore
        }
        reloadExtension();
    }
    return (_jsxs("div", { className: "relative flex h-full min-h-0 flex-col", children: [_jsxs("div", { className: "mx-2.5 mt-2 flex items-center gap-2 rounded-2xl px-2.5 py-1.5 glass-bar", children: [_jsxs("button", { type: "button", onClick: onBack, className: "flex items-center gap-1 rounded-full border border-[rgb(42,36,64)] bg-[rgb(14,12,26)]/50 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-[rgb(14,12,26)]", children: [_jsx(ArrowLeft, { className: "size-3.5" }), "Back"] }), _jsxs("div", { className: "flex items-center gap-1.5 text-xs font-semibold tracking-tight text-foreground", children: [_jsx(Settings2, { className: "size-3.5 text-primary" }), "Settings"] }), _jsx("span", { className: "ml-auto rounded-full border border-[rgb(42,36,64)] bg-[rgb(14,12,26)]/50 px-2 py-0.5 text-[10px] text-muted-foreground", title: "Revision", children: EXTENSION_VERSION })] }), _jsxs("div", { className: "min-h-0 flex-1 overflow-y-auto p-2.5", children: [_jsxs("section", { className: "mb-3 glass-card rounded-[20px] p-3", children: [_jsx("h3", { className: "mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", children: "File System" }), _jsx("div", { className: "mb-1 text-xs text-foreground", children: "Packages path" }), _jsx("p", { className: "mb-1 text-[10px] text-muted-foreground", children: "Packs install under AE/ or PR/ inside this folder. Existing packs there are imported automatically when you pick or change this path." }), _jsx(PathBrowse, { value: prefs.absCustomAbsolutePath || "", onBrowse: browsePackages }), packagesScanMsg ? _jsx("p", { className: "mt-1.5 text-[10px] text-primary", children: packagesScanMsg }) : null, (prefs.absCustomAbsolutePath || "").trim() ? (_jsxs("p", { className: "mt-1.5 break-all text-[10px] text-muted-foreground", children: ["Installs go to ", resolvePackagesInstallRoot(null), "\\", "{AE|PR}"] })) : null, _jsxs("div", { className: "mt-3", children: [_jsx("div", { className: "mb-1 text-xs text-foreground", children: "Assets download path" }), _jsx("p", { className: "mb-1 text-[10px] text-muted-foreground", children: "Stock footage downloads land here. Asked on download if empty." }), _jsx(PathBrowse, { value: prefs.customStockLocation || "", onBrowse: browseAssets }), _jsx("div", { className: "mt-2", children: _jsx(ToggleRow, { label: "Use project location", hint: "Footage only \u2014 downloads next to the open project; does not change the assets path above", checked: asBool(prefs.useCurrentProjectLocation), onChange: (v) => patch({ useCurrentProjectLocation: v ? 1 : 0 }) }) })] })] }), isAdmin && (_jsxs("section", { className: "mb-3 glass-card rounded-[20px] p-3 ring-1 ring-inset ring-primary/20", children: [_jsx("h3", { className: "mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", children: "Admin \u00B7 Builds" }), _jsxs("p", { className: "mb-2 text-[10px] text-muted-foreground", children: ["All uploaded ZXPs from R2. Current: ", _jsxs("span", { className: "text-foreground", children: ["v", EXTENSION_VERSION] }), pointerBeta ? (_jsxs(_Fragment, { children: [" ", "\u00B7 beta pointer ", _jsxs("span", { className: "text-foreground", children: ["v", pointerBeta] })] })) : null, pointerStable ? (_jsxs(_Fragment, { children: [" ", "\u00B7 stable ", _jsxs("span", { className: "text-foreground", children: ["v", pointerStable] })] })) : null] }), versionsLoading ? (_jsxs("div", { className: "flex items-center gap-2 py-2 text-[11px] text-muted-foreground", children: [_jsx(Loader2, { className: "size-3.5 animate-spin" }), "Loading versions\u2026"] })) : versionsError ? (_jsx("p", { className: "text-[11px] text-destructive", children: versionsError })) : versions.length === 0 ? (_jsx("p", { className: "text-[11px] text-muted-foreground", children: "No uploaded builds found." })) : (_jsxs(_Fragment, { children: [_jsx("label", { className: "mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground", children: "Version" }), _jsx(StyledSelect, { className: "mb-2", value: selectedVersion, onChange: setSelectedVersion, disabled: installBusy, ariaLabel: "Version", options: versions.map((v) => {
                                            const tags = [];
                                            if (v.channel === "beta")
                                                tags.push("beta");
                                            else
                                                tags.push("stable");
                                            if (v.version === EXTENSION_VERSION)
                                                tags.push("installed");
                                            if (v.version === pointerBeta)
                                                tags.push("beta→");
                                            if (v.version === pointerStable)
                                                tags.push("latest→");
                                            return {
                                                value: v.version,
                                                label: `v${v.version}${tags.length ? ` (${tags.join(", ")})` : ""}`,
                                            };
                                        }) }), _jsxs("button", { type: "button", disabled: !canInstall, onClick: () => void installSelectedVersion(), className: cn("flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-opacity", ACCENT_PILL, !canInstall && "cursor-not-allowed opacity-50"), children: [installBusy ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : _jsx(ArrowUpCircle, { className: "size-3.5" }), installBusy
                                                ? installProgress || "Installing…"
                                                : selectedEntry?.version === EXTENSION_VERSION
                                                    ? "Already installed"
                                                    : `Install v${selectedVersion || "…"}`] }), installError && _jsx("p", { className: "mt-1.5 text-[11px] text-destructive", children: installError })] }))] })), isAdmin && (_jsxs("section", { className: "mb-3 glass-card rounded-[20px] p-3 ring-1 ring-inset ring-primary/20", children: [_jsx("h3", { className: "mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", children: "Admin \u00B7 Captions source" }), _jsxs("p", { className: "mb-2 text-[10px] text-muted-foreground", children: ["Local folder with the same layout as R2 (", _jsxs("span", { className: "text-foreground", children: [BRAND.captionsCdnPrefix, "/"] }), "): ", _jsx("span", { className: "text-foreground", children: "{Pack}/{Pack}.aep|mogrt" }), " + style folders. Clear to use CDN / API again."] }), _jsx(PathBrowse, { value: captionsLocalPath, onBrowse: browseCaptionsSource }), _jsx("div", { className: "mt-2 flex gap-1.5", children: _jsxs("button", { type: "button", disabled: !captionsLocalPath, onClick: clearCaptionsSource, className: cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-background/40 px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10", !captionsLocalPath && "cursor-not-allowed opacity-40"), children: [_jsx(X, { className: "size-3.5" }), "Clear (use CDN)"] }) }), captionsSourceMsg ? _jsx("p", { className: "mt-1.5 text-[10px] text-primary", children: captionsSourceMsg }) : null] })), _jsxs("section", { className: "glass-card rounded-[20px] p-3", children: [_jsx("h3", { className: "mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", children: "Restoring An Extension" }), _jsxs("div", { className: "flex flex-col gap-1.5", children: [_jsxs("button", { type: "button", onClick: reloadExtension, className: "flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10", children: [_jsx(RotateCcw, { className: "size-3.5" }), "Reload extension"] }), _jsxs("button", { type: "button", onClick: () => setConfirm("reset"), className: "flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10", children: [_jsx(Settings2, { className: "size-3.5" }), "Reset all settings"] }), _jsxs("button", { type: "button", onClick: () => setConfirm("remove"), className: "flex items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15", children: [_jsx(Trash2, { className: "size-3.5" }), "Remove package files"] })] }), _jsxs("p", { className: "mt-2 truncate text-[9px] text-muted-foreground", title: resolvePreferencesPath(), children: ["Prefs: ", resolvePreferencesPath()] })] })] }), confirm === "reset" && (_jsx(ConfirmDialog, { title: "Reset all settings?", body: "preferences.json will be cleared. You will need to sign in again.", confirmLabel: busy ? "Working…" : "Reset", onConfirm: resetAllSettings, onCancel: () => setConfirm(null) })), confirm === "remove" && (_jsx(ConfirmDialog, { title: "Remove package files?", body: "Clears all installed package entries from preferences.json. This cannot be undone.", confirmLabel: busy ? "Working…" : "Remove", destructive: true, onConfirm: removePackageFiles, onCancel: () => setConfirm(null) })), busy && (_jsx("div", { className: "pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40", children: _jsx(Loader2, { className: "size-5 animate-spin text-primary" }) }))] }));
}
