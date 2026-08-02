import { Ratio } from "lucide-react";
import { useFiltersContext } from "../context/FiltersContext";
import { useMediaContext } from "../context/MediaContext";
import { FilterOption } from "../types";
import DropdownFilter from "./DropdownFilter";

const orientations: Record<string, FilterOption[]> = {
  image: [
    { label: "Any", value: "" },
    { label: "Horizontal", value: "landscape" },
    { label: "Vertical", value: "portrait" },
    { label: "Square", value: "squarish" },
  ],
  video: [
    { label: "Any", value: "" },
    { label: "Horizontal", value: "landscape" },
    { label: "Vertical", value: "portrait" },
    { label: "Square", value: "square" },
  ],
};

export default function OrientationFilter() {
  const { type, setOrientation } = useFiltersContext();
  const { setLoading } = useMediaContext();
  const options = orientations[type];

  return (
    <DropdownFilter
      icon={<Ratio className="size-3.5" strokeWidth={2} />}
      title="Orientation"
      options={options}
      onChange={(item) => {
        setOrientation(item.value);
        setLoading(true);
      }}
    />
  );
}
