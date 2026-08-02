import { Image } from "lucide-react";
import { useFiltersContext } from "../context/FiltersContext";
import { FilterOption, MediaType } from "../types";
import DropdownFilter from "./DropdownFilter";

const types: FilterOption[] = [
  { label: "Image", value: "image" },
  { label: "Video", value: "video" },
];

export default function TypeFilter() {
  const { setType } = useFiltersContext();

  return (
    <DropdownFilter
      icon={<Image className="size-3.5" strokeWidth={2} />}
      title="Type"
      options={types}
      onChange={(item) => setType(item.value as MediaType)}
    />
  );
}
