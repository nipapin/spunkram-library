import { BRAND } from "@brands";
import { apiUrl, GENERATIONS_ENDPOINTS } from "./config";
import { getUserIdentity } from "./user";
/**
 * Fetch generation credits for the current CEP user.
 * Uses Bearer token when available; otherwise posts CEP identity fields.
 * Always sends `client` so Gal / Spunkram balances stay separate on the server.
 */
export async function fetchGenerationsStatus(signal) {
    const user = getUserIdentity();
    try {
        const headers = { "Content-Type": "application/json" };
        if (user.token)
            headers.Authorization = `Bearer ${user.token}`;
        const response = await fetch(apiUrl(GENERATIONS_ENDPOINTS.credits), {
            method: "POST",
            headers,
            credentials: "include",
            signal,
            body: JSON.stringify({
                client: BRAND.apiClient,
                email: user.email || undefined,
                userId: user.id || undefined,
            }),
        });
        if (!response.ok) {
            if (response.status === 401) {
                return { authenticated: false };
            }
            if (response.status === 402 || response.status === 403) {
                return {
                    authenticated: true,
                    subscription_generations_left: 0,
                    extra_generations_left: 0,
                    total_generations_left: 0,
                    remaining: 0,
                };
            }
            return null;
        }
        return (await response.json());
    }
    catch {
        return null;
    }
}
