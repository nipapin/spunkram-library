import { useEffect, useState, type ReactNode } from "react";
import { LayoutGrid } from "lucide-react";
import { useConfiguration, isPresetDirty, isPresetValuesDirty } from "../../context/ConfigurationWrapper";
import type { StylePreset } from "../styles";
import type { AppliedSegmentConfig } from "../utils/transcribe";
import { useStyleUndo } from "../hooks/useStyleUndo";
import { PresetFields } from "./PresetFields";
import { ChangePresetDialog } from "./ChangePresetDialog";
import { ResegmentGroup } from "./ResegmentGroup";
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

interface StyleTabProps {
  onUpdateResegment: () => void;
  appliedResegmentConfig: AppliedSegmentConfig | null;
  resegmenting: boolean;
}

export const StyleTab = ({
  onUpdateResegment,
  appliedResegmentConfig,
  resegmenting,
}: StyleTabProps) => {
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
  const busy = acquireStatus === "downloading" || acquireStatus === "applying";
  const busyOverlay = busy ? (
    <div className="style-tab__busy" aria-live="polite">
      <span className="spinner" />
      {acquireStatus === "downloading" ? "Downloading style…" : "Applying style…"}
    </div>
  ) : null;

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

  const resegment = (
    <ResegmentGroup
      appliedConfig={appliedResegmentConfig}
      resegmenting={resegmenting}
      onUpdate={onUpdateResegment}
    />
  );

  const frame = (children: ReactNode) => (
    <div className={`style-tab thin-scroll${busy ? " style-tab--busy" : ""}`} tabIndex={-1}>
      {busyOverlay}
      {children}
    </div>
  );

  if (stylesStatus === "loading" || stylesStatus === "idle") {
    return frame(
      <>
        {resegment}
        <div className="style-tab__fill">
          <span className="spinner" />
          Loading styles…
        </div>
      </>,
    );
  }

  if (!selected) {
    return frame(
      <>
        {resegment}
        <div className="style-tab__fill">
          <p>No style selected.</p>
          <p className="style-tab__hint">Choose a caption style on the main screen.</p>
        </div>
      </>,
    );
  }

  if (hasControls && definition) {
    return frame(
      <>
        <div className="style-tab__editing-head">
          <span className="style-tab__section-label">EDITING · {selected.name}</span>
          <span className="style-tab__editing-actions">
            {selected.updateAvailable && <span className="style-tab__update-pill">Update available</span>}
            {changePreset}
          </span>
        </div>
        {picker}
        {acquireStatus === "error" && (
          <p className="style-tab__hint">Couldn’t apply this style to the selected caption.</p>
        )}

        <PresetFields
          value={selected}
          definition={definition}
          onChange={onChange}
          dirty={dirty}
          nameEditable={valuesDirty}
          leading={resegment}
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
      </>,
    );
  }

  if (loadingDefinition) {
    return frame(
      <>
        {resegment}
        <div className="style-tab__fill">
          <span className="spinner" />
          Loading style controls…
        </div>
      </>,
    );
  }

  return frame(
    <>
      {resegment}
      <div className="style-tab__fill">
        <p>{selected.name}</p>
        <p className="style-tab__hint">
          {definitionError ||
            "Style controls aren’t available for this caption (missing controls.json)."}
        </p>
        {changePreset}
        {picker}
        {acquireStatus === "error" && (
          <p className="style-tab__hint">Couldn’t apply this style to the selected caption.</p>
        )}
      </div>
    </>,
  );
};
