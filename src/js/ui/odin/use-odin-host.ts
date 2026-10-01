import { useEffect, useState } from "react";
import {
  getResolvedHostSync,
  getResolvedHostAppId,
} from "@/lib/utils/host-identity";
import { MotionFlow } from "@/sdk";
import { BRAND } from "@brands";

export type OdinHost = "AEFT" | "PPRO";
export function resolveOdinHost(): OdinHost {
  if (import.meta.env.DEV && !window.cep && BRAND.devPack) {
    return BRAND.devPack.host === "PR" ? "PPRO" : "AEFT";
  }
  const resolved = getResolvedHostSync();
  if (resolved) return resolved;
  return MotionFlow.host === "PPRO" ? "PPRO" : "AEFT";
}
export function useOdinHost(): OdinHost {
  const [host, setHost] = useState(resolveOdinHost);
  useEffect(() => {
    if (!window.cep) return;
    let active = true;
    void getResolvedHostAppId().then((resolved) => {
      if (active) setHost(resolved);
    });
    return () => {
      active = false;
    };
  }, []);
  return host;
}
