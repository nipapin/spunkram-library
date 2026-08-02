import { PER_PAGE } from "../types";
import { cn } from "@/lib/utils";

interface SkeletonGridProps {
  columns: number;
  aspect: string;
  count?: number;
  staggerDelay?: boolean;
  masonry?: boolean;
}

const MASONRY_ASPECTS = ["1/1", "3/4", "4/3", "9/16", "16/9", "2/3", "3/2"];

function SkeletonCell({
  aspect,
  className,
  delayMs,
}: {
  aspect: string;
  className?: string;
  delayMs?: number;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-secondary",
        className,
      )}
      style={{
        aspectRatio: aspect,
        animationDelay: delayMs != null ? `${delayMs}ms` : undefined,
      }}
    />
  );
}

export default function SkeletonGrid({
  columns,
  aspect,
  count = PER_PAGE,
  staggerDelay = false,
  masonry = false,
}: SkeletonGridProps) {
  if (masonry) {
    return (
      <div
        className="p-2"
        style={{ columnCount: columns, columnGap: "8px" }}
      >
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCell
            key={i}
            aspect={MASONRY_ASPECTS[i % MASONRY_ASPECTS.length]}
            className="mb-2 inline-block w-full break-inside-avoid"
            delayMs={staggerDelay ? i * 100 : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid gap-2 p-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCell
          key={i}
          aspect={aspect}
          className="w-full"
          delayMs={staggerDelay ? i * 100 : undefined}
        />
      ))}
    </div>
  );
}
