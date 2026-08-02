import { apiUrl, GENERATIONS_ENDPOINTS } from "./config";
import { getUserIdentity } from "./user";

export type GenerationsStatus = {
  authenticated: boolean;
  used?: number;
  limit?: number;
  effective_limit?: number;
  remaining?: number;
  hasSubscription?: boolean;
  plan?: string;
  subscription_generations_left?: number;
  extra_generations_left?: number;
  total_generations_left?: number;
  source?: string;
};

/**
 * Fetch generation credits for the current CEP user.
 * Uses session cookie when available; otherwise posts CEP identity (dev).
 */
export async function fetchGenerationsStatus(
  signal?: AbortSignal,
): Promise<GenerationsStatus | null> {
  const user = getUserIdentity();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (user.token) headers.Authorization = `Bearer ${user.token}`;
    const response = await fetch(apiUrl(GENERATIONS_ENDPOINTS.credits), {
      method: "POST",
      headers,
      credentials: "include",
      signal,
      body: JSON.stringify({
        email: user.email || undefined,
        userId: user.id || undefined,
        devToken: user.devToken || undefined,
      }),
    });
    if (!response.ok) {
      if (response.status === 401) {
        return { authenticated: false };
      }
      return null;
    }
    return (await response.json()) as GenerationsStatus;
  } catch {
    return null;
  }
}
