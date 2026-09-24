import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LoginScreen } from "@/components/login-screen";
import { UpdateBanner } from "@/components/update-banner";
import { PanelUIProvider, usePanelUI } from "@/lib/panel-ui-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { DownloadManagerProvider, useDownloadManager, } from "@/lib/download-manager-context";
import { PackagesPathGateProvider } from "@/lib/packages-path-gate";
import { useExtensionUpdate } from "@/lib/use-extension-update";
import { FootagesPanel } from "@/footages";
import { usePackWorkspace } from "@/lib/use-pack-workspace";
import { asBool, readPrefSettings } from "@/lib/api/preferences";
import { cn } from "@/lib/utils";
import { GalAccountZone, } from "./GalAccountZone";
import { GalProfileMenu } from "./GalProfileMenu";
import { GalEffectsWorkspace } from "./GalEffectsWorkspace";
import { GalBootScreen } from "./GalBootScreen";
import { GalScriptsPanel } from "./scripts/GalScriptsPanel";
import { collectPosterPathsForPreload, holdPosterWarmup, posterWarmupIdentity, preloadPosters, releasePosterWarmup, } from "@/lib/utils/preview-preload";
import logo from "./assets/logo.png";
import tabEffects from "./assets/tab-effects.png";
import tabStock from "./assets/tab-stock.png";
import tabScripts from "./assets/tab-scripts.png";
import "./gal-panel.scss";
const NAV = [
    { id: "effects", label: "Effects", icon: tabEffects },
    { id: "stock", label: "Stock", icon: tabStock },
    { id: "scripts", label: "Scripts", icon: tabScripts },
];
function DownloadFloat() {
    const { jobs, cancel, activeCount } = useDownloadManager();
    const active = jobs.filter((j) => j.status === "queued" ||
        j.status === "downloading" ||
        j.status === "installing");
    if (!activeCount || active.length === 0)
        return null;
    const top = active[0];
    const pct = Math.max(0, Math.min(100, top.progress || (top.status === "queued" ? 0 : 8)));
    const r = 16;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    const label = top.status === "queued"
        ? `Queued: ${top.pack.name}`
        : top.status === "installing"
            ? `Installing: ${top.pack.name}`
            : `Downloading: ${top.pack.name}`;
    return (_jsxs("button", { type: "button", title: `${label} — click to cancel`, "aria-label": `${label}. Cancel`, onClick: () => cancel(top.id), className: "gal-download-float", children: [_jsxs("svg", { className: "gal-download-float__ring", viewBox: "0 0 40 40", "aria-hidden": true, children: [_jsx("circle", { cx: "20", cy: "20", r: r, fill: "none", stroke: "currentColor", strokeOpacity: "0.15", strokeWidth: "2.5" }), _jsx("circle", { cx: "20", cy: "20", r: r, fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeDasharray: c, strokeDashoffset: offset })] }), top.status === "queued" ? (_jsx(Loader2, { className: "gal-download-float__spin size-4 animate-spin" })) : (_jsx("span", { className: "gal-download-float__pct", children: Math.round(pct) }))] }));
}
function galBootErrorMessage(code) {
    if (code === "NO_OFFLINE_ASSETS") {
        return "Required files are missing. Try again.";
    }
    if (code === "UNAUTHORIZED") {
        return "Session expired — sign in again, then retry.";
    }
    if (code === "NO_INSTALL_ROOT") {
        return "Could not resolve a download folder.";
    }
    return code || "Something went wrong while starting. Try again.";
}
function computeGalBootPercent(args) {
    if (!args.authReady)
        return 6;
    let pct = 10;
    pct += args.catalogReady ? 25 : 6;
    if (args.waitForAssets) {
        pct += Math.round(20 * Math.max(0, Math.min(1, args.assetsFrac)));
    }
    else {
        pct += 20;
    }
    pct += Math.round(44 * Math.max(0, Math.min(1, args.previewFrac)));
    return Math.max(4, Math.min(98, pct));
}
function GalStatusToast() {
    const { statusMessage } = usePanelUI();
    if (!statusMessage)
        return null;
    return (_jsxs("div", { role: statusMessage.tone === "error" ? "alert" : "status", className: cn("gal-status-toast", statusMessage.tone === "error" && "gal-status-toast--error", statusMessage.tone === "success" && "gal-status-toast--success"), children: [statusMessage.tone === "error" ? (_jsx(XCircle, { className: "size-3.5 shrink-0", "aria-hidden": true })) : statusMessage.tone === "success" ? (_jsx(CheckCircle2, { className: "size-3.5 shrink-0", "aria-hidden": true })) : (_jsx(Loader2, { className: "size-3.5 shrink-0 animate-spin", "aria-hidden": true })), _jsx("span", { children: statusMessage.text })] }));
}
function GalShell() {
    const { authReady, signedIn } = useAuth();
    const { setShowFavoritesOnly } = usePanelUI();
    const [nav, setNav] = useState("effects");
    const [overlay, setOverlay] = useState(null);
    const [compactTabs, setCompactTabs] = useState(false);
    const [previewFrac, setPreviewFrac] = useState(0);
    const [previewDone, setPreviewDone] = useState(false);
    const [bootPct, setBootPct] = useState(4);
    const shellRef = useRef(null);
    const bootPctRef = useRef(4);
    const uiReadyRef = useRef(false);
    const sectionsRef = useRef([]);
    const workspace = usePackWorkspace();
    sectionsRef.current = workspace.sections;
    const { localVersion, updateVersion, updateChangelog, updateChannel, updateBusy, updateProgress, updateError, hasPendingNatives, showUpdateBanner, handleApplyUpdate, } = useExtensionUpdate();
    useEffect(() => {
        const useSystem = asBool(readPrefSettings().useSystemFonts);
        document.documentElement.dataset.galFonts = useSystem ? "system" : "inter";
    }, []);
    useEffect(() => {
        const el = shellRef.current;
        if (!el || typeof ResizeObserver === "undefined")
            return;
        const update = () => {
            setCompactTabs(el.clientWidth < 400);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [authReady, signedIn]);
    const onSelectNav = useCallback((id) => {
        setOverlay(null);
        setNav(id);
        if (id !== "effects")
            setShowFavoritesOnly(false);
    }, [setShowFavoritesOnly]);
    const catalogReady = !workspace.structureLoading;
    const waitForAssets = signedIn && !workspace.galAssetsReady;
    const assetsError = workspace.galAssetsSync?.phase === "error"
        ? galBootErrorMessage(workspace.galAssetsSync.error)
        : null;
    const assetsFrac = !waitForAssets
        ? 1
        : workspace.galAssetsSync && workspace.galAssetsSync.total > 0
            ? workspace.galAssetsSync.done / workspace.galAssetsSync.total
            : workspace.galAssetsSync?.phase === "checking"
                ? 0.12
                : 0.04;
    const bootReady = signedIn &&
        catalogReady &&
        !waitForAssets &&
        previewDone &&
        !assetsError;
    useEffect(() => {
        if (!authReady || !signedIn) {
            uiReadyRef.current = false;
            bootPctRef.current = 4;
            setBootPct(4);
            setPreviewDone(false);
            setPreviewFrac(0);
            releasePosterWarmup();
        }
    }, [authReady, signedIn]);
    useEffect(() => {
        if (bootReady)
            uiReadyRef.current = true;
    }, [bootReady]);
    useEffect(() => {
        if (uiReadyRef.current)
            return;
        const next = computeGalBootPercent({
            authReady,
            catalogReady: catalogReady && signedIn,
            waitForAssets,
            assetsFrac,
            previewFrac,
        });
        const clipped = Math.max(bootPctRef.current, next);
        bootPctRef.current = clipped;
        setBootPct(clipped);
    }, [
        authReady,
        signedIn,
        catalogReady,
        waitForAssets,
        assetsFrac,
        previewFrac,
    ]);
    useEffect(() => {
        if (!authReady || !signedIn || uiReadyRef.current)
            return;
        if (workspace.structureLoading)
            return;
        if (workspace.tree.length > 0 && !workspace.activeRootId)
            return;
        if (workspace.tree.length > 0 && sectionsRef.current.length === 0)
            return;
        const rootId = workspace.activeRootId || "all";
        const identity = posterWarmupIdentity(rootId, workspace.assetsPath, workspace.assetsBaseUrl || "");
        const paths = collectPosterPathsForPreload(sectionsRef.current, {
            assetsPath: workspace.assetsPath,
            assetsBaseUrl: workspace.assetsBaseUrl,
            assetsHost: workspace.assetsHost,
            settings: workspace.packSettings,
        });
        const signal = { cancelled: false };
        setPreviewDone(false);
        setPreviewFrac(paths.length === 0 ? 1 : 0);
        void preloadPosters(paths, (done, total) => {
            if (signal.cancelled)
                return;
            setPreviewFrac(total > 0 ? done / total : 1);
        }, signal).then((cleanup) => {
            if (signal.cancelled) {
                cleanup();
                return;
            }
            holdPosterWarmup(identity, cleanup);
            setPreviewFrac(1);
            setPreviewDone(true);
        });
        return () => {
            signal.cancelled = true;
        };
    }, [
        authReady,
        signedIn,
        workspace.structureLoading,
        workspace.tree.length,
        workspace.activeRootId,
        workspace.assetsPath,
        workspace.assetsBaseUrl,
        workspace.assetsHost,
        workspace.packSettings,
        workspace.sections.length,
    ]);
    if (!authReady || (signedIn && !bootReady && !assetsError)) {
        return _jsx(GalBootScreen, { percent: bootPct });
    }
    if (!signedIn)
        return _jsx(LoginScreen, {});
    if (assetsError && !workspace.galAssetsReady) {
        return (_jsx(GalBootScreen, { percent: bootPct, error: assetsError, onRetry: () => workspace.retryGalAssetsSync() }));
    }
    return (_jsxs("div", { className: "gal-shell", ref: shellRef, children: [!overlay ? (_jsxs("header", { className: "gal-toolbar", children: [_jsxs("button", { type: "button", className: "gal-toolbar__brand", onClick: () => setOverlay("settings"), "aria-label": "Open settings", children: [_jsx("img", { className: "gal-toolbar__logo", src: logo, alt: "", draggable: false }), _jsxs("span", { className: "gal-toolbar__version", title: `Panel v${localVersion}`, children: ["v", localVersion] })] }), _jsx("div", { className: compactTabs ? "gal-pills is-compact" : "gal-pills", role: "tablist", "aria-label": "Gal", children: NAV.map((item) => (_jsxs("button", { type: "button", role: "tab", "aria-selected": nav === item.id, "aria-label": item.label, title: item.label, className: nav === item.id ? "is-active" : undefined, onClick: () => onSelectNav(item.id), children: [_jsx("img", { className: "gal-pills__icon", src: item.icon, alt: "", width: 16, height: 16, draggable: false }), _jsx("span", { className: "gal-pills__label", children: item.label })] }, item.id))) }), _jsx(GalProfileMenu, { onOpenProfile: () => setOverlay("profile"), onOpenSettings: () => setOverlay("settings") })] })) : null, showUpdateBanner && updateVersion ? (_jsx("div", { className: "gal-update-banner", children: _jsx(UpdateBanner, { version: updateVersion, localVersion: localVersion, changelog: updateChangelog, channel: updateChannel, busy: updateBusy, progressLabel: updateProgress, error: updateError, onUpdate: handleApplyUpdate }) })) : null, hasPendingNatives && !showUpdateBanner ? (_jsx("div", { className: "gal-native-pending", role: "status", children: "Native plugin update pending. Restart Premiere Pro / After Effects to complete." })) : null, _jsx("div", { className: "gal-shell__body", children: overlay ? (_jsx(GalAccountZone, { tab: overlay, onTabChange: setOverlay, onClose: () => setOverlay(null), onPackReady: (meta) => {
                        workspace.applyPack(meta);
                    } })) : nav === "effects" ? (_jsx(GalEffectsWorkspace, { workspace: workspace })) : nav === "stock" ? (_jsx("div", { className: "gal-stock", children: _jsx(FootagesPanel, {}) })) : (_jsx(GalScriptsPanel, {})) }), _jsx(DownloadFloat, {}), _jsx(GalStatusToast, {})] }));
}
export function GalApp() {
    return (_jsx(AuthProvider, { children: _jsx(PanelUIProvider, { children: _jsx(NotificationsProvider, { children: _jsx(PackagesPathGateProvider, { children: _jsx(DownloadManagerProvider, { children: _jsx(GalShell, {}) }) }) }) }) }));
}
