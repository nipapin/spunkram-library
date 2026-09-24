/**
 * User identity for AI generations API.
 * Prefer Motionflow CEP session (preferences), then userdata panel store.
 */
import { storageKey } from "@brands";
import { readMotionflowAuth } from "@/lib/api/preferences";
import * as panelStore from "@/lib/userdata-store";
const STORAGE_KEY = storageKey("ai-user");
const LEGACY_STORAGE_KEY = "spunkram-library-ai-user";
const emptyUser = () => ({ id: "" });
const parseStoredUser = (raw) => {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        return {
            id: typeof parsed.id === "string" ? parsed.id : "",
            name: typeof parsed.name === "string" ? parsed.name : undefined,
            email: typeof parsed.email === "string" ? parsed.email : undefined,
            token: typeof parsed.token === "string" ? parsed.token : undefined,
        };
    }
    catch {
        return null;
    }
};
const readStoredUser = () => {
    try {
        const branded = parseStoredUser(panelStore.getItem(STORAGE_KEY));
        if (branded)
            return branded;
        // One-time migrate legacy Spunkram-only key into branded storage.
        const legacy = parseStoredUser(panelStore.getItem(LEGACY_STORAGE_KEY));
        if (legacy) {
            panelStore.setItem(STORAGE_KEY, JSON.stringify(legacy));
            panelStore.removeItem(LEGACY_STORAGE_KEY);
            return legacy;
        }
        return null;
    }
    catch {
        return null;
    }
};
export const getUserIdentity = () => {
    try {
        const auth = readMotionflowAuth();
        if (auth.token && (auth.id || auth.email)) {
            return {
                id: auth.id || "",
                email: auth.email,
                name: auth.name || auth.email,
                token: auth.token,
            };
        }
    }
    catch {
        // preferences may be unavailable outside CEP
    }
    return readStoredUser() ?? emptyUser();
};
export const setUserIdentity = (user) => {
    panelStore.setItem(STORAGE_KEY, JSON.stringify(user));
};
export const clearUserIdentity = () => {
    panelStore.removeItem(STORAGE_KEY);
};
