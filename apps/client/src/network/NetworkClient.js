import { decodeServerEvent } from "../../../../packages/shared/src/validation.js";
import { BREACH_VERSION, PROTOCOL_VERSION } from "../../../../packages/shared/src/version.js";
export class NetworkClient {
    callbacks;
    socket = null;
    generation = 0;
    options = null;
    constructor(callbacks) {
        this.callbacks = callbacks;
    }
    async connect(options) {
        this.disconnect(false);
        this.options = { ...options };
        const generation = ++this.generation;
        this.callbacks.onStatus("connecting", "Checking Worker health");
        this.callbacks.onDiagnostic("network.connect", { room: options.roomId, serverBase: options.serverBase });
        try {
            const health = await probeHealth(options.serverBase);
            if (generation !== this.generation)
                return;
            this.callbacks.onDiagnostic("network.health", health);
            if (!health.ok)
                throw new Error("Worker health check returned ok=false");
            if (health.protocol !== PROTOCOL_VERSION) {
                throw new Error(`Worker protocol ${String(health.protocol ?? "unknown")} does not match client protocol ${PROTOCOL_VERSION}`);
            }
            if (health.version !== BREACH_VERSION) {
                throw new Error(`Worker version ${String(health.version ?? "unknown")} does not match client ${BREACH_VERSION}`);
            }
            const url = socketUrl(options);
            this.callbacks.onDiagnostic("network.socket_opening", { room: options.roomId, url: redactUrl(url) });
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
                const detail = event.code === 1006
                    ? "1006 abnormal close after health check — inspect Worker logs"
                    : `${event.code}${event.reason ? ` ${event.reason}` : ""}`;
                this.callbacks.onStatus("closed", detail);
                this.callbacks.onDiagnostic("network.close", { code: event.code, reason: event.reason, clean: event.wasClean });
            });
            socket.addEventListener("error", () => {
                if (generation !== this.generation)
                    return;
                this.callbacks.onStatus("error", "WebSocket transport error after successful Worker health check");
                this.callbacks.onDiagnostic("network.error", { generation });
            });
        }
        catch (error) {
            if (generation !== this.generation)
                return;
            this.socket = null;
            const message = error instanceof Error ? error.message : String(error);
            this.callbacks.onStatus("error", `Worker preflight failed: ${message}`);
            this.callbacks.onDiagnostic("network.preflight_error", { serverBase: options.serverBase, error: message });
        }
    }
    reconnect() {
        if (!this.options)
            return;
        void this.connect(this.options);
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
async function probeHealth(serverBase) {
    const url = new URL("/health", serverBase.endsWith("/") ? serverBase : `${serverBase}/`);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    try {
        const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
        if (!response.ok)
            throw new Error(`HTTP ${response.status} from ${url.host}/health`);
        const value = await response.json();
        return value;
    }
    catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
            throw new Error(`Timed out reaching ${url.host}/health`);
        throw error;
    }
    finally {
        window.clearTimeout(timeout);
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
