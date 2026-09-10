import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  AudioLines,
  BookOpen,
  Download,
  Folder,
  Info,
  Infinity as InfinityIcon,
  Play,
  Plus,
  Sparkles,
  Spline,
  SquareArrowOutUpRight,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { openMotionflowSubscribe } from "@/api/motionflow-auth";
import { useGenerationsBalance } from "@/hooks/use-generations-balance";
import { MotionFlow } from "@/sdk";
import { getResolvedHostSync } from "@/lib/utils/host-identity";
import { ensureFfmpeg } from "@/utils/ffmpeg";
import { preloadVoiceoverPreviews } from "@/api/voiceover";
import { CaptionsApp } from "@/ui/spunkram/apps/CaptionsApp";
import { ChaptersApp } from "@/ui/spunkram/apps/ChaptersApp";
import { VoiceoverApp } from "@/ui/spunkram/apps/VoiceoverApp";
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
import "@/ai-tools.scss";
import "./gal-scripts.scss";

type AiToolId = "captions" | "chapters" | "voiceover";

type AiToolDef = {
  id: AiToolId;
  name: string;
  description: string;
  color: string;
  info: string;
  icon: ReactNode;
};

const AI_TOOLS: AiToolDef[] = [
  {
    id: "captions",
    name: "Captions",
    description: "Auto-generate subtitles",
    color: "#7c4dff",
    info: "Transcribe timeline audio and apply Gal caption styles. Uses AI generation credits from your Gal account.",
    icon: <Type strokeWidth={1.25} />,
  },
  {
    id: "chapters",
    name: "Chapters",
    description: "Split into chapters",
    color: "#2bb0ed",
    info: "Generate YouTube-style chapters from transcript timings. Uses AI generation credits from your Gal account.",
    icon: <BookOpen strokeWidth={1.25} />,
  },
  {
    id: "voiceover",
    name: "Voiceover",
    description: "AI narration with Minimax",
    color: "#e85d9a",
    info: "Generate AI narration audio and import it into the project. Uses AI generation credits from your Gal account.",
    icon: <AudioLines strokeWidth={1.25} />,
  },
];

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

function GenerationsStrip({
  monthly,
  extra,
  monthlyLimit,
  isFreeUser,
}: {
  monthly: number;
  extra: number;
  monthlyLimit: number | null;
  isFreeUser: boolean;
}) {
  const total = monthly + extra;
  const limitLabel = monthlyLimit != null ? String(monthlyLimit) : "—";
  return (
    <div className="gal-scripts__gens">
      <div className="gal-scripts__gens-main">
        <span className="gal-scripts__gens-kicker">
          <Sparkles className="size-3.5" strokeWidth={2.25} />
          Generations left
        </span>
        <span className="gal-scripts__gens-count">{total}</span>
      </div>
      <div className="gal-scripts__gens-meta">
        <span>
          {monthly}/{limitLabel} {isFreeUser ? "free plan" : "monthly"}
        </span>
        {!isFreeUser ? (
          <span className="gal-scripts__gens-extra">
            <InfinityIcon className="size-3" />
            {extra} extra
          </span>
        ) : null}
        <button
          type="button"
          className="gal-scripts__gens-btn"
          onClick={() => openMotionflowSubscribe()}
        >
          <Plus className="size-3" strokeWidth={2.5} />
          Get more
        </button>
      </div>
    </div>
  );
}

export function GalScriptsPanel() {
  const { subscription, signedIn } = useAuth();
  const gens = useGenerationsBalance();
  const subscribed = !!subscription.subscribed;
  const host = useMemo(() => resolveHost(), []);
  const scripts = useMemo(() => scriptsForHost(host), [host]);
  const [active, setActive] = useState<GalScriptDef | null>(null);
  const [activeAi, setActiveAi] = useState<AiToolDef | null>(null);
  const [infoScript, setInfoScript] = useState<GalScriptDef | null>(null);
  const [infoAi, setInfoAi] = useState<AiToolDef | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ScriptMessage | null>(null);
  const aiWarmupStarted = useRef(false);

  const aiEnabled = signedIn && gens.totalLeft > 0;

  useEffect(() => {
    if (!activeAi || aiWarmupStarted.current) return;
    aiWarmupStarted.current = true;
    void ensureFfmpeg().catch((err) => {
      console.warn(
        "[gal] ffmpeg download failed:",
        err instanceof Error ? err.message : err,
      );
    });
    void preloadVoiceoverPreviews();
  }, [activeAi]);

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

  function openAiTool(tool: AiToolDef) {
    if (!aiEnabled) {
      onMessage({
        tone: "warning",
        text: signedIn
          ? "No AI generations left. Get more to continue."
          : "Sign in to use AI Tools.",
      });
      return;
    }
    setMessage(null);
    setActiveAi(tool);
  }

  if (activeAi) {
    return (
      <div className="gal-scripts gal-scripts--ai-tool">
        <div className="gal-scripts__detail-top">
          <button
            type="button"
            className="gal-scripts__back"
            onClick={() => setActiveAi(null)}
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="gal-scripts__detail-copy">
            <h2>{activeAi.name}</h2>
            <p>{activeAi.description}</p>
          </div>
          <span className="gal-scripts__tool-gens" title="Generations left">
            <Sparkles className="size-3" />
            {gens.totalLeft}
          </span>
        </div>
        <div className="gal-scripts__ai-body ai-tools-scope">
          {activeAi.id === "captions" ? (
            <CaptionsApp generationsLeft={gens.totalLeft} />
          ) : null}
          {activeAi.id === "chapters" ? (
            <ChaptersApp generationsLeft={gens.totalLeft} />
          ) : null}
          {activeAi.id === "voiceover" ? (
            <VoiceoverApp generationsLeft={gens.totalLeft} />
          ) : null}
        </div>
      </div>
    );
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
      <GenerationsStrip
        monthly={gens.monthly}
        extra={gens.extra}
        monthlyLimit={gens.monthlyLimit}
        isFreeUser={gens.isFreeUser}
      />
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

        {AI_TOOLS.map((tool) => (
          <article
            key={tool.id}
            className={
              aiEnabled
                ? "gal-scripts__card gal-scripts__card--ai"
                : "gal-scripts__card gal-scripts__card--ai is-disabled"
            }
            style={
              {
                "--script-color": tool.color,
              } as CSSProperties
            }
          >
            <span className="gal-scripts__circle" aria-hidden />
            <span className="gal-scripts__watermark" aria-hidden>
              {tool.icon}
            </span>
            <div className="gal-scripts__card-top">
              <h3>
                <Sparkles
                  className="gal-scripts__ai-icon"
                  strokeWidth={2.25}
                  aria-hidden
                />
                {tool.name}
              </h3>
              <button
                type="button"
                className="gal-scripts__info-btn"
                aria-label={`About ${tool.name}`}
                title="About"
                onClick={() => setInfoAi(tool)}
              >
                <Info className="size-3.5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="gal-scripts__card-actions">
              <button
                type="button"
                className="gal-scripts__action-btn"
                disabled={!aiEnabled}
                aria-label={`Open ${tool.name}`}
                title={
                  aiEnabled
                    ? "Open"
                    : signedIn
                      ? "No generations left"
                      : "Sign in required"
                }
                onClick={() => openAiTool(tool)}
              >
                <SquareArrowOutUpRight className="size-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>

      {infoScript || infoAi ? (
        <div
          className="gal-scripts__about"
          role="dialog"
          aria-modal="true"
          aria-label={`About ${(infoScript || infoAi)!.name}`}
        >
          <button
            type="button"
            className="gal-scripts__about-backdrop"
            aria-label="Close"
            onClick={() => {
              setInfoScript(null);
              setInfoAi(null);
            }}
          />
          <aside className="gal-scripts__about-panel">
            <div className="gal-scripts__about-head">
              <span
                className="gal-scripts__about-icon"
                style={{ color: (infoScript || infoAi)!.color }}
              >
                {infoScript ? (
                  <ScriptIcon icon={infoScript.icon} />
                ) : (
                  infoAi!.icon
                )}
              </span>
              <h3>
                {infoAi ? (
                  <Sparkles
                    className="gal-scripts__ai-icon"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                ) : null}
                {(infoScript || infoAi)!.name}
              </h3>
              <button
                type="button"
                className="gal-scripts__info-btn"
                aria-label="Close"
                onClick={() => {
                  setInfoScript(null);
                  setInfoAi(null);
                }}
              >
                <X className="size-3.5" />
              </button>
            </div>
            <p className="gal-scripts__about-body">
              {infoScript ? infoScript.info : infoAi!.info}
            </p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
