export class PlayerRendererRegistry {
    factory;
    handles = new Map();
    constructor(factory) {
        this.factory = factory;
    }
    reconcile(players, localPlayerId = null) {
        const connected = new Map();
        for (const player of players) {
            if (!player.connected)
                continue;
            connected.set(player.id, player);
            let handle = this.handles.get(player.id);
            if (!handle) {
                handle = this.factory(player);
                this.handles.set(player.id, handle);
            }
            else
                handle.update(player);
            handle.setLocal?.(player.id === localPlayerId);
        }
        for (const [id, handle] of [...this.handles]) {
            if (connected.has(id))
                continue;
            handle.dispose();
            this.handles.delete(id);
        }
    }
    tick(dt) {
        for (const handle of this.handles.values())
            handle.tick?.(dt);
    }
    ids() { return [...this.handles.keys()]; }
    size() { return this.handles.size; }
    dispose() {
        for (const handle of this.handles.values())
            handle.dispose();
        this.handles.clear();
    }
}
