/**
 * User identity for AI generations API.
 * Prefer Motionflow CEP session (preferences), then userdata panel store.
 */
import { readMotionflowAuth } from "@/lib/api/preferences";
import * as panelStore from "@/lib/userdata-store";

export interface UserIdentity {
  id: string;
  name?: string;
  email?: string;
  /** Bearer / session token from Motionflow login */
  token?: string;
}

const STORAGE_KEY = "spunkram-library-ai-user";

const emptyUser = (): UserIdentity => ({ id: "" });

const readStoredUser = (): UserIdentity | null => {
  try {
    const raw = panelStore.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserIdentity>;
    return {
      id: typeof parsed.id === "string" ? parsed.id : "",
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      token: typeof parsed.token === "string" ? parsed.token : undefined,
    };
  } catch {
    return null;
  }
};

export const getUserIdentity = (): UserIdentity => {
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
  } catch {
    // preferences may be unavailable outside CEP
  }

  return readStoredUser() ?? emptyUser();
};

export const setUserIdentity = (user: UserIdentity): void => {
  panelStore.setItem(STORAGE_KEY, JSON.stringify(user));
};

export const clearUserIdentity = (): void => {
  panelStore.removeItem(STORAGE_KEY);
};
