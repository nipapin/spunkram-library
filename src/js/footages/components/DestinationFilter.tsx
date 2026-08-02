import { Folder } from "lucide-react";
import { useFiltersContext } from "../context/FiltersContext";
import { FilterOption } from "../types";
import DropdownFilter from "./DropdownFilter";

const destinations: FilterOption[] = [
  { label: "Timeline", value: "timeline" },
  { label: "Project", value: "project" },
];

export default function DestinationFilter() {
  const { setDestination } = useFiltersContext();

  return (
    <DropdownFilter
      icon={<Folder className="size-3.5" strokeWidth={2} />}
      title="Import to"
      options={destinations}
      onChange={(item) => setDestination(item.value)}
    />
  );
}
