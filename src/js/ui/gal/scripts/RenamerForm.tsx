import { useState } from "react";
import { MotionFlow } from "@/sdk";
import type { ScriptFormProps } from "./definitions";

export function RenamerForm({ onMessage, subscribed }: ScriptFormProps) {
  const [scope, setScope] = useState<"project" | "clips">("project");
  const [prefix, setPrefix] = useState("");
  const [name, setName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [numerate, setNumerate] = useState(true);
  const [saveOriginal, setSaveOriginal] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<"rename" | "replace">("rename");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!subscribed) {
      onMessage({ tone: "warning", text: "Subscription required" });
      return;
    }
    setBusy(true);
    const host = MotionFlow.host;
    const api = host === "PPRO" ? MotionFlow.PPRO : MotionFlow.AE;
    const res =
      mode === "replace"
        ? await api.project.replace({ from, to, scope })
        : await api.project.rename({
            prefix,
            name,
            suffix,
            scope,
            saveOriginal,
            numerate,
          });
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
        <span>Rename in</span>
        <select value={scope} onChange={(e) => setScope(e.target.value as "project" | "clips")}>
          <option value="project">Project Panel</option>
          <option value="clips">Selected Clips</option>
        </select>
      </label>
      <div className="gal-script-form__tabs">
        <button
          type="button"
          className={mode === "rename" ? "is-active" : undefined}
          onClick={() => setMode("rename")}
        >
          Rename
        </button>
        <button
          type="button"
          className={mode === "replace" ? "is-active" : undefined}
          onClick={() => setMode("replace")}
        >
          Replace
        </button>
      </div>
      {mode === "rename" ? (
        <>
          <label className="gal-script-form__row">
            <span>Prefix</span>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </label>
          <label className="gal-script-form__row">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="gal-script-form__row">
            <span>Suffix</span>
            <input value={suffix} onChange={(e) => setSuffix(e.target.value)} />
          </label>
          <label className="gal-script-form__check">
            <input
              type="checkbox"
              checked={numerate}
              onChange={(e) => setNumerate(e.target.checked)}
            />
            Numberable
          </label>
          <label className="gal-script-form__check">
            <input
              type="checkbox"
              checked={saveOriginal}
              onChange={(e) => setSaveOriginal(e.target.checked)}
            />
            Keep original name
          </label>
        </>
      ) : (
        <>
          <label className="gal-script-form__row">
            <span>Find</span>
            <input value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="gal-script-form__row">
            <span>Replace</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </>
      )}
      <button type="button" className="gal-script-form__run" disabled={busy} onClick={() => void run()}>
        {busy ? "Working…" : mode === "replace" ? "Replace" : "Rename"}
      </button>
    </div>
  );
}
