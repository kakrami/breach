import { decodeServerEvent } from "../../../../packages/shared/src/validation.js";
import { PROTOCOL_VERSION } from "../../../../packages/shared/src/version.js";
export class NetworkClient {
    callbacks;
    socket = null;
    generation = 0;
    options = null;
    constructor(callbacks) {
        this.callbacks = callbacks;
    }
    connect(options) {
        this.disconnect(false);
        this.options = { ...options };
        const generation = ++this.generation;
        const url = socketUrl(options);
        this.callbacks.onStatus("connecting");
        this.callbacks.onDiagnostic("network.connect", { room: options.roomId, url: redactUrl(url) });
        const socket = new WebSocket(url);
        this.socket = socket;
        socket.addEventListener("open", () => {
            if (generation !== this.generation)
                return;
            this.callbacks.onStatus("open");
            this.callbacks.onDiagnostic("network.open", { generation });
        });
        socket.addEventListener("message", (event) => {
            if (generation !== this.generation)
                return;
            try {
                const decoded = decodeServerEvent(String(event.data));
                this.callbacks.onDiagnostic("network.event", { type: decoded.type, seq: decoded.seq });
                this.callbacks.onEvent(decoded);
            }
            catch (error) {
                this.callbacks.onDiagnostic("network.decode_error", { error: error instanceof Error ? error.message : String(error) });
            }
        });
        socket.addEventListener("close", (event) => {
            if (generation !== this.generation)
                return;
            this.socket = null;
            this.callbacks.onStatus("closed", `${event.code}${event.reason ? ` ${event.reason}` : ""}`);
            this.callbacks.onDiagnostic("network.close", { code: event.code, reason: event.reason, clean: event.wasClean });
        });
        socket.addEventListener("error", () => {
            if (generation !== this.generation)
                return;
            this.callbacks.onStatus("error", "WebSocket error");
            this.callbacks.onDiagnostic("network.error", { generation });
        });
    }
    reconnect() {
        if (!this.options)
            return;
        this.connect(this.options);
    }
    disconnect(clearOptions = true) {
        this.generation += 1;
        const socket = this.socket;
        this.socket = null;
        if (socket && socket.readyState <= WebSocket.OPEN) {
            try {
                socket.close(1000, "Client disconnect");
            }
            catch { /* no-op */ }
        }
        if (clearOptions)
            this.options = null;
        this.callbacks.onStatus("idle");
    }
    send(type, payload) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
            throw new Error("socket_not_open");
        const requestId = crypto.randomUUID();
        const command = { v: PROTOCOL_VERSION, type, requestId, payload };
        this.socket.send(JSON.stringify(command));
        this.callbacks.onDiagnostic("network.command", { type, requestId });
        return requestId;
    }
    isOpen() {
        return this.socket?.readyState === WebSocket.OPEN;
    }
}
function socketUrl(options) {
    const base = new URL(options.serverBase);
    base.protocol = base.protocol === "https:" ? "wss:" : base.protocol === "http:" ? "ws:" : base.protocol;
    base.pathname = `/api/rooms/${encodeURIComponent(options.roomId)}/socket`;
    base.search = "";
    base.searchParams.set("session", options.sessionId);
    base.searchParams.set("name", options.displayName);
    return base.toString();
}
function redactUrl(value) {
    const url = new URL(value);
    if (url.searchParams.has("session"))
        url.searchParams.set("session", "[redacted]");
    return url.toString();
}
