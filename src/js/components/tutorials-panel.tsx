import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, Package, Play, Video } from "lucide-react";
import {
  fetchVideoTutorials,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  type VideoTutorialGroup,
} from "@/lib/api/tutorials-api";
import { authErrorMessage, openYoutube, type ApiErrorCode } from "@/lib/api/market-api";
import { cn } from "@/lib/utils";

function markBadgeClasses(color: string): string {
  switch (color) {
    case "yellow":
      return "bg-amber-400/15 text-amber-300";
    case "red":
      return "bg-red-400/15 text-red-300";
    case "green":
      return "bg-emerald-400/15 text-emerald-300";
    default:
      return "bg-primary/15 text-primary";
  }
}

function VideoCard({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="w-full max-w-80">
      <div className="group relative aspect-video w-full overflow-hidden rounded-lg border border-white/5 bg-secondary/40">
        {playing ? (
          <iframe
            src={youtubeEmbedUrl(videoId)}
            title="Video tutorial"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <>
            <img
              src={youtubeThumbnailUrl(videoId)}
              alt=""
              draggable={false}
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                aria-label="Play video"
                onClick={() => setPlaying(true)}
                className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
              >
                <Play className="size-4" fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={() => openYoutube(videoId)}
                className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-black/80"
              >
                <ExternalLink className="size-3" />
                in browser
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TutorialGroupBlock({
  group,
  bound,
  defaultOpen,
}: {
  group: VideoTutorialGroup;
  bound: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const mark = group.mark && group.mark.length ? group.mark : null;

  return (
    <div className="overflow-hidden rounded-lg border border-white/5 bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-secondary/40"
      >
        {bound ? (
          <Package className="size-4 shrink-0 text-primary" />
        ) : (
          <Video className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {group.name}
        </span>
        {mark && (
          <span
            className={cn(
              "shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              markBadgeClasses(mark[1]),
            )}
          >
            {mark[0]}
          </span>
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {group.videos.length}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="flex flex-col items-start gap-2 border-t border-white/5 p-2.5">
          {group.videos.map((videoId, idx) => (
            <VideoCard key={`${videoId}-${idx}`} videoId={videoId} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TutorialsPanel({ activePackName = "" }: { activePackName?: string }) {
  const [groups, setGroups] = useState<VideoTutorialGroup[] | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    void fetchVideoTutorials().then((result) => {
      setLoading(false);
      if (result.groups) {
        setGroups(result.groups);
      } else {
        setError(result.error ?? "NO_SUCCESS_LOAD");
      }
    });
  };

  useEffect(load, []);

  const { bound, rest } = useMemo(() => {
    const all = groups ?? [];
    const isBound = (g: VideoTutorialGroup) =>
      !!g.bind && !!activePackName && g.bind === activePackName;
    return {
      bound: all.filter(isBound),
      rest: all.filter((g) => !isBound(g)),
    };
  }, [groups, activePackName]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading tutorials…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-xs text-muted-foreground">{authErrorMessage(error)}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No tutorials available yet.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2.5">
      <div className="flex flex-col gap-2">
        {bound.length > 0 && (
          <>
            <h2 className="px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
              Related to the active package
            </h2>
            {bound.map((group) => (
              <TutorialGroupBlock key={group.name} group={group} bound defaultOpen />
            ))}
            {rest.length > 0 && (
              <h2 className="mt-1.5 px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
                All tutorials
              </h2>
            )}
          </>
        )}
        {rest.map((group, idx) => (
          <TutorialGroupBlock
            key={group.name}
            group={group}
            bound={false}
            defaultOpen={bound.length === 0 && idx === 0 && rest.length === 1}
          />
        ))}
      </div>
    </div>
  );
}
