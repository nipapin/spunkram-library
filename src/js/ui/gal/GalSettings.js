import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Download, Folder, FolderOpen, Loader2, RefreshCw, X, } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useDownloadManager } from "@/lib/download-manager-context";
import { usePackagesPathGate } from "@/lib/packages-path-gate";
import { useExtensionUpdate } from "@/lib/use-extension-update";
import { asBool, clearPreferencesFile, } from "@/lib/api/preferences";
import { selectFolder } from "@/lib/utils/bolt";
import { notifyPackagesRescan, resolvePackagesInstallRoot, scanAndRegisterPacksAtRoot, } from "@/lib/utils/pack-install";
import { resolvePackEntitlementContextForScan } from "@/api/cep-market";
import { clearAllActivePackStorageKeys, currentPackHost, } from "@/lib/utils/pack-host";
import { readInstallablePackages } from "@/lib/utils/pack";
import * as panelStore from "@/lib/userdata-store";
import { BRAND } from "@brands";
import { isReleaseAdminEmail } from "@/api/update";
import { useConfiguration } from "../../../context/ConfigurationWrapper";
import { clearCaptionControlsCache, getStoredCaptionsLocalRoot, setCaptionsLocalRoot, } from "@/styles";
import { openDirectoryInOs } from "./gal-fs";
import aeIcon from "./assets/ae-icon.png";
import prIcon from "./assets/pr-icon.png";
import "./gal-settings.scss";
export function GalSettings({ onPackReady, }) {
    const { prefs, setPrefs, signedIn, subscription, refreshMarket, market, auth, } = useAuth();
    const { refreshStyles } = useConfiguration();
    const isAdmin = isReleaseAdminEmail(auth.email);
    const { enqueue, jobs } = useDownloadManager();
    const { ensurePackagesPath } = usePackagesPathGate();
    const { localVersion, updateVersion, checkForUpdates, checkBusy, handleApplyUpdate, updateBusy, showUpdateBanner, } = useExtensionUpdate();
    const [confirmReset, setConfirmReset] = useState(false);
    const [busy, setBusy] = useState(false);
    const [scanMsg, setScanMsg] = useState(null);
    const [message, setMessage] = useState(null);
    const [captionsLocalPath, setCaptionsLocalPath] = useState(() => getStoredCaptionsLocalRoot());
    const [captionsSourceMsg, setCaptionsSourceMsg] = useState(null);
    const host = currentPackHost();
    const hostIcon = host === "AE" ? aeIcon : prIcon;
    const installed = useMemo(() => readInstallablePackages(host), [host, jobs]);
    const marketPack = useMemo(() => {
        const packs = market?.Packages ?? [];
        if (!host)
            return packs[0] ?? null;
        return (packs.find((p) => (p.primary_type || "").toUpperCase() === host) ||
            packs[0] ||
            null);
    }, [market?.Packages, host]);
    const activeJob = useMemo(() => {
        if (!marketPack)
            return null;
        return (jobs.find((j) => j.pack.id === marketPack.id &&
            (j.status === "queued" ||
                j.status === "downloading" ||
                j.status === "installing")) ?? null);
    }, [jobs, marketPack]);
    const packInstalled = installed.length > 0;
    const needsUpdate = !!marketPack && marketPack.action === "update";
    useEffect(() => {
        void refreshMarket(false);
    }, [refreshMarket]);
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
                    setScanMsg("Folder saved. No pack files found under AE/ or PR/ yet.");
                }
                else if (scan.rejected > 0 && scan.added + scan.updated === 0) {
                    setScanMsg(`Found ${scan.found} pack(s), but none are licensed.`);
                }
                else if (scan.added + scan.updated > 0) {
                    setScanMsg(`Found ${scan.found} pack(s): ${scan.added} registered, ${scan.updated} updated.`);
                    notifyPackagesRescan(scan);
                }
                else {
                    setScanMsg(`Found ${scan.found} pack(s) — already registered.`);
                }
            })();
        });
    }
    function browseAssets() {
        selectFolder(prefs.customStockLocation || "", "Select stock assets folder", (folder) => {
            if (!folder)
                return;
            patch({
                customStockLocation: folder,
                useCustomPathForAssets: 1,
            });
        });
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
        setConfirmReset(false);
        clearPreferencesFile();
        try {
            clearAllActivePackStorageKeys((key) => panelStore.removeItem(key));
        }
        catch {
            // ignore
        }
        reloadExtension();
    }
    async function handleInstall() {
        setMessage(null);
        if (!marketPack) {
            setMessage("No pack available for this host.");
            return;
        }
        if (!(await ensurePackagesPath()))
            return;
        enqueue(marketPack, {
            useWhenReady: true,
            onReady: (meta) => {
                onPackReady?.(meta);
                setMessage("Pack ready.");
            },
        });
    }
    const downloadLabel = activeJob
        ? activeJob.status === "installing"
            ? "Installing…"
            : `Downloading ${Math.round(activeJob.progress || 0)}%`
        : needsUpdate
            ? "Update pack"
            : packInstalled
                ? "Installed"
                : "Download pack";
    const apiServer = Number(prefs.defaultApiServer) === 1 ? 1 : 0;
    const useSystemFonts = asBool(prefs.useSystemFonts);
    const useProjectFolder = asBool(prefs.useCurrentProjectLocation);
    return (_jsxs("div", { className: "gal-settings gal-settings--embedded", children: [_jsxs("div", { className: "gal-settings__body", children: [_jsx("header", { className: "gal-settings__page-head", children: _jsx("h1", { className: "gal-settings__page-title", children: "Settings" }) }), _jsxs("section", { className: "gal-settings__group", children: [_jsxs("div", { className: "gal-settings__row gal-settings__row--pack", children: [_jsx("img", { className: "gal-settings__host-icon", src: hostIcon, alt: "", width: 28, height: 28 }), _jsxs("div", { className: "gal-settings__row-copy", children: [_jsx("p", { className: "gal-settings__row-title", children: marketPack?.name || BRAND.panelDisplayName }), _jsxs("p", { className: "gal-settings__row-sub", children: ["Pack ", marketPack?.version || "—", " \u00B7 Panel v", localVersion] })] }), _jsx("button", { type: "button", className: "gal-settings__row-action", onClick: () => void handleInstall(), disabled: !!activeJob || (!needsUpdate && packInstalled && !marketPack), "aria-label": downloadLabel, title: downloadLabel, children: activeJob ? (_jsx(Loader2, { className: "size-3.5 animate-spin" })) : (_jsx(Download, { className: "size-3.5" })) })] }), _jsx("div", { className: "gal-settings__divider" }), _jsxs("div", { className: "gal-settings__row", children: [_jsxs("div", { className: "gal-settings__row-copy", children: [_jsx("p", { className: "gal-settings__row-title", children: "Updates" }), _jsx("p", { className: "gal-settings__row-sub", children: showUpdateBanner && updateVersion
                                                    ? `v${updateVersion} available`
                                                    : `Current v${localVersion}` })] }), showUpdateBanner && updateVersion ? (_jsxs("button", { type: "button", className: "gal-settings__pill-btn", disabled: updateBusy, onClick: () => void handleApplyUpdate(), children: [updateBusy ? (_jsx(Loader2, { className: "size-3 animate-spin" })) : null, "Install"] })) : (_jsxs("button", { type: "button", className: "gal-settings__pill-btn", disabled: checkBusy, onClick: () => void checkForUpdates(), children: [checkBusy ? (_jsx(Loader2, { className: "size-3 animate-spin" })) : (_jsx(RefreshCw, { className: "size-3" })), "Check Updates"] }))] })] }), message ? _jsx("p", { className: "gal-settings__msg", children: message }) : null, _jsx("p", { className: "gal-settings__section-label", children: "File System" }), _jsxs("section", { className: "gal-settings__group", children: [_jsxs("div", { className: "gal-settings__field", children: [_jsx("label", { className: "gal-settings__field-label", children: "Package Installation Directory" }), _jsxs("div", { className: "gal-settings__path-row", children: [_jsx("input", { type: "text", readOnly: true, value: prefs.absCustomAbsolutePath || "", placeholder: "Select a folder\u2026", className: "gal-settings__input" }), _jsx("button", { type: "button", className: "gal-settings__icon-btn", onClick: browsePackages, "aria-label": "Browse packages folder", children: _jsx(Folder, { className: "size-3.5" }) }), _jsx("button", { type: "button", className: "gal-settings__icon-btn", onClick: () => openDirectoryInOs(prefs.absCustomAbsolutePath || ""), "aria-label": "Open packages folder", children: _jsx(FolderOpen, { className: "size-3.5" }) })] }), _jsx("p", { className: "gal-settings__note", children: "Changing the path moves packages to the new destination." }), scanMsg ? _jsx("p", { className: "gal-settings__msg", children: scanMsg }) : null] }), _jsx("div", { className: "gal-settings__divider" }), _jsxs("div", { className: "gal-settings__field", children: [_jsx("label", { className: "gal-settings__field-label", children: "Stock Assets Directory" }), _jsxs("div", { className: "gal-settings__path-row", children: [_jsx("input", { type: "text", readOnly: true, value: prefs.customStockLocation || "", placeholder: "Select a folder\u2026", className: "gal-settings__input" }), _jsx("button", { type: "button", className: "gal-settings__icon-btn", onClick: browseAssets, "aria-label": "Browse stock folder", children: _jsx(Folder, { className: "size-3.5" }) }), _jsx("button", { type: "button", className: "gal-settings__icon-btn", onClick: () => openDirectoryInOs(prefs.customStockLocation || ""), "aria-label": "Open stock folder", children: _jsx(FolderOpen, { className: "size-3.5" }) })] })] }), _jsx("div", { className: "gal-settings__divider" }), _jsxs("label", { className: "gal-settings__toggle-row", children: [_jsx("span", { children: "Use Project Folder" }), _jsx("input", { type: "checkbox", className: "gal-settings__switch", checked: useProjectFolder, onChange: (e) => patch({ useCurrentProjectLocation: e.target.checked ? 1 : 0 }) })] })] }), _jsx("p", { className: "gal-settings__section-label", children: "API Server" }), _jsxs("section", { className: "gal-settings__group", children: [_jsx("p", { className: "gal-settings__group-note", children: "Change the server if package downloads fail." }), _jsxs("label", { className: "gal-settings__choice", children: [_jsx("input", { type: "radio", name: "defaultApiServer", checked: apiServer === 0, onChange: () => patch({ defaultApiServer: 0 }) }), _jsx("span", { children: "Main API Server" })] }), _jsx("div", { className: "gal-settings__divider" }), _jsxs("label", { className: "gal-settings__choice", children: [_jsx("input", { type: "radio", name: "defaultApiServer", checked: apiServer === 1, onChange: () => patch({ defaultApiServer: 1 }) }), _jsx("span", { children: "Proxy Server #1" })] })] }), _jsx("p", { className: "gal-settings__section-label", children: "UI" }), _jsx("section", { className: "gal-settings__group", children: _jsxs("label", { className: "gal-settings__toggle-row", children: [_jsxs("span", { children: ["Use System Fonts", _jsx("small", { children: "Reload required" })] }), _jsx("input", { type: "checkbox", className: "gal-settings__switch", checked: useSystemFonts, onChange: (e) => {
                                        patch({ useSystemFonts: e.target.checked ? 1 : 0 });
                                    } })] }) }), isAdmin ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "gal-settings__section-label", children: "Admin \u00B7 Captions source" }), _jsxs("section", { className: "gal-settings__group", children: [_jsxs("p", { className: "gal-settings__group-note", children: ["Local folder with the same layout as R2 (", _jsxs("strong", { children: [BRAND.captionsCdnPrefix, "/"] }), "): ", "{Pack}/{Pack}.aep|mogrt", " + style folders. Clear to use CDN / API again."] }), _jsxs("div", { className: "gal-settings__field", children: [_jsxs("div", { className: "gal-settings__path-row", children: [_jsx("input", { type: "text", readOnly: true, value: captionsLocalPath, placeholder: "CDN / API (default)", className: "gal-settings__input" }), _jsx("button", { type: "button", className: "gal-settings__icon-btn", onClick: browseCaptionsSource, "aria-label": "Browse captions source folder", children: _jsx(Folder, { className: "size-3.5" }) }), _jsx("button", { type: "button", className: "gal-settings__icon-btn", disabled: !captionsLocalPath, onClick: clearCaptionsSource, "aria-label": "Clear captions source", title: "Clear (use CDN)", children: _jsx(X, { className: "size-3.5" }) })] }), captionsSourceMsg ? (_jsx("p", { className: "gal-settings__msg", children: captionsSourceMsg })) : null] })] })] })) : null, _jsx("p", { className: "gal-settings__section-label", children: "Restoring" }), _jsx("section", { className: "gal-settings__group", children: _jsx("button", { type: "button", className: "gal-settings__danger-row", onClick: () => setConfirmReset(true), children: "Reset all settings" }) })] }), confirmReset ? (_jsx("div", { className: "gal-settings__confirm", children: _jsxs("div", { className: "gal-settings__confirm-card", children: [_jsx("h3", { children: "Reset all settings?" }), _jsx("p", { children: "preferences.json will be cleared. You will need to sign in again." }), _jsxs("div", { className: "gal-settings__confirm-actions", children: [_jsxs("button", { type: "button", onClick: resetAllSettings, disabled: busy, children: [busy ? _jsx(Loader2, { className: "size-3.5 animate-spin" }) : null, "Reset"] }), _jsx("button", { type: "button", onClick: () => setConfirmReset(false), children: "Cancel" })] })] }) })) : null] }));
}
