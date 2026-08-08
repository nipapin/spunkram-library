/**
 * CEP WebSocket client — auth frame then hello(host); reconnect with backoff.
 */
import { apiUrl } from "@/api/config";
import { getSessionToken, handleUnauthorized } from "@/lib/api/session";
import { currentHostAppId } from "@/lib/utils/apply-item";

export type CepPackEventType = "pack.created" | "pack.updated" | "pack.deleted";

export type CepPackEvent = {
  type: CepPackEventType;
  id: string;
  name: string;
  pack_name: string;
  host: "AE" | "PR" | string;
  version?: string | null;
  image_url?: string | null;
  details_url?: string | null;
  visible?: boolean;
  ts: number;
  author_id?: number;
};

type EventHandler = (event: CepPackEvent) => void;

function wsUrl(): string {
  const base = apiUrl("/api/cep/ws");
  if (base.startsWith("https://")) return `wss://${base.slice("https://".length)}`;
  if (base.startsWith("http://")) return `ws://${base.slice("http://".length)}`;
  // relative (vite proxy) — resolve against location
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:4000";
  const u = new URL(base, origin);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}

function hostForHello(): "AE" | "PR" {
  return currentHostAppId() === "PPRO" ? "PR" : "AE";
}

class CepWsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  private attempt = 0;
  private started = false;

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  start(): void {
    this.intentionalClose = false;
    this.started = true;
    this.connect();
  }

  stop(): void {
    this.intentionalClose = true;
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    try {
      this.ws?.close(1000, "stop");
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private emit(event: CepPackEvent): void {
    for (const h of this.handlers) {
      try {
        h(event);
      } catch {
        /* ignore */
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || !this.started) return;
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * Math.pow(2, this.attempt));
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private connect(): void {
    const token = getSessionToken();
    if (!token) return;

    try {
      const ws = new WebSocket(wsUrl());
      this.ws = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token }));
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(msg.type || "");
        if (type === "auth.ok") {
          this.attempt = 0;
          ws.send(JSON.stringify({ type: "hello", host: hostForHello() }));
          if (this.pingTimer) clearInterval(this.pingTimer);
          this.pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 20_000);
          return;
        }
        if (
          type === "pack.created" ||
          type === "pack.updated" ||
          type === "pack.deleted"
        ) {
          this.emit(msg as unknown as CepPackEvent);
        }
      };

      ws.onclose = (ev) => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        this.ws = null;
        if (ev.code === 4401) {
          handleUnauthorized("WS_UNAUTHORIZED");
          return;
        }
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        /* onclose will fire */
      };
    } catch {
      this.scheduleReconnect();
    }
  }
}

export const cepWs = new CepWsClient();
