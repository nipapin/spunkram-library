import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { FilterOption } from "../types";
import GlassMenu, { GlassMenuItem } from "./GlassMenu";

interface DropdownFilterProps {
  icon: ReactNode;
  title?: string;
  options: FilterOption[];
  onChange: (item: FilterOption) => void;
}

export default function DropdownFilter({
  icon,
  title,
  options,
  onChange,
}: DropdownFilterProps) {
  const [selected, setSelected] = useState<FilterOption>(options[0]);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setAnchorEl(e.currentTarget);
  };

  const handleSelect = (item: FilterOption) => () => {
    setSelected(item);
    onChange(item);
    setAnchorEl(null);
  };

  return (
    <div className="flex items-center gap-1">
      <span title={title} className="inline-flex items-center text-muted-foreground">
        {icon}
      </span>
      <button
        type="button"
        key={selected.value}
        onClick={handleOpen}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-white/10 bg-secondary/60 px-2 py-1",
          "text-[11px] capitalize text-foreground hover:bg-secondary",
        )}
      >
        {selected.label}
        <ChevronDown className="size-3.5 text-muted-foreground" strokeWidth={2} />
      </button>
      <GlassMenu open={open} anchorEl={anchorEl} onClose={() => setAnchorEl(null)}>
        {options.map((item) => (
          <GlassMenuItem key={item.label} onClick={handleSelect(item)}>
            {item.label}
          </GlassMenuItem>
        ))}
      </GlassMenu>
    </div>
  );
}
