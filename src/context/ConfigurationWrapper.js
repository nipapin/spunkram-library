import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { clearCaptionControlsCache, downloadStylePackage, ensureDefinitionForStyle, getLocalStyleAssetPaths, isPresetDirty, isPresetValuesDirty, loadLocalState, loadUserControlsDefinition, makeOrigin, presetSwatchColors, refreshCaptionControlsIfRemoteNewer, removeUserControls, saveLocalState, saveUserControls, syncCaptionStyles, } from "../js/styles";
import { ensureCaptionFontsInstalled } from "../js/styles/caption-fonts";
import { friendlyErrorMessage } from "../js/utils/user-error";
import { catalogApplyValues, ControlType, defaultsFromDefinition, definitionCacheKey, diffStyleProps, findFontControl, fontIdFromValue, stylePropsFromInit, stylePropsFromValues, } from "../js/presets";
import { buildUserControlsDocument } from "../js/presets/userControls";
import { csi } from "../js/lib/utils/bolt";
import { hostSdk } from "../js/sdk";
import * as panelStore from "../js/lib/userdata-store";
import { getResolvedHostSync } from "../js/lib/utils/host-identity";
import { getFontCatalog, resolveFontFace } from "../js/lib/utils/system-fonts";
export { isPresetDirty, isPresetValuesDirty, presetSwatchColors };
const readCaptionHostRef = () => {
    try {
        const raw = panelStore.getItem("aitools-cep-caption-meta");
        if (!raw)
            return null;
        const meta = JSON.parse(raw);
        return meta.hostRef || null;
    }
    catch {
        return null;
    }
};
const defaultValue = {
    mode: "custom",
    lines: 2,
    characters: 12,
    fontSize: 12,
    mogrtPath: "",
    aepPath: "",
    audioPresetPath: "",
    srcLang: "auto",
    translateTo: "off",
    chaptersSrcLang: "auto",
    chaptersTranslateTo: "off",
    presets: [],
    selectedPresetId: "",
    stylesStatus: "idle",
    stylesError: null,
    definitions: {},
    refreshingStyles: false,
    acquireStatus: "idle",
    presetAssets: null,
    updateMode: () => { },
    updateLines: () => { },
    updateCharacters: () => { },
    updateFontSize: () => { },
    updateMogrtPath: () => { },
    updateAudioPresetPath: () => { },
    updateSrcLang: () => { },
    updateTranslateTo: () => { },
    updateChaptersSrcLang: () => { },
    updateChaptersTranslateTo: () => { },
    selectPreset: () => { },
    updateSelectedPreset: () => { },
    addPreset: () => "",
    toggleFavorite: () => { },
    deletePreset: () => { },
    refreshStyles: async () => { },
    ensureStyleDownloaded: async () => { },
    ensureDefinitionLoaded: async () => ({ clientControls: [] }),
    applySelectedPresetToHost: async () => { },
    syncSelectedPresetFontFromHost: () => { },
};
const STORAGE_KEY = "aitools-cep-config";
const loadConfig = () => {
    try {
        const stored = panelStore.getItem(STORAGE_KEY);
        if (!stored)
            return defaultValue;
        const parsed = JSON.parse(stored);
        return {
            mode: parsed.mode ?? defaultValue.mode,
            lines: Number.isFinite(parsed.lines) ? parsed.lines : defaultValue.lines,
            characters: Number.isFinite(parsed.characters) ? parsed.characters : defaultValue.characters,
            fontSize: Number.isFinite(parsed.fontSize) ? parsed.fontSize : defaultValue.fontSize,
            mogrtPath: parsed.mogrtPath ?? defaultValue.mogrtPath,
            audioPresetPath: parsed.audioPresetPath ?? defaultValue.audioPresetPath,
            srcLang: parsed.srcLang ?? defaultValue.srcLang,
            translateTo: parsed.translateTo ?? defaultValue.translateTo,
            chaptersSrcLang: parsed.chaptersSrcLang ?? defaultValue.chaptersSrcLang,
            chaptersTranslateTo: parsed.chaptersTranslateTo ?? defaultValue.chaptersTranslateTo,
        };
    }
    catch {
        return defaultValue;
    }
};
const persistStylesUiState = (presets, selectedPresetId, definitions) => {
    const favorites = {};
    for (const p of presets) {
        if (p.favorite)
            favorites[p.id] = true;
        if (p.source !== "user")
            continue;
        const def = definitions[p.id];
        if (!def?.clientControls?.length && !def?.init?.length && !def?.controlsDocument)
            continue;
        saveUserControls(p.id, buildUserControlsDocument(def, p.values));
    }
    const prev = loadLocalState();
    saveLocalState({
        ...prev,
        selectedPresetId,
        favorites,
        userPresets: presets.filter((p) => p.source === "user"),
        downloadedEdits: {},
    });
};
const ConfigurationContext = createContext(defaultValue);
export const ConfigurationWrapper = ({ children }) => {
    const initial = loadConfig();
    const [mode, setMode] = useState(initial.mode);
    const [lines, setLines] = useState(initial.lines);
    const [characters, setCharacters] = useState(initial.characters);
    const [fontSize, setFontSize] = useState(initial.fontSize);
    const [mogrtPath, setMogrtPath] = useState(initial.mogrtPath);
    const [audioPresetPath, setAudioPresetPath] = useState(initial.audioPresetPath);
    const [srcLang, setSrcLang] = useState(initial.srcLang);
    const [translateTo, setTranslateTo] = useState(initial.translateTo);
    const [chaptersSrcLang, setChaptersSrcLang] = useState(initial.chaptersSrcLang);
    const [chaptersTranslateTo, setChaptersTranslateTo] = useState(initial.chaptersTranslateTo);
    const [presets, setPresets] = useState([]);
    const [selectedPresetId, setSelectedPresetId] = useState("");
    const [stylesStatus, setStylesStatus] = useState("idle");
    const [stylesError, setStylesError] = useState(null);
    const [definitions, setDefinitions] = useState({});
    const [refreshingStyles, setRefreshingStyles] = useState(false);
    const [acquireStatus, setAcquireStatus] = useState("idle");
    const [presetAssets, setPresetAssets] = useState(null);
    const [aepPath, setAepPath] = useState("");
    const booted = useRef(false);
    const definitionsRef = useRef(definitions);
    definitionsRef.current = definitions;
    const presetsRef = useRef(presets);
    presetsRef.current = presets;
    const selectedPresetIdRef = useRef(selectedPresetId);
    selectedPresetIdRef.current = selectedPresetId;
    const definitionLoadsRef = useRef(new Map());
    const updateMode = (value) => setMode(value);
    const updateLines = (value) => setLines(value);
    const updateCharacters = (value) => setCharacters(value);
    const updateFontSize = (value) => setFontSize(value);
    const updateMogrtPath = (value) => setMogrtPath(value);
    const updateAudioPresetPath = (value) => setAudioPresetPath(value);
    const updateSrcLang = (value) => setSrcLang(value);
    const updateTranslateTo = (value) => setTranslateTo(value);
    const updateChaptersSrcLang = (value) => setChaptersSrcLang(value);
    const updateChaptersTranslateTo = (value) => setChaptersTranslateTo(value);
    const applyPreparedAssets = useCallback((paths) => {
        setPresetAssets(paths);
        if (paths?.mogrt)
            setMogrtPath(paths.mogrt);
        if (paths?.aep)
            setAepPath(paths.aep);
    }, []);
    const applySyncResult = useCallback((result) => {
        setPresets(result.presets);
        setDefinitions((prev) => ({ ...prev, ...result.definitions }));
        setSelectedPresetId(result.selectedPresetId);
        setStylesError(result.error ?? null);
        setStylesStatus("ready");
        const selected = result.presets.find((p) => p.id === result.selectedPresetId);
        if (selected) {
            applyPreparedAssets(getLocalStyleAssetPaths(selected.styleId));
        }
    }, [applyPreparedAssets]);
    const refreshStyles = useCallback(async () => {
        setRefreshingStyles(true);
        setStylesStatus((s) => (s === "ready" ? s : "loading"));
        try {
            // Catalog + local cache first; CDN Base/manifest.json version check runs in the background.
            applySyncResult(await syncCaptionStyles({ checkRemoteUpdates: false }));
            void syncCaptionStyles({ checkRemoteUpdates: true })
                .then(applySyncResult)
                .catch(() => {
                /* grid already shown */
            });
        }
        catch (err) {
            setStylesError(friendlyErrorMessage(err));
            setStylesStatus("error");
        }
        finally {
            setRefreshingStyles(false);
        }
    }, [applySyncResult]);
    const ensureDefinitionLoaded = useCallback(async (styleId, opts) => {
        const preset = presetsRef.current.find((p) => p.id === styleId) ??
            presetsRef.current.find((p) => p.styleId === styleId && p.source !== "user");
        const isUser = preset?.source === "user";
        const cacheKey = preset ? definitionCacheKey(preset) : styleId;
        const catalogStyleId = preset?.styleId ?? styleId;
        if (!opts?.force) {
            const cached = definitionsRef.current[cacheKey];
            if (cached?.clientControls?.length)
                return cached;
            const inflight = definitionLoadsRef.current.get(cacheKey);
            if (inflight)
                return inflight;
        }
        else {
            definitionLoadsRef.current.delete(cacheKey);
        }
        const load = (async () => {
            try {
                if (isUser && preset) {
                    let definition = loadUserControlsDefinition(preset.id);
                    if (!definition?.clientControls?.length) {
                        const parent = presetsRef.current.find((p) => p.styleId === catalogStyleId && p.source !== "user");
                        const parentDef = await ensureDefinitionForStyle(catalogStyleId, {
                            files: parent?.files ?? preset.files,
                            name: parent?.name ?? preset.name,
                            controlsUrl: parent?.controlsUrl ?? preset.controlsUrl,
                            previewImageUrl: parent?.previewImageUrl ?? preset.previewImageUrl,
                            previewVideoUrl: parent?.previewVideoUrl ?? preset.previewVideoUrl,
                            force: opts?.force,
                        });
                        const doc = buildUserControlsDocument(parentDef, preset.values || {});
                        saveUserControls(preset.id, doc);
                        definition = loadUserControlsDefinition(preset.id) ?? parentDef;
                    }
                    if (opts?.force && !definition.clientControls?.length) {
                        const prev = definitionsRef.current[cacheKey];
                        if (prev?.clientControls?.length)
                            return prev;
                    }
                    setDefinitions((prev) => ({ ...prev, [cacheKey]: definition }));
                    if (definition?.clientControls?.length && !Object.keys(preset.values || {}).length) {
                        const values = defaultsFromDefinition(definition);
                        setPresets((prev) => prev.map((p) => p.id === preset.id ? { ...p, values, origin: makeOrigin(p.name, values) } : p));
                    }
                    return definition;
                }
                const fromCatalog = presetsRef.current.find((p) => p.styleId === catalogStyleId && p.source !== "user");
                const definition = await ensureDefinitionForStyle(catalogStyleId, {
                    files: fromCatalog?.files,
                    name: fromCatalog?.name,
                    controlsUrl: fromCatalog?.controlsUrl,
                    previewImageUrl: fromCatalog?.previewImageUrl,
                    previewVideoUrl: fromCatalog?.previewVideoUrl,
                    force: opts?.force,
                });
                if (opts?.force && !definition.clientControls?.length) {
                    const prev = definitionsRef.current[cacheKey];
                    if (prev?.clientControls?.length)
                        return prev;
                }
                setDefinitions((prev) => {
                    const existing = prev[cacheKey];
                    if (existing?.clientControls?.length && !definition.clientControls?.length) {
                        return prev;
                    }
                    return { ...prev, [cacheKey]: definition };
                });
                if (definition.clientControls?.length) {
                    setPresets((prev) => prev.map((p) => {
                        if (p.styleId !== catalogStyleId)
                            return p;
                        if (p.source === "user")
                            return p;
                        const values = defaultsFromDefinition(definition);
                        return {
                            ...p,
                            values,
                            origin: makeOrigin(p.name, values),
                            source: p.source === "catalog" ? "downloaded" : p.source,
                        };
                    }));
                }
                return definition;
            }
            finally {
                definitionLoadsRef.current.delete(cacheKey);
            }
        })();
        definitionLoadsRef.current.set(cacheKey, load);
        return load;
    }, []);
    const ensureStyleDownloaded = useCallback(async (styleId) => {
        const hostAppId = getResolvedHostSync() ?? csi.hostEnvironment?.appId;
        const localPaths = getLocalStyleAssetPaths(styleId);
        const hasHostFile = hostAppId === "PPRO" ? !!localPaths?.mogrt : !!(localPaths?.aep || localPaths?.mogrt);
        if (hasHostFile) {
            applyPreparedAssets(localPaths);
            const definition = await ensureDefinitionLoaded(styleId);
            await ensureCaptionFontsInstalled(styleId, definition).catch(() => 0);
            return;
        }
        const fromCatalog = presets.find((p) => p.styleId === styleId);
        const { preset, definition } = await downloadStylePackage(styleId, {
            // Pack download ignores per-style `files`; keep true so preflight/UI stay sane.
            files: { mogrt: true, aep: true, definition: !!fromCatalog?.files?.definition },
            name: fromCatalog?.name,
            controlsUrl: fromCatalog?.controlsUrl,
            previewImageUrl: fromCatalog?.previewImageUrl,
            previewVideoUrl: fromCatalog?.previewVideoUrl,
        });
        await ensureCaptionFontsInstalled(styleId, definition).catch(() => 0);
        setDefinitions((prev) => ({ ...prev, [styleId]: definition }));
        setPresets((prev) => {
            const prevItem = prev.find((p) => p.id === styleId);
            const nextPreset = {
                ...preset,
                favorite: prevItem?.favorite ?? false,
                categoryName: prevItem?.categoryName ?? preset.categoryName,
                tags: prevItem?.tags ?? (prevItem?.categoryName ? [prevItem.categoryName] : preset.tags),
                previewImageUrl: prevItem?.previewImageUrl ?? preset.previewImageUrl,
                previewVideoUrl: prevItem?.previewVideoUrl ?? preset.previewVideoUrl,
                controlsUrl: prevItem?.controlsUrl ?? preset.controlsUrl,
                files: prevItem?.files ?? preset.files,
            };
            const without = prev.filter((p) => p.id !== styleId);
            return [...without, nextPreset];
        });
        applyPreparedAssets(getLocalStyleAssetPaths(styleId));
    }, [applyPreparedAssets, ensureDefinitionLoaded, presets]);
    const syncSelectedPresetFontFromHost = useCallback((rawId) => {
        const trimmed = String(rawId || "").trim();
        if (!trimmed)
            return;
        const write = (fontId) => {
            const presetId = selectedPresetIdRef.current;
            const selected = presetsRef.current.find((p) => p.id === presetId);
            if (!selected)
                return;
            const definition = definitionsRef.current[definitionCacheKey(selected)];
            const control = findFontControl(definition);
            if (!control)
                return;
            const current = fontIdFromValue(selected.values[control.id]);
            if (current.toLowerCase() === fontId.toLowerCase())
                return;
            const nextValue = control.type === ControlType.FontMenu
                ? fontId
                : { strDB: [{ localeString: "en_US", str: fontId }] };
            setPresets((prev) => prev.map((p) => {
                if (p.id !== presetId)
                    return p;
                return {
                    ...p,
                    values: { ...p.values, [control.id]: nextValue },
                    origin: {
                        ...p.origin,
                        values: { ...p.origin.values, [control.id]: nextValue },
                    },
                };
            }));
        };
        void getFontCatalog().then((catalog) => {
            const face = resolveFontFace(catalog, trimmed);
            write(face.id || trimmed);
        });
    }, []);
    const applyValuesTimer = useRef(null);
    const applyInFlight = useRef(false);
    const pendingStyleApply = useRef(null);
    const lastPushedProps = useRef(null);
    const flushStyleValuesToHost = useCallback((styleId, values, full, definitionOverride, applyInit = false) => {
        const definition = definitionOverride ?? definitions[styleId] ?? definitionsRef.current[styleId];
        if (!definition?.clientControls?.length)
            return Promise.resolve();
        const uiProps = stylePropsFromValues(definition, values);
        const initProps = applyInit ? stylePropsFromInit(definition) : [];
        const nextProps = initProps.length ? initProps : uiProps;
        if (!nextProps.length)
            return Promise.resolve();
        const cacheProps = uiProps.length ? uiProps : nextProps;
        const prev = lastPushedProps.current;
        const props = full || !prev || prev.styleId !== styleId ? nextProps : diffStyleProps(prev.props, cacheProps);
        if (!props.length) {
            lastPushedProps.current = { styleId, props: cacheProps };
            return Promise.resolve();
        }
        let sequenceId;
        let compId;
        let trackIndex;
        const hostRef = readCaptionHostRef();
        if (hostRef) {
            sequenceId = hostRef.sequenceId;
            if (typeof hostRef.compId === "number") {
                compId = hostRef.compId;
            }
            if (typeof hostRef.trackIndex === "number") {
                trackIndex = hostRef.trackIndex;
            }
        }
        applyInFlight.current = true;
        lastPushedProps.current = { styleId, props: cacheProps };
        const hostApi = hostSdk();
        return hostApi
            .applyCaptionStyleValues({ props, sequenceId, compId, trackIndex })
            .catch((err) => {
            console.warn("[Styles] applyCaptionStyleValues failed", err);
        })
            .finally(() => {
            applyInFlight.current = false;
            const pending = pendingStyleApply.current;
            if (!pending)
                return;
            pendingStyleApply.current = null;
            void flushStyleValuesToHost(pending.styleId, pending.values, pending.full, pending.definition, pending.applyInit);
        })
            .then(() => undefined);
    }, [definitions]);
    /** Пушим values в caption-клипы: debounce + один in-flight evalScript, только дельта. */
    const pushStyleValuesToHost = useCallback((styleId, values, opts) => {
        const definition = opts?.definition ?? definitions[styleId];
        if (!definition?.clientControls?.length)
            return;
        if (applyValuesTimer.current)
            clearTimeout(applyValuesTimer.current);
        applyValuesTimer.current = setTimeout(() => {
            if (applyInFlight.current) {
                const prev = pendingStyleApply.current;
                pendingStyleApply.current = {
                    styleId,
                    values,
                    full: !!opts?.full || !!prev?.full,
                    applyInit: !!opts?.applyInit || !!prev?.applyInit,
                    definition: opts?.definition ?? prev?.definition,
                };
                return;
            }
            void flushStyleValuesToHost(styleId, values, !!opts?.full, definition, !!opts?.applyInit);
        }, 40);
    }, [definitions, flushStyleValuesToHost]);
    const resolveDefinitionForApply = useCallback(async (preset) => {
        let force = false;
        try {
            force = await refreshCaptionControlsIfRemoteNewer(preset.styleId);
        }
        catch {
            force = false;
        }
        if (force)
            clearCaptionControlsCache();
        return ensureDefinitionLoaded(preset.id, { force });
    }, [ensureDefinitionLoaded]);
    const valuesForHostApply = (preset, definition) => {
        const base = Object.keys(preset.values || {}).length
            ? { ...preset.values }
            : defaultsFromDefinition(definition);
        if (preset.source === "user")
            return base;
        return catalogApplyValues(base, definition);
    };
    const resetCatalogPresetValues = (presetId, definition) => {
        const values = defaultsFromDefinition(definition);
        setPresets((prev) => prev.map((p) => {
            if (p.id !== presetId || p.source === "user")
                return p;
            return { ...p, values, origin: makeOrigin(p.name, values) };
        }));
    };
    const applySelectedPresetToHost = useCallback(async () => {
        const selected = presetsRef.current.find((p) => p.id === selectedPresetIdRef.current);
        if (!selected)
            return;
        if (!readCaptionHostRef())
            return;
        const definition = await resolveDefinitionForApply(selected);
        if (!definition?.clientControls?.length && !definition?.init?.length)
            return;
        const latest = presetsRef.current.find((p) => p.id === selected.id) ?? selected;
        const cacheKey = definitionCacheKey(latest);
        const values = valuesForHostApply(latest, definition);
        if (latest.source !== "user")
            resetCatalogPresetValues(latest.id, definition);
        if (applyValuesTimer.current)
            clearTimeout(applyValuesTimer.current);
        pendingStyleApply.current = null;
        setAcquireStatus("applying");
        try {
            await flushStyleValuesToHost(cacheKey, values, true, definition, true);
            setAcquireStatus("ready");
        }
        catch (err) {
            console.warn("[Styles] applySelectedPresetToHost failed", err);
            setAcquireStatus("error");
        }
    }, [ensureDefinitionLoaded, flushStyleValuesToHost, resolveDefinitionForApply]);
    const selectPresetGen = useRef(0);
    /** Выбор в UI. Смена пресета пушит values (без replaceSource); pack template — общий на пак. */
    const selectPreset = (id, opts) => {
        setSelectedPresetId(id);
        setAcquireStatus("idle");
        const target = presets.find((p) => p.id === id);
        if (!target)
            return;
        const paths = getLocalStyleAssetPaths(target.styleId);
        if (paths?.mogrt || paths?.aep) {
            applyPreparedAssets(paths);
        }
        else {
            setPresetAssets(null);
            setMogrtPath("");
            setAepPath("");
        }
        const applyToHost = opts?.applyToHost !== false;
        const gen = ++selectPresetGen.current;
        void (async () => {
            try {
                const definition = applyToHost
                    ? await resolveDefinitionForApply(target)
                    : await ensureDefinitionLoaded(target.id);
                if (selectPresetGen.current !== gen)
                    return;
                if (!applyToHost)
                    return;
                const hostRef = readCaptionHostRef();
                if (!hostRef)
                    return;
                // Ensure this pack's .aep/.mogrt is on disk (no per-style project swap).
                setAcquireStatus("downloading");
                await ensureStyleDownloaded(target.styleId);
                if (selectPresetGen.current !== gen)
                    return;
                applyPreparedAssets(getLocalStyleAssetPaths(target.styleId));
                if (!definition?.clientControls?.length && !definition?.init?.length) {
                    setAcquireStatus("ready");
                    return;
                }
                setAcquireStatus("applying");
                const latest = presetsRef.current.find((p) => p.id === id) ?? target;
                const cacheKey = definitionCacheKey(latest);
                const values = valuesForHostApply(latest, definition);
                if (latest.source !== "user")
                    resetCatalogPresetValues(latest.id, definition);
                lastPushedProps.current = null;
                if (applyValuesTimer.current)
                    clearTimeout(applyValuesTimer.current);
                pendingStyleApply.current = null;
                await flushStyleValuesToHost(cacheKey, values, true, definition, true);
                if (selectPresetGen.current !== gen)
                    return;
                setAcquireStatus("ready");
            }
            catch (err) {
                if (selectPresetGen.current !== gen)
                    return;
                console.warn("[Styles] selectPreset apply failed", err);
                setAcquireStatus("error");
            }
        })();
    };
    const updateSelectedPreset = (patch) => {
        const selected = presets.find((p) => p.id === selectedPresetId);
        setPresets((prev) => prev.map((p) => {
            if (p.id !== selectedPresetId)
                return p;
            return {
                ...p,
                name: patch.name ?? p.name,
                favorite: patch.favorite ?? p.favorite,
                values: patch.values ? { ...patch.values } : p.values,
            };
        }));
        if (patch.values && selected) {
            pushStyleValuesToHost(definitionCacheKey(selected), patch.values);
            if (selected.source === "user") {
                const def = definitionsRef.current[selected.id];
                if (def) {
                    const doc = buildUserControlsDocument(def, patch.values);
                    saveUserControls(selected.id, doc);
                    setDefinitions((prev) => ({
                        ...prev,
                        [selected.id]: {
                            ...def,
                            init: Array.isArray(doc.init) ? doc.init : def.init,
                            controlsDocument: doc,
                        },
                    }));
                }
            }
        }
    };
    const addPreset = (patch) => {
        const selected = presets.find((p) => p.id === selectedPresetId);
        const styleId = patch?.styleId ?? selected?.styleId ?? "";
        const parentKey = selected ? definitionCacheKey(selected) : styleId;
        const parentDef = definitions[parentKey] ?? definitions[styleId];
        const id = "user-" + Date.now();
        const name = patch?.name ?? "New Preset";
        const sliderValues = {
            ...(parentDef ? defaultsFromDefinition(parentDef) : {}),
            ...(patch?.values ?? selected?.values ?? {}),
        };
        const doc = parentDef ? buildUserControlsDocument(parentDef, sliderValues) : { init: [] };
        saveUserControls(id, doc);
        const userDef = loadUserControlsDefinition(id) ?? parentDef;
        if (userDef) {
            setDefinitions((prev) => ({ ...prev, [id]: userDef }));
        }
        const values = userDef
            ? defaultsFromDefinition(userDef)
            : sliderValues;
        const preset = {
            id,
            name,
            favorite: patch?.favorite ?? false,
            styleId,
            styleVersion: patch?.styleVersion ?? selected?.styleVersion ?? "",
            source: "user",
            values,
            origin: makeOrigin(name, values),
            preview: patch?.preview ?? selected?.preview,
            controlsUrl: patch?.controlsUrl ?? selected?.controlsUrl,
            previewImageUrl: patch?.previewImageUrl ?? selected?.previewImageUrl,
            previewVideoUrl: patch?.previewVideoUrl ?? selected?.previewVideoUrl,
            files: selected?.files ?? patch?.files,
        };
        setPresets((prev) => [...prev, preset]);
        setSelectedPresetId(id);
        if (userDef?.clientControls?.length || userDef?.init?.length) {
            pushStyleValuesToHost(id, values, { full: true, definition: userDef, applyInit: true });
        }
        return id;
    };
    const toggleFavorite = (id) => setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)));
    const deletePreset = (id) => setPresets((prev) => {
        const target = prev.find((p) => p.id === id);
        // серверные стили из каталога не удаляем — только user
        if (!target || target.source !== "user")
            return prev;
        removeUserControls(id);
        const next = prev.filter((p) => p.id !== id);
        if (selectedPresetId === id)
            setSelectedPresetId(next[0]?.id ?? "");
        return next;
    });
    useEffect(() => {
        if (booted.current)
            return;
        booted.current = true;
        window.setTimeout(() => {
            void getFontCatalog();
        }, 0);
        void refreshStyles();
    }, [refreshStyles]);
    useEffect(() => {
        panelStore.setItem(STORAGE_KEY, JSON.stringify({
            mode,
            lines,
            characters,
            fontSize,
            mogrtPath,
            audioPresetPath,
            srcLang,
            translateTo,
            chaptersSrcLang,
            chaptersTranslateTo,
        }));
    }, [
        mode,
        lines,
        characters,
        fontSize,
        mogrtPath,
        audioPresetPath,
        srcLang,
        translateTo,
        chaptersSrcLang,
        chaptersTranslateTo,
    ]);
    useEffect(() => {
        if (stylesStatus !== "ready")
            return;
        persistStylesUiState(presets, selectedPresetId, definitions);
    }, [presets, selectedPresetId, stylesStatus, definitions]);
    return (_jsx(ConfigurationContext.Provider, { value: {
            mode,
            lines,
            characters,
            fontSize,
            mogrtPath,
            aepPath,
            audioPresetPath,
            srcLang,
            translateTo,
            chaptersSrcLang,
            chaptersTranslateTo,
            presets,
            selectedPresetId,
            stylesStatus,
            stylesError,
            definitions,
            refreshingStyles,
            acquireStatus,
            presetAssets,
            updateMode,
            updateLines,
            updateCharacters,
            updateFontSize,
            updateMogrtPath,
            updateAudioPresetPath,
            updateSrcLang,
            updateTranslateTo,
            updateChaptersSrcLang,
            updateChaptersTranslateTo,
            selectPreset,
            updateSelectedPreset,
            addPreset,
            toggleFavorite,
            deletePreset,
            refreshStyles,
            ensureStyleDownloaded,
            ensureDefinitionLoaded,
            applySelectedPresetToHost,
            syncSelectedPresetFontFromHost,
        }, children: children }));
};
export const useConfiguration = () => {
    const context = useContext(ConfigurationContext);
    if (!context)
        throw new Error("This hook can be used only under ConfigurationContext");
    return context;
};
