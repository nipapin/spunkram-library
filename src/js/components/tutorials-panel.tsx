import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Play } from "lucide-react";
import {
  fetchVideoTutorials,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  type VideoTutorialGroup,
} from "@/lib/api/tutorials-api";
import { authErrorMessage, openYoutube, type ApiErrorCode } from "@/lib/api/market-api";
import { cn } from "@/lib/utils";

type TutorialTile = {
  videoId: string;
  groupName: string;
  bound: boolean;
  mark?: [string, string];
};

function markBadgeClasses(color: string): string {
  switch (color) {
    case "yellow":
      return "bg-amber-400 text-black";
    case "red":
      return "bg-red-500 text-white";
    case "green":
      return "bg-emerald-500 text-white";
    default:
      return "bg-primary text-primary-foreground";
  }
}

function VideoCard({
  videoId,
  title,
  mark,
}: {
  videoId: string;
  title: string;
  mark?: [string, string];
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="group overflow-hidden rounded-xl border border-white/10 bg-card/60 transition-colors hover:border-primary/40">
      <div className="relative aspect-video overflow-hidden bg-secondary/40">
        {playing ? (
          <iframe
            src={youtubeEmbedUrl(videoId)}
            title={title}
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
            {mark && (
              <div
                className={cn(
                  "absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                  markBadgeClasses(mark[1]),
                )}
              >
                {mark[0]}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:bg-black/35 group-hover:opacity-100">
              <button
                type="button"
                aria-label="Play video"
                onClick={() => setPlaying(true)}
                className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 transition-transform hover:scale-105"
              >
                <Play className="size-4 fill-current" />
              </button>
              <button
                type="button"
                onClick={() => openYoutube(videoId)}
                className="flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-black/80"
              >
                <ExternalLink className="size-3" />
                Browser
              </button>
            </div>
          </>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 p-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-medium text-foreground" title={title}>
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => openYoutube(videoId)}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Open on YouTube"
          title="Open on YouTube"
        >
          <ExternalLink className="size-3" />
        </button>
      </div>
    </div>
  );
}

function flattenGroups(
  groups: VideoTutorialGroup[],
  activePackName: string,
): TutorialTile[] {
  const isBound = (g: VideoTutorialGroup) =>
    !!g.bind && !!activePackName && g.bind === activePackName;

  const bound = groups.filter(isBound);
  const rest = groups.filter((g) => !isBound(g));
  const ordered = [...bound, ...rest];

  const tiles: TutorialTile[] = [];
  for (const group of ordered) {
    const mark =
      group.mark && group.mark.length >= 2
        ? ([group.mark[0], group.mark[1]] as [string, string])
        : undefined;
    const total = group.videos.length;
    group.videos.forEach((videoId, i) => {
      tiles.push({
        videoId,
        groupName: total > 1 ? `${group.name} · ${i + 1}` : group.name,
        bound: isBound(group),
        mark: i === 0 ? mark : undefined,
      });
    });
  }
  return tiles;
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

  const tiles = useMemo(
    () => flattenGroups(groups ?? [], activePackName),
    [groups, activePackName],
  );

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

  if (tiles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No tutorials available yet.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-2.5">
      <div className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
        {tiles.map((tile, idx) => (
          <VideoCard
            key={`${tile.groupName}-${tile.videoId}-${idx}`}
            videoId={tile.videoId}
            title={tile.groupName}
            mark={tile.mark}
          />
        ))}
      </div>
    </div>
  );
}
