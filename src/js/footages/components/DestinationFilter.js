import { jsx as _jsx } from "react/jsx-runtime";
import { Folder } from "lucide-react";
import { useFiltersContext } from "../context/FiltersContext";
import DropdownFilter from "./DropdownFilter";
const destinations = [
    { label: "Timeline", value: "timeline" },
    { label: "Project", value: "project" },
];
export default function DestinationFilter() {
    const { setDestination } = useFiltersContext();
    return (_jsx(DropdownFilter, { icon: _jsx(Folder, { className: "size-3.5", strokeWidth: 2 }), title: "Import to", options: destinations, onChange: (item) => setDestination(item.value) }));
}
