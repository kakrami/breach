import { clonePlayer } from "../../../../packages/shared/src/player.js";
export class ClientStore {
    connected = false;
    localPlayerId = null;
    roomRevision = 0;
    snapshotSeq = 0;
    serverTime = 0;
    serverVersion = null;
    connectionEpoch = 0;
    lastError = null;
    players = new Map();
    listeners = new Set();
    setTransportConnected(connected) {
        this.connected = connected;
        this.emit(null);
    }
    apply(event) {
        switch (event.type) {
            case "session.welcome":
                this.localPlayerId = event.payload.playerId;
                this.roomRevision = Math.max(this.roomRevision, event.payload.roomRevision);
                this.serverVersion = event.payload.version;
                this.connectionEpoch = event.payload.connectionEpoch;
                this.serverTime = event.payload.serverTime;
                this.lastError = null;
                break;
            case "room.snapshot":
                if (event.payload.revision < this.roomRevision)
                    return;
                this.roomRevision = event.payload.revision;
                this.serverTime = event.payload.serverTime;
                this.players.clear();
                for (const player of event.payload.players)
                    this.players.set(player.id, clonePlayer(player));
                break;
            case "simulation.snapshot":
                if (event.payload.snapshotSeq <= this.snapshotSeq)
                    return;
                this.snapshotSeq = event.payload.snapshotSeq;
                this.serverTime = event.payload.serverTime;
                for (const incoming of event.payload.players) {
                    const existing = this.players.get(incoming.id);
                    if (!existing || incoming.revision >= existing.revision)
                        this.players.set(incoming.id, clonePlayer(incoming));
                }
                break;
            case "player.updated":
            case "player.respawned": {
                if (event.payload.revision < this.roomRevision)
                    return;
                this.roomRevision = event.payload.revision;
                const incoming = event.payload.player;
                const existing = this.players.get(incoming.id);
                if (!existing || incoming.revision >= existing.revision)
                    this.players.set(incoming.id, clonePlayer(incoming));
                break;
            }
            case "player.removed":
                if (event.payload.revision < this.roomRevision)
                    return;
                this.roomRevision = event.payload.revision;
                this.players.delete(event.payload.playerId);
                break;
            case "error":
                this.lastError = `${event.payload.code}: ${event.payload.message}`;
                break;
            case "diagnostics.pong":
                break;
        }
        this.emit(event);
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.snapshot(), null);
        return () => this.listeners.delete(listener);
    }
    snapshot() {
        return {
            connected: this.connected,
            localPlayerId: this.localPlayerId,
            roomRevision: this.roomRevision,
            snapshotSeq: this.snapshotSeq,
            serverTime: this.serverTime,
            serverVersion: this.serverVersion,
            connectionEpoch: this.connectionEpoch,
            players: [...this.players.values()].map(clonePlayer),
            lastError: this.lastError
        };
    }
    player(id) {
        const found = this.players.get(id);
        return found ? clonePlayer(found) : undefined;
    }
    clearForLeave() {
        this.connected = false;
        this.localPlayerId = null;
        this.roomRevision = 0;
        this.snapshotSeq = 0;
        this.serverTime = 0;
        this.serverVersion = null;
        this.connectionEpoch = 0;
        this.lastError = null;
        this.players.clear();
        this.emit(null);
    }
    emit(event) {
        const snapshot = this.snapshot();
        for (const listener of [...this.listeners]) {
            try {
                listener(snapshot, event);
            }
            catch { /* listener isolation */ }
        }
    }
}
