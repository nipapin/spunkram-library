import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCepMarketStructure,
  resolvePackEntitlementContextForScan,
} from "@/api/cep-market";
import { fetchGalEffects } from "@/api/gal-effects";
import { useAuth } from "@/lib/auth-context";
import { readPrefSettings } from "@/lib/api/preferences";
import * as panelStore from "@/lib/userdata-store";
import { BRAND, storageKey } from "@brands";
import {
  PACKAGES_RESCAN_EVENT,
  scanAndRegisterPacksAtRoot,
} from "@/lib/utils/pack-install";
import {
  activePackStorageKey,
  currentPackHost,
  type PackHostId,
} from "@/lib/utils/pack-host";
import {
  loadInstalledPack,
  packInitErrorMessage,
  readInstallablePackages,
} from "@/lib/utils/pack";
import type { InstalledPackMeta } from "@/lib/utils/pack-types";
import {
  buildPackTree,
  collectAllContentSections,
  collectContentSections,
  filterContentSections,
  filterFavoriteSections,
  filterPackTree,
  filterUnlockedSections,
  findPackRootFor,
  findPackTreeNode,
  firstGroupIdIn,
  getFirstPackRoot,
  type PackContentSection,
} from "@/lib/utils/pack-tree";
import type { PackSettings, PackTreeItem, PackTreeNode } from "@/lib/utils/pack-types";
import {
  buildPackEntitlementContext,
  isPackEntitled,
} from "@/lib/utils/pack-entitlement";
import {
  itemUnlockedForGalPlan,
  resolveGalAccountPlan,
  type GalAccountPlan,
} from "@/lib/utils/gal-plan";
import {
  ensureGalItemOnDisk,
  ensureGalVirtualPackLayout,
  galItemLocallyCached,
  galOfflineAssetsPresent,
  resolveGalInstallRoot,
  syncGalAssetsFromManifest,
  type GalAssetsSyncProgress,
} from "@/lib/utils/gal-effects-cache";
import { usePanelUI } from "@/lib/panel-ui-context";

const LEGACY_ACTIVE_PACK_STORAGE_KEY = storageKey("activePackPath");
const CATEGORY_BY_PACK_KEY = storageKey("categoryByPack");

/** Virtual sidebar row — not a real pack tree node. */
export const FAVORITES_CATEGORY_ID = "__favorites";

function hostActivePackKey(host: PackHostId | null = currentPackHost()): string | null {
  return host ? activePackStorageKey(host) : null;
}

export function readActivePackPath(host: PackHostId | null = currentPackHost()): string | null {
  const key = hostActivePackKey(host);
  if (!key) return null;
  try {
    const scoped = panelStore.getItem(key);
    if (scoped) return scoped;
    const legacy = panelStore.getItem(LEGACY_ACTIVE_PACK_STORAGE_KEY);
    if (!legacy || !host) return null;
    const match = readInstallablePackages(host).some((p) => p.path === legacy);
    if (!match) return null;
    panelStore.setItem(key, legacy);
    return legacy;
  } catch {
    return null;
  }
}

export function writeActivePackPath(
  packPath: string,
  host: PackHostId | null = currentPackHost(),
) {
  const key = hostActivePackKey(host);
  if (!key || !packPath) return;
  try {
    panelStore.setItem(key, packPath);
  } catch {
    // ignore
  }
}

function loadCategoryByPack(): Record<string, string> {
  try {
    const raw = panelStore.getItem(CATEGORY_BY_PACK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [path, id] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id === "string" && id) out[path] = id;
    }
    return out;
  } catch {
    return {};
  }
}

function persistCategoryForPack(packPath: string, categoryId: string) {
  if (!packPath || !categoryId || categoryId === FAVORITES_CATEGORY_ID) return;
  try {
    const map = loadCategoryByPack();
    if (map[packPath] === categoryId) return;
    map[packPath] = categoryId;
    panelStore.setItem(CATEGORY_BY_PACK_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function resolveCategoryForPack(tree: PackTreeNode[], packKey: string): string {
  const saved = loadCategoryByPack()[packKey];
  if (saved && saved !== FAVORITES_CATEGORY_ID && findPackTreeNode(tree, saved)) {
    return saved;
  }
  return getFirstPackRoot(tree)?.id ?? "";
}

function pickMarketPack(
  packages: Array<{ id: number | string; primary_type?: string }>,
  host: PackHostId | null,
) {
  if (!packages.length) return null;
  if (!host) return packages[0] ?? null;
  return (
    packages.find((p) => (p.primary_type || "").toUpperCase() === host) ||
    packages[0] ||
    null
  );
}

export function usePackWorkspace() {
  const { signedIn, subscription, market, authReady, refreshMarket } = useAuth();
  const { showFavoritesOnly, showAvailableOnly, favoriteIds, setShowFavoritesOnly } =
    usePanelUI();
  const [tree, setTree] = useState<PackTreeNode[]>([]);
  const [category, setCategoryState] = useState("");
  const [query, setQuery] = useState("");
  const [packError, setPackError] = useState<string | null>(null);
  const [assetsPath, setAssetsPath] = useState("");
  const [packFilePath, setPackFilePath] = useState("");
  const [packSettings, setPackSettings] = useState<PackSettings | null>(null);
  const [structureSource, setStructureSource] = useState<"remote" | "local" | null>(
    null,
  );
  const [assetsBaseUrl, setAssetsBaseUrl] = useState("");
  const [assetsHost, setAssetsHost] = useState<PackHostId | null>(null);
  const [hasInstalledPacks, setHasInstalledPacks] = useState(
    () => readInstallablePackages().length > 0,
  );
  const [structureLoading, setStructureLoading] = useState(
    () => BRAND.id === "gal",
  );
  const [galAssetsSync, setGalAssetsSync] = useState<GalAssetsSyncProgress | null>(
    null,
  );
  const [galAssetsReady, setGalAssetsReady] = useState(() => {
    if (BRAND.id !== "gal") return true;
    try {
      const root = resolveGalInstallRoot();
      return root ? galOfflineAssetsPresent(root) : false;
    } catch {
      return false;
    }
  });
  const structureSourceRef = useRef<"remote" | "local" | null>(null);
  const structureGenRef = useRef(0);
  const lastRealCategoryRef = useRef("");
  const galSyncGenRef = useRef(0);
  const galSyncMetaRef = useRef<{
    host: "AE" | "PR";
    packVersion?: string;
    packEtag?: string;
  } | null>(null);
  useEffect(() => {
    structureSourceRef.current = structureSource;
  }, [structureSource]);

  const setCategory = useCallback(
    (id: string) => {
      if (id === FAVORITES_CATEGORY_ID) {
        setShowFavoritesOnly(true);
        setCategoryState(FAVORITES_CATEGORY_ID);
        return;
      }
      if (id) lastRealCategoryRef.current = id;
      setShowFavoritesOnly(false);
      setCategoryState(id);
    },
    [setShowFavoritesOnly],
  );

  const hydrateLocalPack = useCallback(async (meta: InstalledPackMeta) => {
    const loaded = await loadInstalledPack(meta);
    setAssetsPath(loaded.assetsPath);
    setPackFilePath(loaded.meta.path);
    setPackSettings(loaded.pack.settings);
    setHasInstalledPacks(true);
    writeActivePackPath(loaded.meta.path);
    return loaded;
  }, []);

  const applyLocalTree = useCallback((loaded: Awaited<ReturnType<typeof loadInstalledPack>>) => {
    const nextTree = buildPackTree(loaded.pack.structure);
    const nextCategory = resolveCategoryForPack(nextTree, loaded.meta.path);
    setTree(nextTree);
    setStructureSource("local");
    if (nextCategory) lastRealCategoryRef.current = nextCategory;
    setCategoryState(nextCategory);
    setPackError(null);
  }, []);

  const applyPack = useCallback(
    (meta: InstalledPackMeta) => {
      void hydrateLocalPack(meta)
        .then((loaded) => {
          // Keep R2 tree when already loaded; only attach local paths.
          if (structureSourceRef.current === "remote") {
            setPackError(null);
            return;
          }
          applyLocalTree(loaded);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          setPackError(packInitErrorMessage(message));
        });
    },
    [applyLocalTree, hydrateLocalPack],
  );

  const runGalAssetsSync = useCallback(
    (opts?: {
      host?: "AE" | "PR";
      packVersion?: string;
      packEtag?: string;
    }) => {
      if (BRAND.id !== "gal") return;
      const host =
        opts?.host ??
        galSyncMetaRef.current?.host ??
        (assetsHost as "AE" | "PR" | null) ??
        (currentPackHost() as "AE" | "PR" | null) ??
        "PR";
      const packVersion =
        opts?.packVersion ?? galSyncMetaRef.current?.packVersion;
      const packEtag = opts?.packEtag ?? galSyncMetaRef.current?.packEtag;
      galSyncMetaRef.current = { host, packVersion, packEtag };

      const syncGen = ++galSyncGenRef.current;
      setGalAssetsSync({ phase: "checking", total: 0, done: 0 });

      void syncGalAssetsFromManifest({
        host,
        packVersion,
        packEtag,
        onProgress: (p) => {
          if (syncGen !== galSyncGenRef.current) return;
          if (p.phase === "done") return;
          setGalAssetsSync(p);
        },
      }).then((result) => {
        if (syncGen !== galSyncGenRef.current) return;
        const root = resolveGalInstallRoot(host);
        if (result.ok) {
          if (root) {
            const layout = ensureGalVirtualPackLayout(root);
            setPackFilePath((prev) => prev || layout.packFilePath);
            setAssetsPath((prev) => prev || layout.assetsPath);
            const ready = galOfflineAssetsPresent(root);
            setGalAssetsReady(ready);
            if (ready) {
              setGalAssetsSync(null);
            } else {
              setGalAssetsSync({
                phase: "error",
                total: result.downloaded,
                done: result.downloaded,
                error: "NO_OFFLINE_ASSETS",
              });
            }
          } else {
            setGalAssetsReady(false);
            setGalAssetsSync({
              phase: "error",
              total: 0,
              done: 0,
              error: "NO_INSTALL_ROOT",
            });
          }
        } else if (result.error !== "ABORTED") {
          setGalAssetsReady(root ? galOfflineAssetsPresent(root) : false);
          setGalAssetsSync({
            phase: "error",
            total: 0,
            done: 0,
            error: result.error,
          });
        }
      });
    },
    [assetsHost],
  );

  useEffect(() => {
    if (!packFilePath || !category || category === FAVORITES_CATEGORY_ID) return;
    persistCategoryForPack(packFilePath, category);
  }, [packFilePath, category]);

  useEffect(() => {
    if (category && category !== FAVORITES_CATEGORY_ID) {
      lastRealCategoryRef.current = category;
    }
  }, [category]);

  // Keep category ↔ favorites toggle in sync; restore last real folder when toggled off.
  useEffect(() => {
    if (showFavoritesOnly) {
      if (category !== FAVORITES_CATEGORY_ID) {
        setCategoryState(FAVORITES_CATEGORY_ID);
      }
      return;
    }
    if (category === FAVORITES_CATEGORY_ID) {
      const restore =
        lastRealCategoryRef.current || getFirstPackRoot(tree)?.id || "";
      setCategoryState(restore);
    }
  }, [showFavoritesOnly, category, tree]);

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
      setPackFilePath("");
      setAssetsPath("");
      if (structureSourceRef.current !== "remote") {
        setPackSettings(null);
        setTree([]);
        setStructureSource(null);
        setCategoryState("");
        setPackError("No pack installed yet. Open Settings and tap Download.");
      }
      return;
    }

    const preferredPath = readActivePackPath();
    const preferred = preferredPath
      ? installed.find((p) => p.path === preferredPath)
      : undefined;
    const meta = preferred ?? installed[0];
    try {
      const loaded = await hydrateLocalPack(meta);
      if (structureSourceRef.current !== "remote") {
        applyLocalTree(loaded);
      } else {
        setPackError(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPackError(packInitErrorMessage(message));
    }
  }, [applyLocalTree, hydrateLocalPack, signedIn, subscription.purchases]);

  useEffect(() => {
    if (!authReady || !signedIn) return;
    void refreshMarket(false);
  }, [authReady, signedIn, refreshMarket]);

  // Local install scan on sign-in / rescan.
  useEffect(() => {
    if (!authReady || !signedIn) return;
    void reloadPackList();
  }, [authReady, signedIn, reloadPackList]);

  useEffect(() => {
    const onRescan = () => {
      void reloadPackList();
    };
    window.addEventListener(PACKAGES_RESCAN_EVENT, onRescan);
    return () => window.removeEventListener(PACKAGES_RESCAN_EVENT, onRescan);
  }, [reloadPackList]);

  // Prefer remote catalog for sidebar / search (Gal: dedicated R2; else market structure).
  useEffect(() => {
    if (!authReady || !signedIn) {
      if (BRAND.id === "gal") setStructureLoading(false);
      return;
    }

    const host = currentPackHost() ?? "PR";
    const isGal = BRAND.id === "gal";

    // Spunkram path still waits for market catalog row.
    if (!isGal && !market) return;

    const gen = ++structureGenRef.current;
    setStructureLoading(true);

    void (async () => {
      if (isGal) {
        const remote = await fetchGalEffects(host);
        if (gen !== structureGenRef.current) return;
        setStructureLoading(false);

        if (remote.data?.content) {
          const nextTree = buildPackTree(remote.data.content);
          const packKey = `gal-effects:${remote.data.host}`;
          setTree(nextTree);
          setStructureSource("remote");
          setAssetsBaseUrl(remote.data.assets_base_url);
          setAssetsHost(remote.data.host);
          setPackSettings(remote.data.settings);
          setCategoryState((prev) => {
            if (prev === FAVORITES_CATEGORY_ID) return prev;
            if (prev && findPackTreeNode(nextTree, prev)) return prev;
            return resolveCategoryForPack(nextTree, packKey);
          });
          setPackError(null);

          // Virtual pack root for on-demand Apply (Settings zip still optional).
          const installRoot = resolveGalInstallRoot(remote.data.host);
          if (installRoot) {
            const layout = ensureGalVirtualPackLayout(installRoot);
            setPackFilePath((prev) => prev || layout.packFilePath);
            setAssetsPath((prev) => prev || layout.assetsPath);
            setGalAssetsReady(galOfflineAssetsPresent(installRoot));
          }

          runGalAssetsSync({
            host: remote.data.host,
            packVersion: remote.data.version,
            packEtag: remote.data.etag,
          });
          return;
        }

        if (structureSourceRef.current === "local") return;
        setAssetsBaseUrl("");
        setAssetsHost(null);
        if (readInstallablePackages().length === 0) {
          setTree([]);
          setStructureSource(null);
          setPackError(
            remote.error === "NO_PACK"
              ? "Gal effects pack not found. Check R2 / API deploy."
              : "Could not load Gal effects. Open Settings to download the pack.",
          );
        }
        return;
      }

      const marketPack = pickMarketPack(market?.Packages ?? [], host);
      if (!marketPack) {
        setStructureLoading(false);
        return;
      }

      const packKey = `market:${marketPack.id}`;
      const remote = await fetchCepMarketStructure(marketPack.id);
      if (gen !== structureGenRef.current) return;
      setStructureLoading(false);

      if (remote.data?.content) {
        const nextTree = buildPackTree(remote.data.content);
        setTree(nextTree);
        setStructureSource("remote");
        setPackSettings((prev) => prev ?? remote.data!.settings);
        setCategoryState((prev) => {
          if (prev === FAVORITES_CATEGORY_ID) return prev;
          if (prev && findPackTreeNode(nextTree, prev)) return prev;
          return resolveCategoryForPack(nextTree, packKey);
        });
        setPackError(null);
        return;
      }

      if (structureSourceRef.current === "local") return;
      if (readInstallablePackages().length === 0) {
        setTree([]);
        setStructureSource(null);
        setPackError(
          remote.error === "NO_STRUCTURE"
            ? "Pack categories unavailable. Open Settings to download the pack."
            : "No pack installed yet. Open Settings and tap Download.",
        );
      }
    })();
  }, [authReady, signedIn, market, runGalAssetsSync]);

  const entitlementCtx = useMemo(
    () =>
      buildPackEntitlementContext({
        signedIn,
        subscriptionActive: subscription.subscribed,
        purchases: subscription.purchases,
        catalog: market?.Packages ?? [],
      }),
    [signedIn, subscription.subscribed, subscription.purchases, market?.Packages],
  );

  const activePackMeta = useMemo((): InstalledPackMeta | null => {
    if (!packSettings?.main.name) return null;
    return {
      name: packSettings.main.name,
      author: packSettings.main.cc_author_username || "Unknown",
      version: packSettings.main.version || "1.0",
      path: packFilePath || "",
      appID: packSettings.main.software_id,
      appVersion: packSettings.main.software_version,
    };
  }, [packSettings, packFilePath]);

  const hasLocalAssets = Boolean(packFilePath && assetsPath);

  /** Gal: remote catalog + virtual root is enough to Apply (downloads on demand). */
  const galCanDownloadApply = BRAND.id === "gal" && Boolean(assetsBaseUrl);

  const galAccountPlan: GalAccountPlan | null = useMemo(() => {
    if (BRAND.id !== "gal") return null;
    return resolveGalAccountPlan({
      subscribed: subscription.subscribed,
      purchases: subscription.purchases,
      host: currentPackHost() ?? assetsHost,
    });
  }, [subscription.subscribed, subscription.purchases, assetsHost]);

  /** Account may use pack content. Gal: any signed-in user has a plan; Spunkram: pack entitlement. */
  const isEntitled = useMemo(() => {
    if (BRAND.id === "gal") {
      return Boolean(signedIn);
    }
    return (
      activePackMeta != null && isPackEntitled(activePackMeta, entitlementCtx)
    );
  }, [signedIn, activePackMeta, entitlementCtx]);

  /** Entitled + (local zip assets OR Gal on-demand path). */
  const canApply = useMemo(
    () => isEntitled && (hasLocalAssets || galCanDownloadApply),
    [isEntitled, hasLocalAssets, galCanDownloadApply],
  );

  /**
   * Lock chip / gate: Gal per-item `plan[]` vs account plan; Spunkram pack-level.
   */
  const isLocked = useCallback(
    (item: PackTreeItem) => {
      if (BRAND.id === "gal") {
        if (!signedIn || !galAccountPlan) return true;
        return !itemUnlockedForGalPlan(item.plan, galAccountPlan);
      }
      return !isEntitled;
    },
    [signedIn, galAccountPlan, isEntitled],
  );

  /** Sidebar tree: when “available only”, hide empty / locked-only folders. */
  const sidebarTree = useMemo(() => {
    if (!showAvailableOnly) return tree;
    return filterPackTree(tree, (item) => !isLocked(item));
  }, [tree, showAvailableOnly, isLocked]);

  // If the active category vanished under the available-only filter, pick a valid root.
  useEffect(() => {
    if (!showAvailableOnly) return;
    if (showFavoritesOnly || category === FAVORITES_CATEGORY_ID) return;
    if (!sidebarTree.length) {
      if (category) setCategoryState("");
      return;
    }
    if (category && findPackTreeNode(sidebarTree, category)) return;
    const first = getFirstPackRoot(sidebarTree);
    if (first) {
      lastRealCategoryRef.current = first.id;
      setCategoryState(first.id);
    }
  }, [showAvailableOnly, showFavoritesOnly, sidebarTree, category]);

  /** Flatten once per tree — search/favorites only re-filter. */
  const allSections = useMemo(
    () => (tree.length ? collectAllContentSections(tree) : []),
    [tree],
  );

  /** Root category for the current selection — unit of grid preload / mount (Gal). */
  const activeRootId = useMemo(() => {
    if (BRAND.id !== "gal") return "";
    if (!tree.length) return "";
    if (showFavoritesOnly || category === FAVORITES_CATEGORY_ID) return "";
    if (query.trim().length > 0) return "";
    const browseTree = showAvailableOnly ? sidebarTree : tree;
    if (!browseTree.length) return "";
    const root =
      findPackRootFor(browseTree, category) ?? getFirstPackRoot(browseTree);
    return root?.id ?? "";
  }, [
    tree,
    sidebarTree,
    category,
    query,
    showFavoritesOnly,
    showAvailableOnly,
  ]);

  /**
   * Leaf section to scroll to after a sidebar click (Gal).
   * Folders resolve to their first descendant group; search/favorites → null.
   */
  const scrollTargetSectionId = useMemo(() => {
    if (BRAND.id !== "gal") return null;
    if (!tree.length) return null;
    if (showFavoritesOnly || category === FAVORITES_CATEGORY_ID) return null;
    if (query.trim().length > 0) return null;
    const browseTree = showAvailableOnly ? sidebarTree : tree;
    if (!browseTree.length || !category) return null;
    const node = findPackTreeNode(browseTree, category);
    if (!node) return null;
    if (node.kind === "group") return node.id;
    return firstGroupIdIn(node);
  }, [
    tree,
    sidebarTree,
    category,
    query,
    showFavoritesOnly,
    showAvailableOnly,
  ]);

  const sections: PackContentSection[] = useMemo(() => {
    if (!tree.length) return [];
    const browseTree = showAvailableOnly ? sidebarTree : tree;
    if (!browseTree.length && showAvailableOnly) return [];
    const hasQuery = query.trim().length > 0;

    let next: PackContentSection[];
    if (showFavoritesOnly || category === FAVORITES_CATEGORY_ID) {
      next = filterContentSections(
        filterFavoriteSections(allSections, favoriteIds),
        query,
      );
    } else if (hasQuery) {
      next = filterContentSections(allSections, query);
    } else {
      // Gal: mount the full root category — subgroups only scroll/spy.
      // Spunkram: keep leaf/folder-scoped sections.
      const node =
        BRAND.id === "gal"
          ? findPackRootFor(browseTree, category) ??
            getFirstPackRoot(browseTree)
          : findPackTreeNode(browseTree, category) ??
            getFirstPackRoot(browseTree);
      if (!node) return [];
      next = filterContentSections(collectContentSections(node), "");
    }

    if (showAvailableOnly) {
      next = filterUnlockedSections(next, (item) => !isLocked(item));
    }
    return next;
  }, [
    tree,
    allSections,
    sidebarTree,
    category,
    query,
    showFavoritesOnly,
    showAvailableOnly,
    favoriteIds,
    isLocked,
  ]);

  const isReady = useCallback(
    (item: PackTreeItem) => {
      if (BRAND.id === "gal") {
        if (!signedIn) return false;
        // Checkmark when project file already cached; Apply still works without it.
        return galItemLocallyCached(item, packSettings, assetsHost ?? "PR");
      }
      return hasLocalAssets;
    },
    [signedIn, packSettings, assetsHost, hasLocalAssets],
  );

  /**
   * Gal: download/version-check item source (group .prproj or 1:1 file), then
   * return paths for applyPackItemToHost. Spunkram: no-op if local pack ready.
   */
  const prepareApply = useCallback(
    async (
      item: PackTreeItem,
    ): Promise<
      | { ok: true; packFilePath: string; settings: PackSettings | null }
      | { ok: false; message: string }
    > => {
      if (BRAND.id !== "gal") {
        if (!packFilePath) {
          return {
            ok: false,
            message: "No pack loaded. Open Settings and download the pack.",
          };
        }
        return { ok: true, packFilePath, settings: packSettings };
      }

      const host = (assetsHost ?? currentPackHost() ?? "PR") as "AE" | "PR";
      const result = await ensureGalItemOnDisk({
        item,
        settings: packSettings,
        host,
      });
      if (!result.ok) {
        const msg =
          result.error === "NOT_FOUND"
            ? "Project file not found on the server."
            : result.error === "NO_INSTALL_ROOT"
              ? "Could not resolve a download folder."
              : result.error === "UNAUTHORIZED"
                ? "Sign in again to download this item."
                : `Download failed: ${result.error}`;
        return { ok: false, message: msg };
      }

      setPackFilePath(result.packFilePath);
      setAssetsPath(result.assetsPath);

      // FULL_PROJECT needs local `_Assets` for Premiere relink — block until present.
      if (result.filePath.toLowerCase().endsWith(".prproj")) {
        const root = resolveGalInstallRoot(host);
        if (!galOfflineAssetsPresent(root)) {
          const sync = await syncGalAssetsFromManifest({ host });
          if (!galOfflineAssetsPresent(root)) {
            return {
              ok: false,
              message: sync.ok
                ? "Offline media (_Assets) is empty. Check the server Projects/_Assets folder."
                : `Offline media sync failed: ${sync.error || "unknown"}`,
            };
          }
        }
        setGalAssetsReady(true);
      }

      return {
        ok: true,
        packFilePath: result.packFilePath,
        settings: packSettings,
      };
    },
    [packFilePath, packSettings, assetsHost],
  );

  return {
    tree,
    sidebarTree,
    category,
    setCategory,
    query,
    setQuery,
    packError,
    assetsPath,
    assetsBaseUrl,
    assetsHost,
    packFilePath,
    packSettings,
    hasInstalledPacks,
    hasLocalAssets,
    structureLoading,
    structureSource,
    activeRootId,
    scrollTargetSectionId,
    sections,
    galAccountPlan,
    galAssetsSync,
    galAssetsReady,
    retryGalAssetsSync: runGalAssetsSync,
    isEntitled,
    canApply,
    isLocked,
    isReady,
    prepareApply,
    applyPack,
    reloadPackList,
    activePackMeta,
  };
}
