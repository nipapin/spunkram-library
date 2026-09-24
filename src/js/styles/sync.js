import { downloadCaptionProject, fetchCaptionControls, fetchCaptionsCatalog, fetchCaptionsCdnBaseManifest, flattenCatalog, hashArrayBuffer, pickProjectFile, resolveControlsUrl, resolveMediaUrl, } from "./api";
import { fs, path } from "../lib/cep/node";
import { loadCdnBaseManifest, loadLocalPackage, loadLocalState, loadUserControlsDefinition, saveCdnBaseManifest, saveLocalPackage, saveLocalState, saveUserControls, } from "./localStore";
import { getLocalOverrideAssetPaths, isCaptionsLocalOverrideActive } from "./localSource";
import { packIdFromStyleId, packProjectFileName } from "./paths";
import { EMPTY_DEFINITION } from "./types";
import { csi } from "../lib/utils/bolt";
import { getActiveBrand } from "../lib/utils/brandTheme";
import { getResolvedHostSync } from "../lib/utils/host-identity";
import { defaultsFromDefinition, findControlByAnyNames, isColorArray, rgbaToHex } from "../presets";
import { buildUserControlsDocument } from "../presets/userControls";
const cloneValues = (values) => JSON.parse(JSON.stringify(values));
export const makeOrigin = (name, values) => ({
    name,
    values: cloneValues(values),
});
const normalizeForCompare = (value) => {
    if (typeof value === "number")
        return Math.round(value * 1e5) / 1e5;
    if (Array.isArray(value))
        return value.map(normalizeForCompare);
    if (value && typeof value === "object") {
        const obj = value;
        const out = {};
        for (const key of Object.keys(obj).sort()) {
            out[key] = normalizeForCompare(obj[key]);
        }
        return out;
    }
    return value;
};
export const valuesEqual = (a, b) => JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
export const isPresetDirty = (p) => {
    if (!p.origin)
        return false;
    if (p.name !== p.origin.name)
        return true;
    return !valuesEqual(p.values, p.origin.values);
};
export const isPresetValuesDirty = (p) => {
    if (!p.origin)
        return false;
    return !valuesEqual(p.values, p.origin.values);
};
export const colorIdsFromDefinition = (definition) => ({
    fill: findControlByAnyNames(definition, [
        ["Segment Static", "Fill"],
        ["Static", "Fill"],
    ])?.id ?? "",
    highlight: findControlByAnyNames(definition, [["Animated Text", "Fill"]])?.id ?? "",
    background: findControlByAnyNames(definition, [
        ["Segment Background", "Fill"],
        ["Follow Background", "Fill"],
        ["Segment Settings", "Background", "Fill"],
        ["Follow", "Background", "Fill"],
    ])?.id ?? "",
});
export const previewFromValues = (values, definition, fallback) => {
    const ids = definition ? colorIdsFromDefinition(definition) : { fill: "", highlight: "", background: "" };
    const fill = values[ids.fill];
    const highlight = values[ids.highlight];
    const background = values[ids.background];
    return {
        text: isColorArray(fill) ? rgbaToHex(fill) : fallback?.text || "#ffffff",
        highlight: isColorArray(highlight) ? rgbaToHex(highlight) : fallback?.highlight || "#ffe14d",
        background: isColorArray(background) ? rgbaToHex(background) : fallback?.background || "#000000",
    };
};
export const presetSwatchColors = (p, definition) => previewFromValues(p.values, definition, p.preview);
const catalogToPreset = (item, favorite, downloaded) => ({
    id: item.id,
    name: item.name,
    favorite,
    styleId: item.id,
    styleVersion: downloaded ? "local" : "",
    source: downloaded ? "downloaded" : "catalog",
    values: {},
    origin: makeOrigin(item.name, {}),
    categoryName: item.categoryName,
    tags: item.categoryName ? [item.categoryName] : [],
    previewImageUrl: resolveMediaUrl(item.previewImageUrl),
    previewVideoUrl: resolveMediaUrl(item.previewVideoUrl),
    controlsUrl: resolveControlsUrl(item, getActiveBrand()),
    files: item.files,
});
const controlsCache = new Map();
export const clearCaptionControlsCache = () => {
    controlsCache.clear();
};
const parseVersionParts = (version) => version
    .split(/[^\d]+/)
    .filter((p) => p.length > 0)
    .map((n) => parseInt(n, 10) || 0);
/** True when `local` is missing or a lower semver-ish value than `remote`. */
export const isCdnVersionOlder = (local, remote) => {
    if (!local || !local.trim())
        return true;
    const a = parseVersionParts(local);
    const b = parseVersionParts(remote);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        if (x < y)
            return true;
        if (x > y)
            return false;
    }
    return false;
};
/**
 * GET public controls.json for Styles UI (CDN URL, not AppData).
 */
export const ensureDefinitionForStyle = async (styleId, options) => {
    const brand = getActiveBrand();
    const localOverride = isCaptionsLocalOverrideActive(brand);
    // Always re-read controls.json from disk when admin local source is active.
    if (!options?.force && !localOverride) {
        const cached = controlsCache.get(styleId);
        if (cached)
            return cached;
    }
    const url = resolveControlsUrl({
        id: styleId,
        controlsUrl: options?.controlsUrl,
        previewImageUrl: options?.previewImageUrl,
        previewVideoUrl: options?.previewVideoUrl,
    }, brand);
    try {
        const parsed = await fetchCaptionControls(url, brand);
        if (!localOverride)
            controlsCache.set(styleId, parsed);
        return parsed;
    }
    catch {
        const empty = EMPTY_DEFINITION;
        if (!localOverride)
            controlsCache.set(styleId, empty);
        return empty;
    }
};
const localProjectFingerprint = (pkg, file) => {
    if (pkg.manifest.remote?.file === file) {
        return {
            etag: pkg.manifest.remote.etag,
            byteLength: pkg.manifest.remote.byteLength,
            contentHash: pkg.manifest.remote.contentHash,
        };
    }
    if (pkg.dir.startsWith("memory://") || typeof fs?.readFileSync !== "function")
        return null;
    const fileName = file === "aep" ? pkg.manifest.files.aep : file === "mogrt" ? pkg.manifest.files.mogrt : null;
    if (!fileName)
        return null;
    const full = path.join(pkg.dir, fileName);
    try {
        if (!fs.existsSync(full))
            return null;
        const data = fs.readFileSync(full);
        const bytes = new Uint8Array(data);
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        return {
            byteLength: bytes.length,
            contentHash: hashArrayBuffer(ab),
        };
    }
    catch {
        return null;
    }
};
const fingerprintsMatch = (local, remote) => {
    if (!local)
        return false;
    if (local.etag && remote.etag && local.etag === remote.etag)
        return true;
    if (local.contentHash && remote.contentHash && local.contentHash === remote.contentHash) {
        return true;
    }
    if (local.byteLength != null &&
        remote.byteLength != null &&
        local.byteLength === remote.byteLength &&
        local.contentHash &&
        remote.contentHash &&
        local.contentHash === remote.contentHash) {
        return true;
    }
    return false;
};
/** Whether AppData already has this pack's host template (`{Pack}.aep` / `{Pack}.mogrt`). */
export const hasLocalPackTemplate = (packId, hostAppId) => {
    if (!packId)
        return false;
    const override = getLocalOverrideAssetPaths(packId);
    if (override) {
        const aepOk = !!override.aep;
        const mogrtOk = !!override.mogrt;
        if (hostAppId === "PPRO")
            return mogrtOk || aepOk;
        if (hostAppId === "AEFT")
            return aepOk || mogrtOk;
        return aepOk || mogrtOk;
    }
    const pkg = loadLocalPackage(packId);
    if (!pkg || pkg.dir.startsWith("memory://"))
        return false;
    const aep = pkg.manifest.files.aep ? path.join(pkg.dir, pkg.manifest.files.aep) : undefined;
    const mogrt = pkg.manifest.files.mogrt ? path.join(pkg.dir, pkg.manifest.files.mogrt) : undefined;
    const aepOk = !!(aep && typeof fs?.existsSync === "function" && fs.existsSync(aep));
    const mogrtOk = !!(mogrt && typeof fs?.existsSync === "function" && fs.existsSync(mogrt));
    if (hostAppId === "PPRO")
        return mogrtOk || aepOk;
    if (hostAppId === "AEFT")
        return aepOk || mogrtOk;
    return aepOk || mogrtOk;
};
const uniquePackIds = (styleIds) => {
    const seen = new Set();
    const out = [];
    for (const id of styleIds) {
        const packId = packIdFromStyleId(id);
        if (!packId || seen.has(packId))
            continue;
        seen.add(packId);
        out.push(packId);
    }
    return out;
};
/**
 * POST /api/captions `{ id: packName, file }` → AppData/styles/{Pack}/{Pack}.aep|mogrt.
 * One template per pack; styles in the same pack share it.
 */
export const downloadPackTemplate = async (packId, options) => {
    if (!packId) {
        throw new Error("No caption pack id");
    }
    const hostAppId = options?.hostAppId ?? getResolvedHostSync() ?? csi.hostEnvironment?.appId;
    // Pack projects are always brand-level — catalog per-style `files` flags are not authoritative
    // (they may be false until the API sees {Pack}/{Pack}.*). Prefer host format.
    const fileFlags = { mogrt: true, aep: true, definition: false };
    const file = options?.file ?? pickProjectFile(fileFlags, hostAppId);
    if (!file || file === "definition") {
        throw new Error("No pack template available (mogrt/aep)");
    }
    const existing = loadLocalPackage(packId);
    const localFp = options?.force || !existing ? null : localProjectFingerprint(existing, file);
    const downloaded = await downloadCaptionProject(packId, file, undefined, getActiveBrand(), localFp ?? undefined);
    const remoteFp = {
        etag: downloaded.etag,
        byteLength: downloaded.byteLength ??
            (downloaded.unchanged ? localFp?.byteLength : downloaded.buffer.byteLength),
        contentHash: downloaded.contentHash ??
            (downloaded.unchanged ? localFp?.contentHash : hashArrayBuffer(downloaded.buffer)),
    };
    if (downloaded.unchanged || fingerprintsMatch(localFp, remoteFp)) {
        if (existing && !existing.manifest.remote?.contentHash && (remoteFp.contentHash || remoteFp.etag)) {
            saveLocalPackage({
                ...existing.manifest,
                remote: { file, ...remoteFp },
            });
        }
        return { updated: false };
    }
    if (!downloaded.buffer.byteLength) {
        throw new Error("Empty pack template download");
    }
    const version = new Date().toISOString();
    const fileName = packProjectFileName(packId, file);
    const manifest = {
        id: packId,
        name: packId,
        version,
        downloadedAt: version,
        files: {
            aep: existing?.manifest.files.aep,
            mogrt: existing?.manifest.files.mogrt,
        },
        remote: { file, ...remoteFp },
    };
    if (file === "aep")
        manifest.files.aep = fileName;
    if (file === "mogrt")
        manifest.files.mogrt = fileName;
    const assets = {};
    if (file === "aep")
        assets.aep = downloaded.buffer;
    if (file === "mogrt")
        assets.mogrt = downloaded.buffer;
    const saved = saveLocalPackage(manifest, assets);
    if (!saved)
        throw new Error("Failed to save pack caption template locally");
    return { updated: true };
};
/**
 * Ensure this style's pack template is on disk for the current host.
 * Also loads controls.json for `styleId` (preset values).
 */
export const downloadStylePackage = async (styleId, options) => {
    const packId = packIdFromStyleId(styleId);
    await downloadPackTemplate(packId, options);
    const fileFlags = options?.files ?? { mogrt: true, aep: true, definition: true };
    const pack = loadLocalPackage(packId);
    const name = options?.name || styleId.split("/").pop() || styleId;
    const version = pack?.manifest.version || new Date().toISOString();
    const definition = await ensureDefinitionForStyle(styleId, {
        name,
        files: fileFlags,
        controlsUrl: options?.controlsUrl,
        previewImageUrl: options?.previewImageUrl,
        previewVideoUrl: options?.previewVideoUrl,
    });
    const values = defaultsFromDefinition(definition);
    const preset = {
        id: styleId,
        name,
        favorite: false,
        styleId,
        styleVersion: version,
        source: "downloaded",
        values,
        origin: makeOrigin(name, values),
        updateAvailable: false,
        files: fileFlags,
        controlsUrl: options?.controlsUrl,
        previewImageUrl: options?.previewImageUrl,
        previewVideoUrl: options?.previewVideoUrl,
    };
    return { preset, definition };
};
/**
 * Refresh this style's pack template when CDN Base version bumps.
 */
export const refreshStylePackageIfRemoteChanged = async (styleId, options) => {
    const packId = styleId ? packIdFromStyleId(styleId) : "";
    if (!packId)
        return { updated: false, updateAvailable: false, error: true };
    try {
        const result = await downloadPackTemplate(packId, { ...options, force: options?.force ?? true });
        return { updated: result.updated, updateAvailable: false };
    }
    catch {
        return { updated: false, updateAvailable: false, error: true };
    }
};
/**
 * On style apply: if local Base/manifest.json is older than R2, drop the
 * controls.json cache so the next fetch gets the current dump.
 * Pack mogrt/aep refresh runs in the background and persists the new version.
 */
export const refreshCaptionControlsIfRemoteNewer = async (styleId) => {
    const brand = getActiveBrand();
    if (isCaptionsLocalOverrideActive(brand)) {
        clearCaptionControlsCache();
        return true;
    }
    const remote = await fetchCaptionsCdnBaseManifest(brand);
    if (!remote)
        return false;
    const local = loadCdnBaseManifest();
    if (local?.brand === brand && !isCdnVersionOlder(local.version, remote.version)) {
        return false;
    }
    clearCaptionControlsCache();
    if (!styleId) {
        saveCdnBaseManifest({
            version: remote.version,
            fetchedAt: new Date().toISOString(),
            brand,
        });
        return true;
    }
    void refreshStylePackageIfRemoteChanged(styleId, { force: true }).then((r) => {
        if (r.error)
            return;
        saveCdnBaseManifest({
            version: remote.version,
            fetchedAt: new Date().toISOString(),
            brand,
        });
    });
    return true;
};
/**
 * При загрузке расширения / Refresh:
 * 1) GET /api/captions — сетка только из каталога
 * 2) pack `{Pack}.aep`/`{Pack}.mogrt` в AppData/styles/{Pack}/ (если уже скачан)
 * 3) user presets (Save as New) — отдельная секция Users
 * 4) CDN `{Brand} Captions/Base/manifest.json` — если version изменилась, перекачать локальные паки
 */
export const syncCaptionStyles = async (options) => {
    const checkRemote = options?.checkRemoteUpdates === true;
    const localState = loadLocalState();
    const definitions = {};
    let catalog = [];
    let categories = [];
    let catalogError;
    try {
        const res = await fetchCaptionsCatalog(getActiveBrand());
        categories = res.categories;
        catalog = flattenCatalog(res);
    }
    catch (err) {
        catalogError = err instanceof Error ? err.message : String(err);
    }
    const hostAppId = getResolvedHostSync() ?? csi.hostEnvironment?.appId;
    const catalogPackIds = uniquePackIds(catalog.map((c) => c.id));
    const updatedPacks = new Set();
    if (checkRemote && catalog.length > 0 && !isCaptionsLocalOverrideActive()) {
        const brand = getActiveBrand();
        const remoteManifest = await fetchCaptionsCdnBaseManifest(brand);
        const localManifest = loadCdnBaseManifest();
        const versionChanged = !!remoteManifest &&
            (localManifest?.brand !== brand || isCdnVersionOlder(localManifest?.version, remoteManifest.version));
        if (versionChanged && remoteManifest) {
            const hadLocalSnapshot = !!localManifest?.version;
            let persistRemote = true;
            clearCaptionControlsCache();
            if (hadLocalSnapshot) {
                const localPacks = catalogPackIds.filter((packId) => hasLocalPackTemplate(packId, hostAppId));
                for (const packId of localPacks) {
                    const result = await refreshStylePackageIfRemoteChanged(packId, {
                        hostAppId,
                        force: true,
                    });
                    if (result.updated)
                        updatedPacks.add(packId);
                    if (result.error)
                        persistRemote = false;
                }
            }
            if (persistRemote) {
                saveCdnBaseManifest({
                    version: remoteManifest.version,
                    fetchedAt: new Date().toISOString(),
                    brand,
                });
            }
        }
    }
    else if (isCaptionsLocalOverrideActive()) {
        clearCaptionControlsCache();
    }
    const presets = [];
    for (const item of catalog) {
        const favorite = !!localState.favorites[item.id];
        const packId = packIdFromStyleId(item.id);
        const packReady = hasLocalPackTemplate(packId, hostAppId);
        const base = catalogToPreset(item, favorite, packReady);
        if (packReady) {
            const packPkg = loadLocalPackage(packId);
            presets.push({
                ...base,
                styleVersion: packPkg?.manifest.version || "",
                source: "downloaded",
                updateAvailable: updatedPacks.has(packId),
            });
        }
        else {
            presets.push(base);
        }
    }
    for (const user of localState.userPresets) {
        const parent = catalog.find((c) => c.id === user.styleId);
        let userDef = loadUserControlsDefinition(user.id);
        if (!userDef?.clientControls?.length && user.styleId) {
            try {
                const parentDef = await ensureDefinitionForStyle(user.styleId, {
                    name: user.name,
                    files: user.files ?? parent?.files,
                    controlsUrl: user.controlsUrl ?? parent?.controlsUrl,
                    previewImageUrl: user.previewImageUrl ?? parent?.previewImageUrl,
                    previewVideoUrl: user.previewVideoUrl ?? parent?.previewVideoUrl,
                });
                if (parentDef.clientControls?.length || parentDef.init?.length) {
                    const doc = buildUserControlsDocument(parentDef, user.values || {});
                    saveUserControls(user.id, doc);
                    userDef = loadUserControlsDefinition(user.id);
                }
            }
            catch {
                // keep legacy values-only preset
            }
        }
        if (userDef)
            definitions[user.id] = userDef;
        const values = userDef && !Object.keys(user.values || {}).length
            ? defaultsFromDefinition(userDef)
            : user.values;
        presets.push({
            ...user,
            values,
            origin: user.origin?.values ? user.origin : makeOrigin(user.name, values),
            favorite: localState.favorites[user.id] ?? user.favorite,
            source: "user",
            controlsUrl: user.controlsUrl ?? parent?.controlsUrl ?? null,
            previewImageUrl: user.previewImageUrl ?? parent?.previewImageUrl ?? null,
            previewVideoUrl: user.previewVideoUrl ?? parent?.previewVideoUrl ?? null,
        });
    }
    presets.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    let selectedPresetId = localState.selectedPresetId;
    if (!presets.some((p) => p.id === selectedPresetId)) {
        selectedPresetId = presets[0]?.id ?? "";
    }
    saveLocalState({
        ...localState,
        selectedPresetId,
        downloadedEdits: {},
    });
    return {
        presets,
        definitions,
        catalog,
        categories,
        selectedPresetId,
        error: catalogError,
    };
};
/** Catalog style whose name matches the selected MOGRT projectItem. */
export const matchPresetByStyleName = (presets, rawName) => {
    const name = rawName.replace(/\.mogrt$/i, "").replace(/\s+copy$/i, "").trim();
    if (!name)
        return undefined;
    const catalog = presets.filter((p) => p.source !== "user");
    const lower = name.toLowerCase();
    return (catalog.find((p) => p.name === name) ||
        catalog.find((p) => p.name.toLowerCase() === lower) ||
        catalog.find((p) => p.styleId === name) ||
        catalog.find((p) => p.styleId.toLowerCase().endsWith("/" + lower)));
};
