/**
 * CEP WebSocket client — auth frame then hello(host); reconnect with backoff.
 * Receives pack lifecycle events + extension.update (new ZXP on CDN).
 */
import { API_BASE, apiUrl } from "@/api/config";
import { getSessionToken, handleUnauthorized } from "@/lib/api/session";
import { shouldKeepSharedSession } from "@/lib/api/shared-auth-session";
import { currentHostAppId } from "@/lib/utils/apply-item";
function wsUrl() {
    const base = apiUrl("/api/cep/ws");
    if (base.startsWith("https://"))
        return `wss://${base.slice("https://".length)}`;
    if (base.startsWith("http://"))
        return `ws://${base.slice("http://".length)}`;
    const origin = typeof window !== "undefined" ? window.location.origin : API_BASE;
    const u = new URL(base, origin);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
}
function hostForHello() {
    return currentHostAppId() === "PPRO" ? "PR" : "AE";
}
class CepWsClient {
    ws = null;
    handlers = new Set();
    reconnectTimer = null;
    pingTimer = null;
    intentionalClose = false;
    attempt = 0;
    started = false;
    onEvent(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    start() {
        this.intentionalClose = false;
        this.started = true;
        this.connect();
    }
    stop() {
        this.intentionalClose = true;
        this.started = false;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        if (this.pingTimer)
            clearInterval(this.pingTimer);
        this.pingTimer = null;
        try {
            this.ws?.close(1000, "stop");
        }
        catch {
            /* ignore */
        }
        this.ws = null;
    }
    emit(event) {
        for (const h of this.handlers) {
            try {
                h(event);
            }
            catch {
                /* ignore */
            }
        }
    }
    scheduleReconnect() {
        if (this.intentionalClose || !this.started)
            return;
        if (this.reconnectTimer)
            return;
        const delay = Math.min(30_000, 1000 * Math.pow(2, this.attempt));
        this.attempt += 1;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }
    connect() {
        const token = getSessionToken();
        if (!token)
            return;
        try {
            const ws = new WebSocket(wsUrl());
            this.ws = ws;
            const adoptRotatedToken = () => {
                const disk = getSessionToken();
                if (!shouldKeepSharedSession({ failedToken: token, diskToken: disk })) {
                    return false;
                }
                handleUnauthorized("TOKEN_ROTATED", token);
                return true;
            };
            ws.onopen = () => {
                ws.send(JSON.stringify({ type: "auth", token }));
            };
            ws.onmessage = (ev) => {
                let msg;
                try {
                    msg = JSON.parse(String(ev.data));
                }
                catch {
                    return;
                }
                const type = String(msg.type || "");
                if (type === "auth.ok") {
                    this.attempt = 0;
                    ws.send(JSON.stringify({ type: "hello", host: hostForHello() }));
                    if (this.pingTimer)
                        clearInterval(this.pingTimer);
                    this.pingTimer = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: "ping" }));
                        }
                    }, 20_000);
                    return;
                }
                if (type === "pack.created" ||
                    type === "pack.updated" ||
                    type === "pack.deleted") {
                    this.emit(msg);
                    return;
                }
                if (type === "extension.update" && typeof msg.version === "string") {
                    this.emit(msg);
                    return;
                }
                if (type === "device.revoked") {
                    if (adoptRotatedToken()) {
                        this.started = true;
                        this.intentionalClose = false;
                        this.scheduleReconnect();
                        return;
                    }
                    handleUnauthorized("DEVICE_REVOKED", token);
                    return;
                }
            };
            ws.onclose = (ev) => {
                if (this.pingTimer)
                    clearInterval(this.pingTimer);
                this.pingTimer = null;
                this.ws = null;
                if (ev.code === 4401) {
                    if (adoptRotatedToken()) {
                        this.started = true;
                        this.intentionalClose = false;
                        this.scheduleReconnect();
                        return;
                    }
                    handleUnauthorized(ev.reason === "REVOKED" ? "DEVICE_REVOKED" : "WS_UNAUTHORIZED", token);
                    return;
                }
                this.scheduleReconnect();
            };
            ws.onerror = () => {
                /* onclose will fire */
            };
        }
        catch {
            this.scheduleReconnect();
        }
    }
}
export const cepWs = new CepWsClient();
