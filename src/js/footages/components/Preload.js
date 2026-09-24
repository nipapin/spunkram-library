import { jsx as _jsx } from "react/jsx-runtime";
import { useFiltersContext } from "../context/FiltersContext";
import { getAspectFromOrientation, getColumnsFromOrientation } from "../utils/math";
import SkeletonGrid from "./SkeletonGrid";
export default function Preload() {
    const { orientation } = useFiltersContext();
    const masonry = orientation === "";
    return (_jsx(SkeletonGrid, { columns: masonry ? 3 : getColumnsFromOrientation(orientation), aspect: getAspectFromOrientation(orientation), masonry: masonry, staggerDelay: true }));
}
