import { cn } from "@/lib/utils";

export default function CardChip({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={cn(
        "absolute rounded-lg border border-white/10 bg-card/90 text-card-foreground",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
