/**
 * User identity for AI generations API.
 * Prefer Motionflow CEP session (preferences), then explicit dev-admin flyout,
 * then plain localStorage.
 */
import { readMotionflowAuth } from "@/lib/api/preferences";

// Инжектится Vite'ом (vite.config.ts define) из .env.local — пусто в zxp/zip
// сборках, поэтому в реальных пользовательских копиях панели токена нет.
declare const __CEP_DEV_ADMIN_TOKEN__: string | undefined;

export interface UserIdentity {
  id: string;
  name?: string;
  email?: string;
  /** Bearer / session token from Motionflow login */
  token?: string;
  /** Секрет для dev-admin на проде (см. next-app lib/auth/resolve-captions-user.ts) */
  devToken?: string;
}

/** Dev / flyout: имитация входа для локальной разработки с бэкендом. */
export const DEV_ADMIN_EMAIL = "admin@mail.ru";
export const DEV_ADMIN_ID = "dev-admin";

const STORAGE_KEY = "spunkram-library-ai-user";

const emptyUser = (): UserIdentity => ({ id: "" });

const readLocalStorageUser = (): UserIdentity | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserIdentity>;
    return {
      id: typeof parsed.id === "string" ? parsed.id : "",
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      token: typeof parsed.token === "string" ? parsed.token : undefined,
      devToken: typeof parsed.devToken === "string" ? parsed.devToken : undefined,
    };
  } catch {
    return null;
  }
};

export const getUserIdentity = (): UserIdentity => {
  const local = readLocalStorageUser();
  if (local && (local.id === DEV_ADMIN_ID || local.email === DEV_ADMIN_EMAIL)) {
    return local;
  }

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

  return local ?? emptyUser();
};

export const setUserIdentity = (user: UserIdentity): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
};

export const clearUserIdentity = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const isDevAdminSignedIn = (): boolean => {
  const u = getUserIdentity();
  return u.email === DEV_ADMIN_EMAIL || u.id === DEV_ADMIN_ID;
};

/** Как будто вошли под admin@mail.ru (flyout → Sign in as admin). */
export const signInAsDevAdmin = (): UserIdentity => {
  const devToken = typeof __CEP_DEV_ADMIN_TOKEN__ !== "undefined" ? __CEP_DEV_ADMIN_TOKEN__ : "";
  const user: UserIdentity = {
    id: DEV_ADMIN_ID,
    email: DEV_ADMIN_EMAIL,
    name: "Admin (dev)",
    devToken: devToken || undefined,
  };
  setUserIdentity(user);
  return user;
};
