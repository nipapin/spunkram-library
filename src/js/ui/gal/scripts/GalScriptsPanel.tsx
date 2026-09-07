import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  Download,
  Folder,
  Info,
  Play,
  Spline,
  SquareArrowOutUpRight,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MotionFlow } from "@/sdk";
import { getResolvedHostSync } from "@/lib/utils/host-identity";
import {
  scriptsForHost,
  type GalScriptDef,
  type GalScriptIcon,
  type GalScriptId,
  type ScriptMessage,
} from "./definitions";
import { ProjectSorterForm } from "./ProjectSorterForm";
import { RenamerForm } from "./RenamerForm";
import { WigglerForm } from "./WigglerForm";
import { runHandyCollect, runReduceProject } from "./pipelines";
import "./gal-scripts.scss";

function resolveHost(): "PPRO" | "AEFT" | null {
  const fromSdk = MotionFlow.host;
  if (fromSdk === "PPRO") return "PPRO";
  if (fromSdk === "AE") return "AEFT";
  const sync = getResolvedHostSync();
  if (sync === "PPRO" || sync === "AEFT") return sync;
  return null;
}

const SCRIPT_ICONS: Record<GalScriptIcon, ReactNode> = {
  folder: <Folder strokeWidth={1.25} />,
  text: <Type strokeWidth={1.25} />,
  trash: <Trash2 strokeWidth={1.25} />,
  download: <Download strokeWidth={1.25} />,
  route: <Spline strokeWidth={1.25} />,
};

function ScriptIcon({ icon }: { icon: GalScriptIcon }) {
  return <>{SCRIPT_ICONS[icon]}</>;
}

export function GalScriptsPanel() {
  const { subscription } = useAuth();
  const subscribed = !!subscription.subscribed;
  const host = useMemo(() => resolveHost(), []);
  const scripts = useMemo(() => scriptsForHost(host), [host]);
  const [active, setActive] = useState<GalScriptDef | null>(null);
  const [infoScript, setInfoScript] = useState<GalScriptDef | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ScriptMessage | null>(null);

  function onMessage(msg: ScriptMessage) {
    setMessage(msg);
  }

  async function runPipeline(id: GalScriptId) {
    if (!subscribed) {
      onMessage({ tone: "warning", text: "Subscription required" });
      return;
    }
    setBusy(true);
    setMessage({ tone: "info", text: "Running…" });
    try {
      if (id === "reduce-project") await runReduceProject(onMessage);
      else if (id === "handy-collect") await runHandyCollect(onMessage);
    } finally {
      setBusy(false);
    }
  }

  if (active) {
    return (
      <div className="gal-scripts">
        <div className="gal-scripts__detail-top">
          <button
            type="button"
            className="gal-scripts__back"
            onClick={() => setActive(null)}
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h2>{active.name}</h2>
            <p>{active.description}</p>
          </div>
        </div>
        {message ? (
          <p className={`gal-scripts__msg gal-scripts__msg--${message.tone}`}>
            {message.text}
          </p>
        ) : null}
        <div className="gal-scripts__detail-body">
          {active.id === "project-sorter" ? (
            <ProjectSorterForm onMessage={onMessage} subscribed={subscribed} />
          ) : null}
          {active.id === "renamer" ? (
            <RenamerForm onMessage={onMessage} subscribed={subscribed} />
          ) : null}
          {active.id === "wiggler" ? (
            <WigglerForm onMessage={onMessage} subscribed={subscribed} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="gal-scripts">
      {!subscribed ? (
        <p className="gal-scripts__banner">
          Scripts require an active Gal Toolkit subscription.
        </p>
      ) : null}
      {message ? (
        <p className={`gal-scripts__msg gal-scripts__msg--${message.tone}`}>
          {message.text}
        </p>
      ) : null}
      <div className="gal-scripts__grid">
        {scripts.map((script) => (
          <article
            key={script.id}
            className="gal-scripts__card"
            style={
              {
                "--script-color": script.color,
              } as CSSProperties
            }
          >
            <span className="gal-scripts__circle" aria-hidden />
            <span className="gal-scripts__watermark" aria-hidden>
              <ScriptIcon icon={script.icon} />
            </span>
            <div className="gal-scripts__card-top">
              <h3>{script.name}</h3>
              <button
                type="button"
                className="gal-scripts__info-btn"
                aria-label={`About ${script.name}`}
                title="About"
                onClick={() => setInfoScript(script)}
              >
                <Info className="size-3.5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="gal-scripts__card-actions">
              {script.pipeline ? (
                <button
                  type="button"
                  className="gal-scripts__action-btn"
                  disabled={busy || !subscribed}
                  aria-label={`Run ${script.name}`}
                  title="Run"
                  onClick={() => void runPipeline(script.id)}
                >
                  <Play className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  className="gal-scripts__action-btn"
                  aria-label={`Open ${script.name}`}
                  title="Open"
                  onClick={() => setActive(script)}
                >
                  <SquareArrowOutUpRight className="size-3.5" />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {infoScript ? (
        <div
          className="gal-scripts__about"
          role="dialog"
          aria-modal="true"
          aria-label={`About ${infoScript.name}`}
        >
          <button
            type="button"
            className="gal-scripts__about-backdrop"
            aria-label="Close"
            onClick={() => setInfoScript(null)}
          />
          <aside className="gal-scripts__about-panel">
            <div className="gal-scripts__about-head">
              <span
                className="gal-scripts__about-icon"
                style={{ color: infoScript.color }}
              >
                <ScriptIcon icon={infoScript.icon} />
              </span>
              <h3>{infoScript.name}</h3>
              <button
                type="button"
                className="gal-scripts__info-btn"
                aria-label="Close"
                onClick={() => setInfoScript(null)}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <p className="gal-scripts__about-body">{infoScript.info}</p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
