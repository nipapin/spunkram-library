import { jsx as _jsx } from "react/jsx-runtime";
import { Ratio } from "lucide-react";
import { useFiltersContext } from "../context/FiltersContext";
import { useMediaContext } from "../context/MediaContext";
import DropdownFilter from "./DropdownFilter";
const orientations = {
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
    return (_jsx(DropdownFilter, { icon: _jsx(Ratio, { className: "size-3.5", strokeWidth: 2 }), title: "Orientation", options: options, onChange: (item) => {
            setOrientation(item.value);
            setLoading(true);
        } }));
}
