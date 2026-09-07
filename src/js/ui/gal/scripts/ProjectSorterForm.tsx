import { useEffect, useState } from "react";
import { MotionFlow } from "@/sdk";
import {
  loadSorterSettings,
  saveSorterSettings,
  type SorterSettings,
} from "./sorter-settings";
import type { ScriptFormProps } from "./definitions";

export function ProjectSorterForm({ onMessage, subscribed }: ScriptFormProps) {
  const [settings, setSettings] = useState<SorterSettings>(() => loadSorterSettings());
  const [removeUsersFolders, setRemoveUsersFolders] = useState(false);
  const [sortUsersFolders, setSortUsersFolders] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    saveSorterSettings(settings);
  }, [settings]);

  async function run() {
    if (!subscribed) {
      onMessage({ tone: "warning", text: "Subscription required" });
      return;
    }
    setBusy(true);
    const host = MotionFlow.host;
    const api = host === "PPRO" ? MotionFlow.PPRO : MotionFlow.AE;
    const res = await api.project.sort(settings, removeUsersFolders, sortUsersFolders);
    setBusy(false);
    if (!res.ok) {
      onMessage({ tone: "error", text: res.error });
      return;
    }
    const data = res.data;
    onMessage({
      tone: data?.type === "success" ? "success" : data?.type === "warning" ? "warning" : "error",
      text: String(data?.message ?? data?.type ?? "Done"),
    });
  }

  return (
    <div className="gal-script-form">
      <label className="gal-script-form__row">
        <span>Sequences folder</span>
        <input
          value={settings.sequences}
          onChange={(e) => setSettings((s) => ({ ...s, sequences: e.target.value }))}
        />
      </label>
      {(["video", "audio", "images", "graphics"] as const).map((key) => (
        <label key={key} className="gal-script-form__row">
          <span>{key} folder</span>
          <input
            value={settings[key].folder}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                [key]: { ...s[key], folder: e.target.value },
              }))
            }
          />
        </label>
      ))}
      <label className="gal-script-form__check">
        <input
          type="checkbox"
          checked={sortUsersFolders}
          onChange={(e) => setSortUsersFolders(e.target.checked)}
        />
        Sort user folders
      </label>
      <label className="gal-script-form__check">
        <input
          type="checkbox"
          checked={removeUsersFolders}
          onChange={(e) => setRemoveUsersFolders(e.target.checked)}
        />
        Remove empty user folders
      </label>
      <button type="button" className="gal-script-form__run" disabled={busy} onClick={() => void run()}>
        {busy ? "Sorting…" : "Sort Project"}
      </button>
    </div>
  );
}
