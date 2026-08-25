import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  clearCaptionControlsCache,
  downloadStylePackage,
  ensureDefinitionForStyle,
  getLocalStyleAssetPaths,
  isPresetDirty,
  isPresetValuesDirty,
  loadLocalState,
  makeOrigin,
  presetSwatchColors,
  refreshCaptionControlsIfRemoteNewer,
  saveLocalState,
  syncCaptionStyles,
  type AcquirePresetStatus,
  type LocalStyleAssetPaths,
  type StylePreset,
  type StylesSyncStatus,
} from "../js/styles";
import { friendlyErrorMessage } from "../js/utils/user-error";
import {
  CATALOG_LAYOUT_OVERRIDES,
  ControlType,
  defaultsFromDefinition,
  diffStyleProps,
  findControlBySource,
  findFontControl,
  fontIdFromValue,
  stylePropsFromValues,
  withCatalogApplyValues,
  type StylePropPayload,
} from "../js/presets";
import type { ControlValues, MogrtDefinition } from "../js/presets";
import type { GroupingMode } from "../js/utils/transcribe";
import { csi } from "../js/lib/utils/bolt";
import { hostSdk } from "../js/sdk";
import * as panelStore from "../js/lib/userdata-store";
import { getResolvedHostSync } from "../js/lib/utils/host-identity";
import { getFontCatalog, resolveFontFace } from "../js/lib/utils/system-fonts";

export type { StylePreset } from "../js/styles";
export { isPresetDirty, isPresetValuesDirty, presetSwatchColors };

type CaptionHostRef = { sequenceId?: string; compId?: number; trackIndex?: number };

const readCaptionHostRef = (): CaptionHostRef | null => {
  try {
    const raw = panelStore.getItem("aitools-cep-caption-meta");
    if (!raw) return null;
    const meta = JSON.parse(raw) as { hostRef?: CaptionHostRef };
    return meta.hostRef || null;
  } catch {
    return null;
  }
};

interface IConfigurationValue {
  mode: GroupingMode;
  lines: number;
  characters: number;
  fontSize: number;
  mogrtPath: string;
  /** Локальный путь к .aep выбранного пресета (если скачан). */
  aepPath: string;
  audioPresetPath: string;
  srcLang: string;
  translateTo: string;
  chaptersSrcLang: string;
  chaptersTranslateTo: string;
  presets: StylePreset[];
  selectedPresetId: string;
  stylesStatus: StylesSyncStatus;
  stylesError: string | null;
  definitions: Record<string, MogrtDefinition>;
  refreshingStyles: boolean;
  /** Статус verify → download → apply после выбора пресета. */
  acquireStatus: AcquirePresetStatus;
  presetAssets: LocalStyleAssetPaths | null;
  updateMode: (value: GroupingMode) => void;
  updateLines: (value: number) => void;
  updateCharacters: (value: number) => void;
  updateFontSize: (value: number) => void;
  updateMogrtPath: (value: string) => void;
  updateAudioPresetPath: (value: string) => void;
  updateSrcLang: (value: string) => void;
  updateTranslateTo: (value: string) => void;
  updateChaptersSrcLang: (value: string) => void;
  updateChaptersTranslateTo: (value: string) => void;
  selectPreset: (id: string, opts?: { applyToHost?: boolean }) => void;
  updateSelectedPreset: (patch: Partial<StylePreset>) => void;
  addPreset: (patch?: Partial<StylePreset>) => string;
  toggleFavorite: (id: string) => void;
  deletePreset: (id: string) => void;
  refreshStyles: () => Promise<void>;
  ensureStyleDownloaded: (styleId: string) => Promise<void>;
  /** Подтянуть controls.json для Styles UI (можно до Transcribe). */
  ensureDefinitionLoaded: (styleId: string, opts?: { force?: boolean }) => Promise<MogrtDefinition>;
  /** Применить values выбранного пресета к caption MOGRT на таймлайне (full push). */
  applySelectedPresetToHost: () => Promise<void>;
  /** Подставить шрифт с клипа (systemName mogrt) в Typography без записи обратно в хост. */
  syncSelectedPresetFontFromHost: (fontId: string) => void;
}

const defaultValue: IConfigurationValue = {
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
  updateMode: () => {},
  updateLines: () => {},
  updateCharacters: () => {},
  updateFontSize: () => {},
  updateMogrtPath: () => {},
  updateAudioPresetPath: () => {},
  updateSrcLang: () => {},
  updateTranslateTo: () => {},
  updateChaptersSrcLang: () => {},
  updateChaptersTranslateTo: () => {},
  selectPreset: () => {},
  updateSelectedPreset: () => {},
  addPreset: () => "",
  toggleFavorite: () => {},
  deletePreset: () => {},
  refreshStyles: async () => {},
  ensureStyleDownloaded: async () => {},
  ensureDefinitionLoaded: async () => ({ clientControls: [] }),
  applySelectedPresetToHost: async () => {},
  syncSelectedPresetFontFromHost: () => {},
};

const STORAGE_KEY = "aitools-cep-config";

type StoredConfig = Pick<
  IConfigurationValue,
  | "mode"
  | "lines"
  | "characters"
  | "fontSize"
  | "mogrtPath"
  | "audioPresetPath"
  | "srcLang"
  | "translateTo"
  | "chaptersSrcLang"
  | "chaptersTranslateTo"
>;

const loadConfig = (): StoredConfig => {
  try {
    const stored = panelStore.getItem(STORAGE_KEY);
    if (!stored) return defaultValue;
    const parsed = JSON.parse(stored) as Partial<StoredConfig>;
    return {
      mode: parsed.mode ?? defaultValue.mode,
      lines: Number.isFinite(parsed.lines) ? (parsed.lines as number) : defaultValue.lines,
      characters: Number.isFinite(parsed.characters) ? (parsed.characters as number) : defaultValue.characters,
      fontSize: Number.isFinite(parsed.fontSize) ? (parsed.fontSize as number) : defaultValue.fontSize,
      mogrtPath: parsed.mogrtPath ?? defaultValue.mogrtPath,
      audioPresetPath: parsed.audioPresetPath ?? defaultValue.audioPresetPath,
      srcLang: parsed.srcLang ?? defaultValue.srcLang,
      translateTo: parsed.translateTo ?? defaultValue.translateTo,
      chaptersSrcLang: parsed.chaptersSrcLang ?? defaultValue.chaptersSrcLang,
      chaptersTranslateTo: parsed.chaptersTranslateTo ?? defaultValue.chaptersTranslateTo,
    };
  } catch {
    return defaultValue;
  }
};

const persistStylesUiState = (presets: StylePreset[], selectedPresetId: string) => {
  const favorites: Record<string, boolean> = {};
  const downloadedEdits: Record<string, StylePreset> = {};
  for (const p of presets) {
    if (p.favorite) favorites[p.id] = true;
    if (p.source === "downloaded") downloadedEdits[p.id] = p;
  }
  const prev = loadLocalState();
  saveLocalState({
    ...prev,
    selectedPresetId,
    favorites,
    userPresets: presets.filter((p) => p.source === "user"),
    downloadedEdits,
  });
};

const ConfigurationContext = createContext<IConfigurationValue>(defaultValue);

export const ConfigurationWrapper = ({ children }: { children: ReactNode }) => {
  const initial = loadConfig();
  const [mode, setMode] = useState<GroupingMode>(initial.mode);
  const [lines, setLines] = useState(initial.lines);
  const [characters, setCharacters] = useState(initial.characters);
  const [fontSize, setFontSize] = useState(initial.fontSize);
  const [mogrtPath, setMogrtPath] = useState(initial.mogrtPath);
  const [audioPresetPath, setAudioPresetPath] = useState(initial.audioPresetPath);
  const [srcLang, setSrcLang] = useState(initial.srcLang);
  const [translateTo, setTranslateTo] = useState(initial.translateTo);
  const [chaptersSrcLang, setChaptersSrcLang] = useState(initial.chaptersSrcLang);
  const [chaptersTranslateTo, setChaptersTranslateTo] = useState(initial.chaptersTranslateTo);
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [stylesStatus, setStylesStatus] = useState<StylesSyncStatus>("idle");
  const [stylesError, setStylesError] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, MogrtDefinition>>({});
  const [refreshingStyles, setRefreshingStyles] = useState(false);
  const [acquireStatus, setAcquireStatus] = useState<AcquirePresetStatus>("idle");
  const [presetAssets, setPresetAssets] = useState<LocalStyleAssetPaths | null>(null);
  const [aepPath, setAepPath] = useState("");
  const booted = useRef(false);
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  const selectedPresetIdRef = useRef(selectedPresetId);
  selectedPresetIdRef.current = selectedPresetId;
  const definitionLoadsRef = useRef(new Map<string, Promise<MogrtDefinition>>());

  const updateMode = (value: GroupingMode) => setMode(value);
  const updateLines = (value: number) => setLines(value);
  const updateCharacters = (value: number) => setCharacters(value);
  const updateFontSize = (value: number) => setFontSize(value);
  const updateMogrtPath = (value: string) => setMogrtPath(value);
  const updateAudioPresetPath = (value: string) => setAudioPresetPath(value);
  const updateSrcLang = (value: string) => setSrcLang(value);
  const updateTranslateTo = (value: string) => setTranslateTo(value);
  const updateChaptersSrcLang = (value: string) => setChaptersSrcLang(value);
  const updateChaptersTranslateTo = (value: string) => setChaptersTranslateTo(value);

  const applyPreparedAssets = useCallback((paths: LocalStyleAssetPaths | null) => {
    setPresetAssets(paths);
    if (paths?.mogrt) setMogrtPath(paths.mogrt);
    if (paths?.aep) setAepPath(paths.aep);
  }, []);

  const applySyncResult = useCallback(
    (result: Awaited<ReturnType<typeof syncCaptionStyles>>) => {
      setPresets(result.presets);
      setDefinitions(result.definitions);
      setSelectedPresetId(result.selectedPresetId);
      setStylesError(result.error ?? null);
      setStylesStatus("ready");
      const selected = result.presets.find((p) => p.id === result.selectedPresetId);
      if (selected) {
        applyPreparedAssets(getLocalStyleAssetPaths(selected.styleId));
      }
    },
    [applyPreparedAssets],
  );

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
    } catch (err) {
      setStylesError(friendlyErrorMessage(err));
      setStylesStatus("error");
    } finally {
      setRefreshingStyles(false);
    }
  }, [applySyncResult]);

  const ensureDefinitionLoaded = useCallback(async (styleId: string, opts?: { force?: boolean }) => {
    if (!opts?.force) {
      const cached = definitionsRef.current[styleId];
      if (cached?.clientControls?.length) return cached;

      const inflight = definitionLoadsRef.current.get(styleId);
      if (inflight) return inflight;
    } else {
      definitionLoadsRef.current.delete(styleId);
    }

    const load = (async () => {
      try {
        const fromCatalog = presetsRef.current.find((p) => p.styleId === styleId);
        const definition = await ensureDefinitionForStyle(styleId, {
          files: fromCatalog?.files,
          name: fromCatalog?.name,
          controlsUrl: fromCatalog?.controlsUrl,
          previewImageUrl: fromCatalog?.previewImageUrl,
          previewVideoUrl: fromCatalog?.previewVideoUrl,
          force: opts?.force,
        });
        if (opts?.force && !definition.clientControls?.length) {
          const prev = definitionsRef.current[styleId];
          if (prev?.clientControls?.length) return prev;
        }
        setDefinitions((prev) => {
          const existing = prev[styleId];
          if (existing?.clientControls?.length && !definition.clientControls?.length) {
            return prev;
          }
          return { ...prev, [styleId]: definition };
        });
        if (definition.clientControls?.length) {
          setPresets((prev) =>
            prev.map((p) => {
              if (p.styleId !== styleId) return p;
              if (p.source === "user") return p;
              if (opts?.force && isPresetValuesDirty(p)) return p;
              if (opts?.force || p.source === "catalog" || !Object.keys(p.values || {}).length) {
                const values = defaultsFromDefinition(definition);
                return {
                  ...p,
                  values,
                  origin: makeOrigin(p.name, values),
                  source: p.source === "catalog" ? "downloaded" : p.source,
                };
              }
              return p;
            }),
          );
        }
        return definition;
      } finally {
        definitionLoadsRef.current.delete(styleId);
      }
    })();

    definitionLoadsRef.current.set(styleId, load);
    return load;
  }, []);

  const ensureStyleDownloaded = useCallback(
    async (styleId: string) => {
      const hostAppId = getResolvedHostSync() ?? csi.hostEnvironment?.appId;
      const localPaths = getLocalStyleAssetPaths();
      const hasHostFile =
        hostAppId === "PPRO" ? !!localPaths?.mogrt : !!(localPaths?.aep || localPaths?.mogrt);

      if (hasHostFile) {
        applyPreparedAssets(localPaths);
        await ensureDefinitionLoaded(styleId);
        return;
      }

      const fromCatalog = presets.find((p) => p.styleId === styleId);
      const { preset, definition } = await downloadStylePackage(styleId, {
        // Master download ignores these; keep true so preflight/UI stay sane.
        files: { mogrt: true, aep: true, definition: !!fromCatalog?.files?.definition },
        name: fromCatalog?.name,
        controlsUrl: fromCatalog?.controlsUrl,
        previewImageUrl: fromCatalog?.previewImageUrl,
        previewVideoUrl: fromCatalog?.previewVideoUrl,
      });
      setDefinitions((prev) => ({ ...prev, [styleId]: definition }));
      setPresets((prev) => {
        const prevItem = prev.find((p) => p.id === styleId);
        const nextPreset: StylePreset = {
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
      applyPreparedAssets(getLocalStyleAssetPaths());
    },
    [applyPreparedAssets, ensureDefinitionLoaded, presets],
  );

  const syncSelectedPresetFontFromHost = useCallback((rawId: string) => {
    const trimmed = String(rawId || "").trim();
    if (!trimmed) return;

    const write = (fontId: string) => {
      const presetId = selectedPresetIdRef.current;
      const selected = presetsRef.current.find((p) => p.id === presetId);
      if (!selected) return;
      const definition = definitionsRef.current[selected.styleId];
      const control = findFontControl(definition);
      if (!control) return;
      const current = fontIdFromValue(selected.values[control.id]);
      if (current.toLowerCase() === fontId.toLowerCase()) return;
      const nextValue =
        control.type === ControlType.FontMenu
          ? fontId
          : { strDB: [{ localeString: "en_US", str: fontId }] };
      setPresets((prev) =>
        prev.map((p) => {
          if (p.id !== presetId) return p;
          return {
            ...p,
            values: { ...p.values, [control.id]: nextValue },
            origin: {
              ...p.origin,
              values: { ...p.origin.values, [control.id]: nextValue },
            },
          };
        }),
      );
    };

    void getFontCatalog().then((catalog) => {
      const face = resolveFontFace(catalog, trimmed);
      write(face.id || trimmed);
    });
  }, []);

  const applyValuesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyInFlight = useRef(false);
  const pendingStyleApply = useRef<{
    styleId: string;
    values: ControlValues;
    full: boolean;
    definition?: MogrtDefinition;
  } | null>(null);
  const lastPushedProps = useRef<{ styleId: string; props: StylePropPayload[] } | null>(null);

  const flushStyleValuesToHost = useCallback(
    (
      styleId: string,
      values: ControlValues,
      full: boolean,
      definitionOverride?: MogrtDefinition,
    ): Promise<void> => {
      const definition = definitionOverride ?? definitions[styleId];
      if (!definition?.clientControls?.length) return Promise.resolve();
      const nextProps = stylePropsFromValues(definition, values);
      if (!nextProps.length) return Promise.resolve();

      const prev = lastPushedProps.current;
      const props =
        full || !prev || prev.styleId !== styleId ? nextProps : diffStyleProps(prev.props, nextProps);
      if (!props.length) {
        lastPushedProps.current = { styleId, props: nextProps };
        return Promise.resolve();
      }

      let sequenceId: string | undefined;
      let compId: number | undefined;
      let trackIndex: number | undefined;
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
      lastPushedProps.current = { styleId, props: nextProps };
      const hostApi = hostSdk();
      return hostApi
        .applyCaptionStyleValues({ props, sequenceId, compId, trackIndex })
        .catch((err) => {
          console.warn("[Styles] applyCaptionStyleValues failed", err);
        })
        .finally(() => {
          applyInFlight.current = false;
          const pending = pendingStyleApply.current;
          if (!pending) return;
          pendingStyleApply.current = null;
          void flushStyleValuesToHost(
            pending.styleId,
            pending.values,
            pending.full,
            pending.definition,
          );
        })
        .then(() => undefined);
    },
    [definitions],
  );

  /** Пушим values в caption-клипы: debounce + один in-flight evalScript, только дельта. */
  const pushStyleValuesToHost = useCallback(
    (styleId: string, values: ControlValues, opts?: { full?: boolean; definition?: MogrtDefinition }) => {
      const definition = opts?.definition ?? definitions[styleId];
      if (!definition?.clientControls?.length) return;
      if (applyValuesTimer.current) clearTimeout(applyValuesTimer.current);
      applyValuesTimer.current = setTimeout(() => {
        if (applyInFlight.current) {
          const prev = pendingStyleApply.current;
          pendingStyleApply.current = {
            styleId,
            values,
            full: !!opts?.full || !!prev?.full,
            definition: opts?.definition ?? prev?.definition,
          };
          return;
        }
        void flushStyleValuesToHost(styleId, values, !!opts?.full, definition);
      }, 40);
    },
    [definitions, flushStyleValuesToHost],
  );

  const resolveDefinitionForApply = useCallback(async (styleId: string): Promise<MogrtDefinition> => {
    let force = false;
    try {
      force = await refreshCaptionControlsIfRemoteNewer();
    } catch {
      force = false;
    }
    if (force) clearCaptionControlsCache();
    return ensureDefinitionLoaded(styleId, { force });
  }, [ensureDefinitionLoaded]);

  const valuesForHostApply = (preset: StylePreset, definition: MogrtDefinition) => {
    const base = Object.keys(preset.values || {}).length
      ? { ...preset.values }
      : defaultsFromDefinition(definition);
    if (preset.source === "user") return base;
    return withCatalogApplyValues(base, definition);
  };

  const persistCatalogApplyValues = (presetId: string, values: ControlValues, definition: MogrtDefinition) => {
    setPresets((prev) =>
      prev.map((p) => {
        if (p.id !== presetId) return p;
        if (!isPresetValuesDirty(p)) {
          return { ...p, values, origin: makeOrigin(p.name, values) };
        }
        const originValues = { ...p.origin.values };
        const font = findFontControl(definition);
        if (font && values[font.id] !== undefined) originValues[font.id] = values[font.id];
        for (const item of CATALOG_LAYOUT_OVERRIDES) {
          const control = findControlBySource(definition, item.source);
          if (control && values[control.id] !== undefined) originValues[control.id] = values[control.id];
        }
        return { ...p, values, origin: { ...p.origin, values: originValues } };
      }),
    );
  };

  const applySelectedPresetToHost = useCallback(async (): Promise<void> => {
    const selected = presetsRef.current.find((p) => p.id === selectedPresetIdRef.current);
    if (!selected) return;
    if (!readCaptionHostRef()) return;

    const definition = await resolveDefinitionForApply(selected.styleId);
    if (!definition?.clientControls?.length) return;

    const latest = presetsRef.current.find((p) => p.id === selected.id) ?? selected;
    const values = valuesForHostApply(latest, definition);
    if (latest.source !== "user") persistCatalogApplyValues(latest.id, values, definition);

    if (applyValuesTimer.current) clearTimeout(applyValuesTimer.current);
    await flushStyleValuesToHost(latest.styleId, values, true, definition);
  }, [ensureDefinitionLoaded, flushStyleValuesToHost, resolveDefinitionForApply]);

  const selectPresetGen = useRef(0);

  /** Выбор в UI. Shared master — смена пресета только пушит values (без replaceSource). */
  const selectPreset = (id: string, opts?: { applyToHost?: boolean }) => {
    setSelectedPresetId(id);
    setAcquireStatus("idle");
    const target = presets.find((p) => p.id === id);
    if (!target) return;

    const paths = getLocalStyleAssetPaths();
    if (paths?.mogrt || paths?.aep) {
      applyPreparedAssets(paths);
    } else {
      setPresetAssets(null);
      setMogrtPath("");
      setAepPath("");
    }

    const applyToHost = opts?.applyToHost !== false;
    const gen = ++selectPresetGen.current;

    void (async () => {
      try {
        const definition = applyToHost
          ? await resolveDefinitionForApply(target.styleId)
          : await ensureDefinitionLoaded(target.styleId);
        if (selectPresetGen.current !== gen) return;
        if (!applyToHost) return;

        const hostRef = readCaptionHostRef();
        if (!hostRef) return;

        // Ensure shared master is on disk (no per-style project swap).
        setAcquireStatus("downloading");
        await ensureStyleDownloaded(target.styleId);
        if (selectPresetGen.current !== gen) return;
        applyPreparedAssets(getLocalStyleAssetPaths());

        if (!definition?.clientControls?.length) {
          setAcquireStatus("ready");
          return;
        }
        setAcquireStatus("applying");
        const latest = presetsRef.current.find((p) => p.id === id) ?? target;
        const values = valuesForHostApply(latest, definition);
        if (latest.source !== "user") persistCatalogApplyValues(latest.id, values, definition);
        if (Object.keys(values).length) {
          lastPushedProps.current = null;
          pushStyleValuesToHost(latest.styleId, values, { full: true, definition });
        }
        setAcquireStatus("ready");
      } catch (err) {
        if (selectPresetGen.current !== gen) return;
        console.warn("[Styles] selectPreset apply failed", err);
        setAcquireStatus("error");
      }
    })();
  };

  const updateSelectedPreset = (patch: Partial<StylePreset>) => {
    const selected = presets.find((p) => p.id === selectedPresetId);
    setPresets((prev) =>
      prev.map((p) => {
        if (p.id !== selectedPresetId) return p;
        return {
          ...p,
          name: patch.name ?? p.name,
          favorite: patch.favorite ?? p.favorite,
          values: patch.values ? { ...patch.values } : p.values,
        };
      }),
    );
    if (patch.values && selected) {
      pushStyleValuesToHost(selected.styleId, patch.values);
    }
  };

  const addPreset = (patch?: Partial<StylePreset>) => {
    const selected = presets.find((p) => p.id === selectedPresetId);
    const styleId = patch?.styleId ?? selected?.styleId ?? "";
    const definition = definitions[styleId];
    const id = "user-" + Date.now();
    const name = patch?.name ?? "New Preset";
    const values: ControlValues = definition
      ? { ...defaultsFromDefinition(definition), ...patch?.values }
      : { ...(patch?.values ?? {}) };
    const preset: StylePreset = {
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
    };
    setPresets((prev) => [...prev, preset]);
    setSelectedPresetId(id);
    if (definition?.clientControls?.length) {
      pushStyleValuesToHost(styleId, values, { full: true, definition });
    } else if (styleId) {
      void ensureDefinitionLoaded(styleId).then((def) => {
        if (def?.clientControls?.length) {
          pushStyleValuesToHost(styleId, values, { full: true, definition: def });
        }
      });
    }
    return id;
  };

  const toggleFavorite = (id: string) => setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)));

  const deletePreset = (id: string) =>
    setPresets((prev) => {
      const target = prev.find((p) => p.id === id);
      // серверные стили из каталога не удаляем — только user
      if (!target || target.source !== "user") return prev;
      const next = prev.filter((p) => p.id !== id);
      if (selectedPresetId === id) setSelectedPresetId(next[0]?.id ?? "");
      return next;
    });

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    window.setTimeout(() => {
      void getFontCatalog();
    }, 0);
    void refreshStyles();
  }, [refreshStyles]);

  useEffect(() => {
    panelStore.setItem(
      STORAGE_KEY,
      JSON.stringify({
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
      }),
    );
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
    if (stylesStatus !== "ready") return;
    persistStylesUiState(presets, selectedPresetId);
  }, [presets, selectedPresetId, stylesStatus]);

  return (
    <ConfigurationContext.Provider
      value={{
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
      }}
    >
      {children}
    </ConfigurationContext.Provider>
  );
};

export const useConfiguration = () => {
  const context = useContext(ConfigurationContext);
  if (!context) throw new Error("This hook can be used only under ConfigurationContext");
  return context;
};
