import { Search } from "lucide-react";

export default function SearchInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <div className="relative w-44">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder="Find assets"
        {...props}
        className="w-full rounded-full border border-white/10 bg-card/70 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
      />
    </div>
  );
}
