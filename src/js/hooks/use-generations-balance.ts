/**
 * Generation credits balance — server (`/api/cep/generations`) is source of truth;
 * branded panel-store cache only.
 */
import { useCallback, useEffect, useState } from "react";
import { storageKey } from "@brands";
import { fetchGenerationsStatus } from "@/api/credits";
import { useAuth } from "@/lib/auth-context";
import * as panelStore from "@/lib/userdata-store";

export const AITOOLS_CREDITS_CHANGED = "aitools-credits-changed";

type GenerationsState = {
  monthly: number;
  extra: number;
  monthKey: string;
  /** Allotment the stored monthly counter was capped against. */
  limit: number;
};

const GENERATIONS_STORAGE_KEY = storageKey("generations");

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

function loadGenerationsState(limit: number | null): GenerationsState {
  const monthKey = currentMonthKey();
  if (limit == null || limit <= 0) {
    return { monthly: 0, extra: 0, monthKey, limit: 0 };
  }
  const fallback: GenerationsState = {
    monthly: limit,
    extra: 0,
    monthKey,
    limit,
  };
  try {
    const raw = panelStore.getItem(GENERATIONS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GenerationsState>;
    if (parsed.monthKey !== fallback.monthKey) return fallback;
    const storedLimit = typeof parsed.limit === "number" ? parsed.limit : limit;
    let monthly = typeof parsed.monthly === "number" ? parsed.monthly : limit;
    // Tier changed (e.g. free → subscribed): top up to the new allotment.
    if (storedLimit !== limit) {
      monthly = Math.min(limit, Math.max(0, monthly + (limit - storedLimit)));
    }
    monthly = Math.max(0, Math.min(limit, monthly));
    return {
      monthly,
      extra: typeof parsed.extra === "number" ? parsed.extra : 0,
      monthKey: fallback.monthKey,
      limit,
    };
  } catch {
    return fallback;
  }
}

function saveGenerationsState(state: GenerationsState): void {
  try {
    panelStore.setItem(GENERATIONS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export type GenerationsBalance = {
  monthly: number;
  extra: number;
  totalLeft: number;
  monthlyLimit: number | null;
  isFreeUser: boolean;
  refresh: () => Promise<void>;
};

export function useGenerationsBalance(): GenerationsBalance {
  const { signedIn, authReady, generationLimit, isFreeUser } = useAuth();
  const [monthly, setMonthly] = useState(0);
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    if (generationLimit == null) {
      setMonthly(0);
      setExtra(0);
      return;
    }
    const next = loadGenerationsState(generationLimit);
    setMonthly(next.monthly);
    setExtra(next.extra);
  }, [generationLimit]);

  useEffect(() => {
    if (generationLimit == null) return;
    saveGenerationsState({
      monthly,
      extra,
      monthKey: currentMonthKey(),
      limit: generationLimit,
    });
  }, [monthly, extra, generationLimit]);

  const refresh = useCallback(async () => {
    const status = await fetchGenerationsStatus();
    if (!status?.authenticated) return;
    const nextMonthly =
      typeof status.subscription_generations_left === "number"
        ? status.subscription_generations_left
        : typeof status.remaining === "number"
          ? status.remaining
          : null;
    const nextExtra =
      typeof status.extra_generations_left === "number"
        ? status.extra_generations_left
        : null;
    if (nextMonthly !== null) setMonthly(Math.max(0, nextMonthly));
    if (nextExtra !== null) setExtra(Math.max(0, nextExtra));
  }, []);

  useEffect(() => {
    if (!authReady || !signedIn) return;
    void refresh();
  }, [authReady, signedIn, generationLimit, refresh]);

  useEffect(() => {
    const onCreditsChanged = () => {
      void refresh();
    };
    window.addEventListener(AITOOLS_CREDITS_CHANGED, onCreditsChanged);
    return () => window.removeEventListener(AITOOLS_CREDITS_CHANGED, onCreditsChanged);
  }, [refresh]);

  return {
    monthly,
    extra,
    totalLeft: monthly + extra,
    monthlyLimit: generationLimit,
    isFreeUser,
    refresh,
  };
}
