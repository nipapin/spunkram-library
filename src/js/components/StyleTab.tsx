import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useConfiguration, isPresetDirty, isPresetValuesDirty } from "../../context/ConfigurationWrapper";
import type { StylePreset } from "../styles";
import { useStyleUndo } from "../hooks/useStyleUndo";
import { PresetFields } from "./PresetFields";
import { ChangePresetDialog } from "./ChangePresetDialog";
import { friendlyErrorMessage } from "../utils/user-error";
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
    acquireStatus,
  } = useConfiguration();

  const selected = presets.find((p) => p.id === selectedPresetId) ?? presets[0];
  const definition = selected ? definitions[selected.source === "user" ? selected.id : selected.styleId] : undefined;
  const hasControls = !!(definition?.clientControls?.length);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [definitionError, setDefinitionError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected?.id || hasControls) return;
    let cancelled = false;
    setLoadingDefinition(true);
    setDefinitionError(null);
    ensureDefinitionLoaded(selected.id)
      .then((def) => {
        if (cancelled) return;
        if (!def?.clientControls?.length) {
          setDefinitionError("No style controls in controls.json for this caption.");
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setDefinitionError(friendlyErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoadingDefinition(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, hasControls, ensureDefinitionLoaded]);

  const { onChange } = useStyleUndo(selected ?? EMPTY_PRESET, updateSelectedPreset);
  const dirty = selected ? isPresetDirty(selected) : false;
  const valuesDirty = selected ? isPresetValuesDirty(selected) : false;
  const [pickerOpen, setPickerOpen] = useState(false);
  const otherPresets = presets.filter((p) => p.id !== selected?.id).length;

  const changePreset = (
    <button
      type="button"
      className="btn btn--ghost style-tab__change-preset"
      disabled={otherPresets === 0 || acquireStatus === "downloading" || acquireStatus === "applying"}
      onClick={() => setPickerOpen(true)}
    >
      <LayoutGrid size={13} />
      Change Preset
    </button>
  );

  const picker = selected ? (
    <ChangePresetDialog
      open={pickerOpen}
      currentId={selected.id}
      currentName={selected.name}
      onClose={() => setPickerOpen(false)}
    />
  ) : null;

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

  if (hasControls && definition) {
    return (
      <div className="style-tab thin-scroll" tabIndex={-1}>
        <div className="style-tab__editing-head">
          <span className="style-tab__section-label">EDITING · {selected.name}</span>
          {selected.updateAvailable && <span className="style-tab__update-pill">Update available</span>}
        </div>
        {changePreset}
        {picker}
        {(acquireStatus === "downloading" || acquireStatus === "applying") && (
          <p className="style-tab__hint">
            {acquireStatus === "downloading" ? "Downloading style…" : "Applying style…"}
          </p>
        )}
        {acquireStatus === "error" && (
          <p className="style-tab__hint">Couldn’t apply this style to the selected caption.</p>
        )}

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
  }

  if (loadingDefinition) {
    return (
      <div className="style-tab style-tab--empty thin-scroll">
        <span className="spinner" />
        Loading style controls…
      </div>
    );
  }

  return (
    <div className="style-tab style-tab--empty thin-scroll">
      <p>{selected.name}</p>
      <p className="style-tab__hint">
        {definitionError ||
          "Style controls aren’t available for this caption (missing controls.json)."}
      </p>
      {changePreset}
      {picker}
      {(acquireStatus === "downloading" || acquireStatus === "applying") && (
        <p className="style-tab__hint">
          {acquireStatus === "downloading" ? "Downloading style…" : "Applying style…"}
        </p>
      )}
      {acquireStatus === "error" && (
        <p className="style-tab__hint">Couldn’t apply this style to the selected caption.</p>
      )}
    </div>
  );
};
