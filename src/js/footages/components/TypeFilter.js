import { jsx as _jsx } from "react/jsx-runtime";
import { Image } from "lucide-react";
import { useFiltersContext } from "../context/FiltersContext";
import DropdownFilter from "./DropdownFilter";
const types = [
    { label: "Image", value: "image" },
    { label: "Video", value: "video" },
];
export default function TypeFilter() {
    const { setType } = useFiltersContext();
    return (_jsx(DropdownFilter, { icon: _jsx(Image, { className: "size-3.5", strokeWidth: 2 }), title: "Type", options: types, onChange: (item) => setType(item.value) }));
}
