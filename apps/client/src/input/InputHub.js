const EMPTY = { moveX: 0, moveY: 0, jumpHeld: false, sprintHeld: false, crouchHeld: false, lookRateX: 0, lookRateY: 0 };
export class InputHub {
    listeners = new Set();
    states = new Map();
    activity = new Map();
    lookDelta = new Map();
    modeValue = "keyboard-mouse";
    lastActivityAt = performance.now();
    previousJumpHeld = false;
    constructor() {
        this.states.set("keyboard-mouse", { ...EMPTY });
        this.states.set("touch", { ...EMPTY });
        this.states.set("gamepad", { ...EMPTY });
    }
    emit(action, mode) {
        this.noteMode(mode);
        const event = { action, mode, at: this.lastActivityAt };
        for (const listener of [...this.listeners]) {
            try {
                listener(event);
            }
            catch { /* consumer isolation */ }
        }
    }
    update(mode, patch, active = true) {
        const current = this.states.get(mode) ?? { ...EMPTY };
        this.states.set(mode, { ...current, ...patch });
        if (active)
            this.noteMode(mode);
    }
    addLookDelta(mode, x, y) {
        const current = this.lookDelta.get(mode) ?? { x: 0, y: 0 };
        current.x += Number.isFinite(x) ? x : 0;
        current.y += Number.isFinite(y) ? y : 0;
        this.lookDelta.set(mode, current);
        if (Math.abs(x) + Math.abs(y) > 0.0001)
            this.noteMode(mode);
    }
    noteMode(mode) {
        this.modeValue = mode;
        this.lastActivityAt = performance.now();
        this.activity.set(mode, this.lastActivityAt);
    }
    sample(dt) {
        const mode = this.mostRecentMode();
        const state = this.states.get(mode) ?? EMPTY;
        const delta = this.lookDelta.get(mode) ?? { x: 0, y: 0 };
        this.lookDelta.set(mode, { x: 0, y: 0 });
        const jumpPressed = state.jumpHeld && !this.previousJumpHeld;
        this.previousJumpHeld = state.jumpHeld;
        return {
            mode,
            moveX: state.moveX,
            moveY: state.moveY,
            lookX: delta.x + state.lookRateX * dt,
            lookY: delta.y + state.lookRateY * dt,
            jumpHeld: state.jumpHeld,
            jumpPressed,
            sprintHeld: state.sprintHeld,
            crouchHeld: state.crouchHeld
        };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    snapshot() {
        return {
            mode: this.modeValue,
            lastActivityAt: this.lastActivityAt,
            states: {
                "keyboard-mouse": { ...(this.states.get("keyboard-mouse") ?? EMPTY) },
                touch: { ...(this.states.get("touch") ?? EMPTY) },
                gamepad: { ...(this.states.get("gamepad") ?? EMPTY) }
            }
        };
    }
    mostRecentMode() {
        let mode = this.modeValue;
        let newest = this.activity.get(mode) ?? 0;
        for (const candidate of ["keyboard-mouse", "touch", "gamepad"]) {
            const at = this.activity.get(candidate) ?? 0;
            if (at > newest) {
                mode = candidate;
                newest = at;
            }
        }
        this.modeValue = mode;
        return mode;
    }
}
