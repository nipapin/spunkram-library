import { useState } from "react";
import { MotionFlow } from "@/sdk";
import type { ScriptFormProps } from "./definitions";

export function WigglerForm({ onMessage, subscribed }: ScriptFormProps) {
  const [tier, setTier] = useState<"basic" | "advanced">("basic");
  const [amount, setAmount] = useState(10);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);

  async function call(method: string, args?: unknown[]) {
    if (!subscribed) {
      onMessage({ tone: "warning", text: "Subscription required" });
      return;
    }
    if (MotionFlow.host !== "AE") {
      onMessage({ tone: "error", text: "Wiggler is After Effects only" });
      return;
    }
    setBusy(true);
    const params = {
      amount,
      speed,
      axis: "all",
      octaves: 1,
      octMult: 0.5,
      loopEnabled: false,
      loopDuration: 10,
      baseSeed: 0,
      synchronizedWiggle: false,
      fadeEnabled: false,
      fadeIn: 1,
      fadeOut: 1,
    };
    const res =
      method === "apply"
        ? await MotionFlow.AE.wiggler.apply(tier, params)
        : await MotionFlow.AE.wiggler.call(method, args ?? []);
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
      <div className="gal-script-form__tabs">
        <button
          type="button"
          className={tier === "basic" ? "is-active" : undefined}
          onClick={() => setTier("basic")}
        >
          Basic
        </button>
        <button
          type="button"
          className={tier === "advanced" ? "is-active" : undefined}
          onClick={() => setTier("advanced")}
        >
          Advanced
        </button>
      </div>
      <label className="gal-script-form__row">
        <span>Amount</span>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </label>
      <label className="gal-script-form__row">
        <span>Speed</span>
        <input
          type="number"
          step={0.1}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        />
      </label>
      <div className="gal-script-form__actions">
        <button type="button" disabled={busy} onClick={() => void call("apply")}>
          Apply
        </button>
        <button type="button" disabled={busy} onClick={() => void call("remove")}>
          Remove
        </button>
        <button type="button" disabled={busy} onClick={() => void call("bake")}>
          Bake
        </button>
      </div>
    </div>
  );
}
