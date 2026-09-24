import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import * as THREE from "three";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — vanta has no types for the fog build
import FOG from "vanta/dist/vanta.fog.min";
/**
 * Vanta Fog background tuned to Spunkram brand:
 * dark navy base (#070a17) + primary violet (#6a53f8).
 * @see https://www.vantajs.com/?effect=fog
 */
export function FogBackground({ className }) {
    const elRef = useRef(null);
    const effectRef = useRef(null);
    useEffect(() => {
        if (!elRef.current || effectRef.current)
            return;
        try {
            effectRef.current = FOG({
                el: elRef.current,
                THREE,
                mouseControls: true,
                touchControls: true,
                gyroControls: false,
                minHeight: 200,
                minWidth: 200,
                highlightColor: 0x3a2e8a,
                midtoneColor: 0x1a1540,
                lowlightColor: 0x0a0818,
                baseColor: 0x02030a,
                blurFactor: 0.7,
                speed: 0.7,
                zoom: 0.85,
            });
        }
        catch {
            // WebGL unavailable in some CEP hosts — solid fallback stays via CSS.
        }
        return () => {
            try {
                effectRef.current?.destroy();
            }
            catch {
                // ignore
            }
            effectRef.current = null;
        };
    }, []);
    return (_jsx("div", { ref: elRef, "aria-hidden": true, className: className, style: { backgroundColor: "rgb(2, 3, 10)" } }));
}
