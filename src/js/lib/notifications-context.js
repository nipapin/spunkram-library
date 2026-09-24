import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePanelUI } from "@/lib/panel-ui-context";
import { cepWs } from "@/lib/cep-ws";
import { onSessionExpired } from "@/lib/api/session";
import { BRAND } from "@brands";
/** Survive Vite HMR: Fast Refresh recreates the module and a fresh createContext()
 * would disconnect Provider from consumers until a full page reload. */
const NOTIFICATIONS_CONTEXT_KEY = "__spunkram_notifications_context__";
const NotificationsContext = globalThis[NOTIFICATIONS_CONTEXT_KEY] ??
    createContext(null);
globalThis[NOTIFICATIONS_CONTEXT_KEY] =
    NotificationsContext;
function titleForEvent(ev) {
    switch (ev.type) {
        case "pack.created":
            return `New pack: ${ev.name}`;
        case "pack.updated":
            return `Updated: ${ev.name}`;
        case "pack.deleted":
            return `Removed: ${ev.name}`;
        default:
            return ev.name;
    }
}
export function NotificationsProvider({ children }) {
    const { signedIn, authReady, refreshMarket, market, auth } = useAuth();
    const { showStatus } = usePanelUI();
    const [items, setItems] = useState([]);
    const extensionHandlers = useRef(new Set());
    const onExtensionUpdateHint = useCallback((handler) => {
        extensionHandlers.current.add(handler);
        return () => {
            extensionHandlers.current.delete(handler);
        };
    }, []);
    const pushPackEvent = useCallback((ev) => {
        // Always refresh catalog; deleted packs should not toast.
        void refreshMarket(true);
        if (ev.type === "pack.deleted")
            return;
        const id = `${ev.type}-${ev.id}-${ev.ts}`;
        const title = titleForEvent(ev);
        const tone = "success";
        setItems((prev) => {
            if (prev.some((p) => p.id === id))
                return prev;
            return [
                {
                    id,
                    title,
                    tone,
                    event: ev,
                    at: Date.now(),
                    read: false,
                },
                ...prev,
            ].slice(0, 40);
        });
        const fromCatalog = market?.Packages?.find((p) => String(p.id) === String(ev.id));
        const detailsUrl = ev.details_url || fromCatalog?.details_url || fromCatalog?.buy_url || null;
        const imageUrl = ev.image_url || fromCatalog?.image_url || null;
        showStatus(title, tone, 7000, {
            title: ev.name || ev.pack_name || "Pack",
            subtitle: ev.type === "pack.updated" ? "Pack updated" : "New pack",
            imageUrl,
            detailsUrl,
        });
    }, [market?.Packages, refreshMarket, showStatus]);
    const handleWsEvent = useCallback((ev) => {
        if (ev.type === "device.revoked") {
            // Session wipe happens in cep-ws via handleUnauthorized.
            showStatus("This device was signed out remotely", "error", 6000);
            return;
        }
        if (ev.type === "extension.update") {
            // Ignore other-brand publishes (shared Redis channel).
            if (ev.product && ev.product !== BRAND.id)
                return;
            // Hint listeners (main UpdateBanner) re-check GET /api/cep/update for beta gate.
            for (const h of extensionHandlers.current) {
                try {
                    h(ev.version);
                }
                catch {
                    /* ignore */
                }
            }
            return;
        }
        pushPackEvent(ev);
    }, [pushPackEvent, showStatus]);
    useEffect(() => {
        if (!authReady)
            return;
        if (!signedIn) {
            cepWs.stop();
            return;
        }
        const off = cepWs.onEvent(handleWsEvent);
        cepWs.start();
        return () => {
            off();
            cepWs.stop();
        };
    }, [signedIn, authReady, handleWsEvent, auth.token]);
    useEffect(() => {
        return onSessionExpired(() => {
            cepWs.stop();
        });
    }, []);
    const unreadMarketCount = useMemo(() => items.filter((i) => !i.read && i.event).length, [items]);
    const clearUnread = useCallback(() => {
        setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    }, []);
    const dismiss = useCallback((id) => {
        setItems((prev) => prev.filter((i) => i.id !== id));
    }, []);
    const value = useMemo(() => ({
        items,
        unreadMarketCount,
        clearUnread,
        dismiss,
        onExtensionUpdateHint,
    }), [items, unreadMarketCount, clearUnread, dismiss, onExtensionUpdateHint]);
    return (_jsx(NotificationsContext.Provider, { value: value, children: children }));
}
export function useNotifications() {
    const ctx = useContext(NotificationsContext);
    if (!ctx) {
        return {
            items: [],
            unreadMarketCount: 0,
            clearUnread: () => undefined,
            dismiss: () => undefined,
            onExtensionUpdateHint: () => () => undefined,
        };
    }
    return ctx;
}
