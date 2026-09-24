import { jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { fetchGenerationsStatus } from "../../../api";
import "./CreditsCounter.scss";
export const CreditsCounter = ({ refreshKey = 0 }) => {
    const [status, setStatus] = useState(null);
    const load = useCallback(async (signal) => {
        const next = await fetchGenerationsStatus(signal);
        if (!signal?.aborted)
            setStatus(next);
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
    }, [load, refreshKey]);
    if (!status?.authenticated)
        return null;
    const used = status.used ?? 0;
    const limit = status.effective_limit ?? status.limit ?? 0;
    const left = status.total_generations_left;
    const label = typeof left === "number"
        ? `${left} left`
        : limit > 0
            ? `${used}/${limit}`
            : null;
    if (!label)
        return null;
    return (_jsxs("span", { className: "credits-counter", title: limit > 0
            ? `Generations used: ${used} / ${limit}` +
                (typeof status.extra_generations_left === "number" &&
                    status.extra_generations_left > 0
                    ? ` (+${status.extra_generations_left} extra)`
                    : "")
            : "Generations remaining", "data-tooltip": label, children: [used, "/", limit || "∞"] }));
};
