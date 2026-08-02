import { useEffect, useState } from "react";
import { useConfiguration, isPresetDirty, isPresetValuesDirty } from "../../context/ConfigurationWrapper";
import type { StylePreset } from "../styles";
import { useStyleUndo } from "../hooks/useStyleUndo";
import { PresetFields } from "./PresetFields";
import "./StyleTab.scss";

const EMPTY_PRESET: StylePreset = {
  id: "",
  name: "",
  favorite: false,
  styleId: "",
  styleVersion: "",
  source: "user",
  values: {},
  origin: { name: "", values: {} },
};

export const StyleTab = () => {
  const {
    presets,
    selectedPresetId,
    updateSelectedPreset,
    addPreset,
    definitions,
    stylesStatus,
    ensureDefinitionLoaded,
  } = useConfiguration();

  const selected = presets.find((p) => p.id === selectedPresetId) ?? presets[0];
  const definition = selected ? definitions[selected.styleId] : undefined;
  const hasControls = !!(definition?.clientControls?.length);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [definitionError, setDefinitionError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected?.styleId || hasControls) {
      setLoadingDefinition(false);
      setDefinitionError(null);
      return;
    }
    let cancelled = false;
    setLoadingDefinition(true);
    setDefinitionError(null);
    ensureDefinitionLoaded(selected.styleId)
      .then((def) => {
        if (cancelled) return;
        if (!def?.clientControls?.length) {
          setDefinitionError("No style controls in definition.json for this caption.");
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setDefinitionError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingDefinition(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.styleId, hasControls, ensureDefinitionLoaded]);

  const { onChange } = useStyleUndo(selected ?? EMPTY_PRESET, updateSelectedPreset);
  const dirty = selected ? isPresetDirty(selected) : false;
  const valuesDirty = selected ? isPresetValuesDirty(selected) : false;

  if (stylesStatus === "loading" || stylesStatus === "idle") {
    return (
      <div className="style-tab style-tab--empty thin-scroll">
        <span className="spinner" />
        Loading styles…
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="style-tab style-tab--empty thin-scroll">
        <p>No style selected.</p>
        <p className="style-tab__hint">Choose a caption style on the main screen.</p>
      </div>
    );
  }

  if (loadingDefinition) {
    return (
      <div className="style-tab style-tab--empty thin-scroll">
        <span className="spinner" />
        Loading style controls…
      </div>
    );
  }

  if (!hasControls) {
    return (
      <div className="style-tab style-tab--empty thin-scroll">
        <p>{selected.name}</p>
        <p className="style-tab__hint">
          {definitionError ||
            "Style controls aren’t available for this caption (missing definition.json)."}
        </p>
      </div>
    );
  }

  return (
    <div className="style-tab thin-scroll" tabIndex={-1}>
      <div className="style-tab__editing-head">
        <span className="style-tab__section-label">EDITING · {selected.name}</span>
        {selected.updateAvailable && <span className="style-tab__update-pill">Update available</span>}
      </div>

      <PresetFields
        value={selected}
        definition={definition}
        onChange={onChange}
        dirty={dirty}
        nameEditable={valuesDirty}
        onReset={() =>
          onChange({
            name: selected.origin.name,
            values: JSON.parse(JSON.stringify(selected.origin.values)),
          })
        }
        onSaveAsNew={() =>
          addPreset({
            name: `${selected.name} Copy`,
            values: selected.values,
            favorite: false,
            styleId: selected.styleId,
            styleVersion: selected.styleVersion,
            preview: selected.preview,
            tags: selected.tags,
            categoryName: selected.categoryName,
          })
        }
      />
    </div>
  );
};
