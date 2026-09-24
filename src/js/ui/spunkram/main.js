import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Lock, ArrowUpRight, X, XCircle } from "lucide-react";
import { PanelHeader } from "@/components/panel-header";
import { PanelToolbar } from "@/components/panel-toolbar";
import { PanelSidebar } from "@/components/panel-sidebar";
import { FootageGrid } from "@/components/footage-grid";
import { TutorialsPanel } from "@/components/tutorials-panel";
import { PanelFooter } from "@/components/panel-footer";
import { AiToolsPanel } from "@/components/ai-tools-panel";
import { AiToolsPlanDialog } from "@/components/AiToolsPlanDialog";
import { MarketPanel } from "@/components/market-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { AccountPanel } from "@/components/account-panel";
import { LoginScreen } from "@/components/login-screen";
import { UpdateBanner } from "@/components/update-banner";
import { SpunkramBootLoader } from "@/components/spunkram-boot-loader";
import { FootagesPanel } from "@/footages";
import { PanelUIProvider, usePanelUI } from "@/lib/panel-ui-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { DownloadManagerProvider, useDownloadManager, } from "@/lib/download-manager-context";
import { PackagesPathGateProvider } from "@/lib/packages-path-gate";
import { useExtensionUpdate } from "@/lib/use-extension-update";
import { ensureFfmpeg } from "@/utils/ffmpeg";
import { openMarketUrl, resolvePackEntitlementContextForScan } from "@/api/cep-market";
import { useGenerationsBalance } from "@/hooks/use-generations-balance";
import { readInstallablePackages, loadInstalledPack, packInitErrorMessage, } from "@/lib/utils/pack";
import { PACKAGES_RESCAN_EVENT, scanAndRegisterPacksAtRoot, } from "@/lib/utils/pack-install";
import { buildPackEntitlementContext, isPackEntitled, } from "@/lib/utils/pack-entitlement";
import { readPrefSettings } from "@/lib/api/preferences";
import { reportActivePacks } from "@/api/telemetry";
import { activePackStorageKey, currentPackHost, LEGACY_ACTIVE_PACK_STORAGE_KEY, packMetaMatchesHost, } from "@/lib/utils/pack-host";
import { buildPackTree, collectAllContentSections, collectContentSections, filterContentSections, filterFavoriteSections, findPackTreeNode, getFirstPackRoot, } from "@/lib/utils/pack-tree";
import { cn } from "@/lib/utils";
import * as panelStore from "@/lib/userdata-store";
import { storageKey } from "@brands";
import "./main.scss";
const CATEGORY_BY_PACK_KEY = storageKey("categoryByPack");
function hostActivePackKey(host = currentPackHost()) {
    return host ? activePackStorageKey(host) : null;
}
function readActivePackPath(host = currentPackHost()) {
    const key = hostActivePackKey(host);
    if (!key)
        return null;
    try {
        const scoped = panelStore.getItem(key);
        if (scoped)
            return scoped;
        // One-time migration from pre-split key: only if path is in this host's list.
        const legacy = panelStore.getItem(LEGACY_ACTIVE_PACK_STORAGE_KEY);
        if (!legacy || !host)
            return null;
        const match = readInstallablePackages(host).some((p) => p.path === legacy);
        if (!match)
            return null;
        panelStore.setItem(key, legacy);
        return legacy;
    }
    catch {
        return null;
    }
}
function writeActivePackPath(packPath, host = currentPackHost()) {
    const key = hostActivePackKey(host);
    if (!key || !packPath)
        return;
    try {
        panelStore.setItem(key, packPath);
    }
    catch {
        // ignore storage errors
    }
}
function loadCategoryByPack() {
    try {
        const raw = panelStore.getItem(CATEGORY_BY_PACK_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return {};
        const out = {};
        for (const [path, id] of Object.entries(parsed)) {
            if (typeof id === "string" && id)
                out[path] = id;
        }
        return out;
    }
    catch {
        return {};
    }
}
function persistCategoryForPack(packPath, categoryId) {
    if (!packPath || !categoryId)
        return;
    try {
        const map = loadCategoryByPack();
        if (map[packPath] === categoryId)
            return;
        map[packPath] = categoryId;
        panelStore.setItem(CATEGORY_BY_PACK_KEY, JSON.stringify(map));
    }
    catch {
        // ignore storage errors
    }
}
function resolveCategoryForPack(tree, packPath) {
    const saved = loadCategoryByPack()[packPath];
    if (saved && findPackTreeNode(tree, saved))
        return saved;
    return getFirstPackRoot(tree)?.id ?? "";
}
function PurchaseGateBanner({ onOpenAccount }) {
    return (_jsxs("div", { className: "mx-2.5 mt-2.5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200", children: [_jsx(Lock, { className: "size-3.5 shrink-0" }), _jsx("span", { className: "flex-1", children: "Free plan includes 1 free pack. Subscribe or buy a pack to unlock this content." }), _jsx("button", { type: "button", onClick: onOpenAccount, className: "shrink-0 rounded-full bg-amber-500/20 px-2.5 py-1 font-medium text-amber-100 transition-colors hover:bg-amber-500/30", children: "Upgrade" })] }));
}
function FreePlanBanner({ onOpenAccount }) {
    const { generationLimit, freePackSlots } = useAuth();
    const packPart = freePackSlots != null
        ? `${freePackSlots} free pack${freePackSlots === 1 ? "" : "s"} (coming soon)`
        : "Free pack slot (coming soon)";
    const genPart = generationLimit != null ? `${generationLimit} AI generations` : "AI generations included";
    return (_jsxs("div", { className: "mx-2.5 mt-2.5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2 text-[11px] text-foreground", children: [_jsxs("span", { className: "flex-1", children: ["Free plan: ", packPart, " \u00B7 ", genPart] }), _jsx("button", { type: "button", onClick: onOpenAccount, className: "shrink-0 rounded-full bg-primary/20 px-2.5 py-1 font-medium text-primary transition-colors hover:bg-primary/30", children: "Upgrade" })] }));
}
function DownloadFloat() {
    const { jobs, cancel, activeCount } = useDownloadManager();
    const active = jobs.filter((j) => j.status === "queued" ||
        j.status === "downloading" ||
        j.status === "installing");
    if (activeCount === 0 || active.length === 0)
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
    return (_jsxs("button", { type: "button", title: `${label} — click to cancel`, "aria-label": `${label}. Cancel`, onClick: () => cancel(top.id), className: "absolute bottom-3 right-3 z-40 flex size-11 items-center justify-center rounded-full border border-primary/40 bg-card/95 text-primary shadow-lg shadow-black/40 backdrop-blur transition hover:border-destructive/50 hover:text-destructive", children: [_jsxs("svg", { className: "absolute inset-0 size-full -rotate-90 p-0.5", viewBox: "0 0 40 40", "aria-hidden": true, children: [_jsx("circle", { cx: "20", cy: "20", r: r, fill: "none", stroke: "currentColor", strokeOpacity: "0.15", strokeWidth: "2.5" }), _jsx("circle", { cx: "20", cy: "20", r: r, fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeDasharray: c, strokeDashoffset: offset, className: "transition-[stroke-dashoffset] duration-300" })] }), top.status === "queued" ? (_jsx(Loader2, { className: "relative size-4 animate-spin" })) : (_jsx("span", { className: "relative text-[9px] font-bold tabular-nums text-foreground", children: Math.round(pct) })), active.length > 1 ? (_jsx("span", { className: "absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground", children: active.length })) : null] }));
}
function StatusToast({ onOpenMarket }) {
    const { statusMessage, clearStatus } = usePanelUI();
    if (!statusMessage)
        return null;
    const card = statusMessage.card;
    if (card) {
        const img = card.imageUrl?.trim() || "";
        return (_jsx("div", { className: "pointer-events-none absolute bottom-3 left-3 z-30 w-[min(100%-1.5rem,300px)]", children: _jsx("div", { className: "overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-card via-card to-primary/20 shadow-2xl shadow-black/50 ring-1 ring-inset ring-white/10", children: _jsxs("div", { className: "flex gap-0", children: [_jsxs("div", { className: "flex min-w-0 flex-1 flex-col justify-between gap-3 p-3.5 pr-2", children: [_jsxs("div", { className: "min-w-0", children: [card.subtitle ? (_jsx("p", { className: "text-[10px] font-semibold uppercase tracking-wide text-primary", children: card.subtitle })) : null, _jsx("p", { className: "mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-foreground", children: card.title })] }), _jsxs("button", { type: "button", className: "pointer-events-auto inline-flex w-fit items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground", onClick: () => {
                                        if (card.detailsUrl)
                                            openMarketUrl(card.detailsUrl);
                                        else
                                            onOpenMarket?.();
                                        clearStatus();
                                    }, children: [_jsx("span", { className: "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground", children: _jsx(ArrowUpRight, { className: "size-3", strokeWidth: 2.5 }) }), "Details"] })] }), _jsxs("div", { className: "relative w-[108px] shrink-0 self-stretch bg-black/30", children: [img ? (_jsx("img", { src: img, alt: "", className: "absolute inset-0 size-full object-cover" })) : (_jsx("div", { className: "absolute inset-0 bg-gradient-to-br from-primary/40 to-primary/10" })), _jsx("div", { className: "absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-card/40" })] })] }) }) }));
    }
    return (_jsxs("div", { role: statusMessage.tone === "error" ? "alert" : "status", className: cn("pointer-events-none absolute bottom-3 left-1/2 z-40 flex w-[min(100%-1.25rem,360px)] -translate-x-1/2 items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-medium leading-snug shadow-xl backdrop-blur-md", statusMessage.tone === "error"
            ? "border-rose-400/35 bg-[#1a1014]/95 text-rose-100"
            : statusMessage.tone === "success"
                ? "border-emerald-500/30 bg-emerald-950/90 text-emerald-100"
                : "border-white/10 bg-card/95 text-foreground"), children: [statusMessage.tone === "error" ? (_jsx(XCircle, { className: "mt-0.5 size-4 shrink-0 text-rose-300" })) : statusMessage.tone === "success" ? (_jsx(CheckCircle2, { className: "mt-0.5 size-4 shrink-0 text-emerald-300" })) : null, _jsx("span", { className: "min-w-0 flex-1 pt-px", children: statusMessage.text }), _jsx("button", { type: "button", "aria-label": "Dismiss", className: "pointer-events-auto mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white", onClick: clearStatus, children: _jsx(X, { className: "size-3.5", strokeWidth: 2.5 }) })] }));
}
function EditingWorkspace({ tree, category, setCategory, query, setQuery, tutorialsOpen, setTutorialsOpen, assetsPath, packFilePath, packSettings, packError, onOpenAccount, }) {
    const { showFavoritesOnly, favoriteIds, focusMode } = usePanelUI();
    const { signedIn, subscription, market, isFreeUser } = useAuth();
    const entitlementCtx = useMemo(() => buildPackEntitlementContext({
        signedIn,
        subscriptionActive: subscription.subscribed,
        purchases: subscription.purchases,
        catalog: market?.Packages ?? [],
    }), [signedIn, subscription.subscribed, subscription.purchases, market?.Packages]);
    const activePackMeta = useMemo(() => {
        if (!packSettings?.main.name || !packFilePath)
            return null;
        return {
            name: packSettings.main.name,
            author: packSettings.main.cc_author_username || "Unknown",
            version: packSettings.main.version || "1.0",
            path: packFilePath,
            appID: packSettings.main.software_id,
            appVersion: packSettings.main.software_version,
        };
    }, [packSettings, packFilePath]);
    const canApply = useMemo(() => activePackMeta != null && isPackEntitled(activePackMeta, entitlementCtx), [activePackMeta, entitlementCtx]);
    const packRequiresPurchase = !!packSettings?.main.required_purchase_code;
    const allSections = useMemo(() => (tree.length ? collectAllContentSections(tree) : []), [tree]);
    const sections = useMemo(() => {
        if (!tree.length)
            return [];
        const hasQuery = query.trim().length > 0;
        if (showFavoritesOnly) {
            return filterContentSections(filterFavoriteSections(allSections, favoriteIds), query);
        }
        // Global search across the whole pack, independent of sidebar selection.
        if (hasQuery) {
            return filterContentSections(allSections, query);
        }
        const node = findPackTreeNode(tree, category) ?? getFirstPackRoot(tree);
        if (!node)
            return [];
        return filterContentSections(collectContentSections(node), "");
    }, [tree, allSections, category, query, showFavoritesOnly, favoriteIds]);
    // Subscribers / owned / purchased packs only — verified against market + /me.
    // When user isn't entitled to the pack, all items are locked.
    const isLocked = useCallback((item) => !canApply, [canApply]);
    return (_jsxs(_Fragment, { children: [!canApply && signedIn && packRequiresPurchase && (_jsx(PurchaseGateBanner, { onOpenAccount: onOpenAccount })), signedIn && isFreeUser && !packRequiresPurchase && (_jsx(FreePlanBanner, { onOpenAccount: onOpenAccount })), _jsx(PanelToolbar, { tutorialsOpen: tutorialsOpen, onToggleTutorials: () => setTutorialsOpen(!tutorialsOpen), query: query, onQuery: setQuery, packName: packSettings?.main.name }), _jsx("div", { className: "flex min-h-0 flex-1", children: tutorialsOpen ? (_jsx("div", { className: "min-h-0 min-w-0 flex-1", children: _jsx(TutorialsPanel, { activePackName: packSettings?.main.name ?? "" }) })) : (_jsxs(_Fragment, { children: [!focusMode && (_jsx(PanelSidebar, { tree: tree, active: category, onSelect: setCategory })), packError ? (_jsx("div", { className: "flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground", children: packError })) : (_jsx("div", { className: "min-h-0 min-w-0 flex-1 overflow-y-auto p-2.5", children: _jsx(FootageGrid, { sections: sections, assetsPath: assetsPath, packFilePath: packFilePath, settings: packSettings, isLocked: isLocked, rootId: category }) }))] })) }), _jsx(PanelFooter, {})] }));
}
function AppShell() {
    const { signedIn, authReady, refreshMarket, subscription } = useAuth();
    const gens = useGenerationsBalance();
    const { setShowFavoritesOnly, showStatus } = usePanelUI();
    const { localVersion, updateVersion, updateChangelog, updateChannel, updateBusy, updateProgress, updateError, hasPendingNatives, showUpdateBanner, handleApplyUpdate, } = useExtensionUpdate();
    const [nav, setNav] = useState(() => readInstallablePackages().length === 0 ? "market" : "editing");
    const [prevNav, setPrevNav] = useState(null);
    const [tutorialsOpen, setTutorialsOpen] = useState(false);
    const [tree, setTree] = useState([]);
    const [category, setCategory] = useState("");
    const [query, setQuery] = useState("");
    const [packError, setPackError] = useState(null);
    const [assetsPath, setAssetsPath] = useState("");
    const [packFilePath, setPackFilePath] = useState("");
    const [packSettings, setPackSettings] = useState(null);
    const [hasInstalledPacks, setHasInstalledPacks] = useState(() => readInstallablePackages().length > 0);
    const [hasUserNavigated, setHasUserNavigated] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const applyPack = useCallback((meta) => {
        loadInstalledPack(meta)
            .then((loaded) => {
            const nextTree = buildPackTree(loaded.pack.structure);
            setTree(nextTree);
            setAssetsPath(loaded.assetsPath);
            setPackFilePath(loaded.meta.path);
            setPackSettings(loaded.pack.settings);
            setCategory(resolveCategoryForPack(nextTree, loaded.meta.path));
            setPackError(null);
            writeActivePackPath(loaded.meta.path);
        })
            .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            setPackError(packInitErrorMessage(message));
        });
    }, [showStatus]);
    useEffect(() => {
        if (!packFilePath || !category)
            return;
        persistCategoryForPack(packFilePath, category);
    }, [packFilePath, category]);
    // Telemetry: active market pack (or empty when none).
    useEffect(() => {
        if (!signedIn || !authReady)
            return;
        if (!packFilePath) {
            void reportActivePacks([]);
            return;
        }
        const installed = readInstallablePackages();
        const norm = packFilePath.replace(/\\/g, "/").toLowerCase();
        const match = installed.find((p) => (p.path || "").replace(/\\/g, "/").toLowerCase() === norm);
        const marketId = match?.marketId != null ? Number(match.marketId) : NaN;
        if (Number.isInteger(marketId) && marketId > 0) {
            void reportActivePacks([marketId]);
        }
        else {
            void reportActivePacks([]);
        }
    }, [packFilePath, signedIn, authReady]);
    const reloadPackList = useCallback(async () => {
        const custom = (readPrefSettings().absCustomAbsolutePath || "").trim();
        if (custom) {
            const entitlement = signedIn
                ? await resolvePackEntitlementContextForScan({
                    signedIn: true,
                    purchases: subscription.purchases,
                })
                : null;
            scanAndRegisterPacksAtRoot(custom, entitlement);
        }
        const installed = readInstallablePackages();
        setHasInstalledPacks(installed.length > 0);
        if (installed.length === 0) {
            setPackError("No installed pack found");
            setPackFilePath("");
            setTree([]);
            setPackSettings(null);
            setAssetsPath("");
            setCategory("");
            setNav("market");
            return;
        }
        const preferredPath = readActivePackPath();
        const preferred = preferredPath
            ? installed.find((p) => p.path === preferredPath)
            : undefined;
        applyPack(preferred ?? installed[0]);
    }, [applyPack, signedIn, subscription.purchases]);
    useEffect(() => {
        void reloadPackList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (!authReady)
            return;
        void reloadPackList();
    }, [authReady, signedIn, subscription.purchases, reloadPackList]);
    useEffect(() => {
        const onRescan = () => {
            void reloadPackList();
        };
        window.addEventListener(PACKAGES_RESCAN_EVENT, onRescan);
        return () => window.removeEventListener(PACKAGES_RESCAN_EVENT, onRescan);
    }, [reloadPackList]);
    // G-04: Auto-switch to Editing when packs become available and user hasn't navigated.
    // On first paint host may be null → readInstallablePackages returns []. Once host
    // environment is ready and packs are found, land on Editing rather than Market.
    useEffect(() => {
        if (hasInstalledPacks && nav === "market" && !hasUserNavigated && !settingsOpen) {
            setNav("editing");
        }
    }, [hasInstalledPacks, nav, hasUserNavigated, settingsOpen]);
    // Prefetch market catalog once signed in (Market tab / notifications).
    useEffect(() => {
        if (!authReady || !signedIn)
            return;
        void refreshMarket();
    }, [authReady, signedIn, refreshMarket]);
    // Prefetch ffmpeg after the shell is up so unzip/download cannot freeze Loading.
    useEffect(() => {
        if (!authReady)
            return;
        const timer = window.setTimeout(() => {
            ensureFfmpeg().catch((err) => {
                console.warn("[spunkram] ffmpeg download failed:", err instanceof Error ? err.message : err);
            });
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [authReady]);
    useEffect(() => {
        const hex = packSettings?.inside_option_sets?.header_color_hex;
        const root = document.documentElement;
        const match = typeof hex === "string" ? hex.match(/^#?([0-9a-f]{6})$/i) : null;
        if (match) {
            const value = match[1];
            const r = parseInt(value.slice(0, 2), 16);
            const g = parseInt(value.slice(2, 4), 16);
            const b = parseInt(value.slice(4, 6), 16);
            root.style.setProperty("--primary", `${r}, ${g}, ${b}`);
        }
        else {
            root.style.removeProperty("--primary");
        }
        return () => {
            root.style.removeProperty("--primary");
        };
    }, [packSettings]);
    const aiToolsProps = {
        monthly: gens.monthly,
        extra: gens.extra,
        monthlyLimit: gens.monthlyLimit,
        isFreeUser: gens.isFreeUser,
        onUse: () => {
            void gens.refresh();
        },
    };
    function handleNav(id) {
        if (id === "editing" && !hasInstalledPacks)
            return;
        setSettingsOpen(false);
        setNav(id);
        setHasUserNavigated(true);
        if (id === "editing") {
            setTutorialsOpen(false);
            setShowFavoritesOnly(false);
        }
    }
    function defaultWorkspaceNav() {
        return hasInstalledPacks ? "editing" : "market";
    }
    function openSettings() {
        setPrevNav(nav);
        setSettingsOpen(true);
        setNav("settings");
    }
    function openAccount() {
        setSettingsOpen(false);
        setNav("account");
    }
    if (!authReady) {
        return _jsx(SpunkramBootLoader, {});
    }
    if (!signedIn) {
        return (_jsxs("div", { className: "spunkram-shell flex h-full w-full flex-col overflow-hidden text-foreground", children: [_jsx("div", { className: "spunkram-shell__mesh" }), _jsx("div", { className: "spunkram-shell__grid" }), _jsx("div", { className: "spunkram-shell__content", children: _jsx(LoginScreen, {}) })] }));
    }
    return (_jsxs("div", { className: "spunkram-shell flex h-full w-full flex-col overflow-hidden text-foreground", children: [_jsx("div", { className: "spunkram-shell__mesh" }), _jsx("div", { className: "spunkram-shell__grid" }), _jsxs("div", { className: "spunkram-shell__content", children: [_jsx(PanelHeader, { active: settingsOpen ? "settings" : nav, onSelect: handleNav, onOpenAccount: openAccount, onOpenSettings: openSettings, editingDisabled: !hasInstalledPacks }), showUpdateBanner && updateVersion ? (_jsx(UpdateBanner, { version: updateVersion, localVersion: localVersion, changelog: updateChangelog, channel: updateChannel, busy: updateBusy, progressLabel: updateProgress, error: updateError, onUpdate: handleApplyUpdate })) : null, hasPendingNatives && !showUpdateBanner && (_jsx("div", { className: "mx-2.5 mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200", children: _jsx("span", { className: "flex-1", children: "Native plugin update pending. Restart the host application to complete." }) })), _jsx(DownloadFloat, {}), settingsOpen || nav === "settings" ? (_jsx("section", { className: "min-h-0 flex-1 overflow-hidden", children: _jsx(SettingsPanel, { onBack: () => {
                                setSettingsOpen(false);
                                setNav(prevNav || defaultWorkspaceNav());
                                setPrevNav(null);
                            } }) })) : nav === "account" ? (_jsx("section", { className: "min-h-0 flex-1 overflow-hidden", children: _jsx(AccountPanel, { onBack: () => setNav(defaultWorkspaceNav()) }) })) : nav === "market" ? (_jsx("section", { className: "min-h-0 flex-1 overflow-hidden", children: _jsx(MarketPanel, { onOpenLogin: openAccount, onPacksChanged: reloadPackList, activePackPath: packFilePath, onSelectPack: (meta) => {
                                const host = currentPackHost();
                                if (host && !packMetaMatchesHost(meta, host))
                                    return;
                                applyPack(meta);
                                // Stay on current nav so background "Use when ready" doesn't yank the user.
                            } }) })) : nav === "ai-tools" ? (_jsx("section", { className: "flex min-h-0 flex-1 flex-col overflow-hidden", children: subscription.subscribed ? (_jsx(AiToolsPanel, { ...aiToolsProps })) : (_jsx(AiToolsPlanDialog, { onBack: () => setNav(hasInstalledPacks ? "editing" : "market") })) })) : nav === "footages" ? (_jsx("section", { className: "min-h-0 flex-1 overflow-hidden", children: _jsx(FootagesPanel, {}) })) : (_jsx(EditingWorkspace, { tree: tree, category: category, setCategory: setCategory, query: query, setQuery: setQuery, tutorialsOpen: tutorialsOpen, setTutorialsOpen: setTutorialsOpen, assetsPath: assetsPath, packFilePath: packFilePath, packSettings: packSettings, packError: packError, onOpenAccount: openAccount })), _jsx(StatusToast, { onOpenMarket: () => {
                            setSettingsOpen(false);
                            setNav("market");
                        } })] })] }));
}
export const App = () => {
    return (_jsx(AuthProvider, { children: _jsx(PanelUIProvider, { children: _jsx(NotificationsProvider, { children: _jsx(PackagesPathGateProvider, { children: _jsx(DownloadManagerProvider, { children: _jsx(AppShell, {}) }) }) }) }) }));
};
