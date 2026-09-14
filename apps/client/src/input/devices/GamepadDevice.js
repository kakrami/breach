function deadzone(value, threshold = 0.16) {
    const abs = Math.abs(value);
    if (abs <= threshold)
        return 0;
    return Math.sign(value) * Math.min(1, (abs - threshold) / (1 - threshold));
}
export class GamepadDevice {
    hub;
    onTelemetry;
    frame = 0;
    previous = new Map();
    constructor(hub, onTelemetry) {
        this.hub = hub;
        this.onTelemetry = onTelemetry;
        this.frame = requestAnimationFrame(this.poll);
    }
    dispose() {
        cancelAnimationFrame(this.frame);
        this.previous.clear();
        this.hub.update("gamepad", { moveX: 0, moveY: 0, jumpHeld: false, sprintHeld: false, crouchHeld: false, lookRateX: 0, lookRateY: 0 }, false);
    }
    poll = () => {
        let found = false;
        for (const pad of navigator.getGamepads?.() ?? []) {
            if (!pad)
                continue;
            found = true;
            this.onTelemetry?.({
                at: performance.now(),
                index: pad.index,
                id: pad.id,
                mapping: pad.mapping,
                connected: pad.connected,
                axes: [...pad.axes],
                buttons: pad.buttons.map((button) => ({ pressed: button.pressed, value: button.value }))
            });
            const moveX = deadzone(pad.axes[0] ?? 0);
            const moveY = -deadzone(pad.axes[1] ?? 0);
            const lookX = deadzone(pad.axes[2] ?? 0);
            const lookY = deadzone(pad.axes[3] ?? 0);
            const jumpHeld = Boolean(pad.buttons[0]?.pressed);
            const crouchHeld = Boolean(pad.buttons[1]?.pressed);
            const sprintHeld = Boolean(pad.buttons[10]?.pressed);
            const active = Math.abs(moveX) + Math.abs(moveY) + Math.abs(lookX) + Math.abs(lookY) > 0.08 || jumpHeld || crouchHeld || sprintHeld;
            this.hub.update("gamepad", { moveX, moveY, jumpHeld, crouchHeld, sprintHeld, lookRateX: lookX * 2.6, lookRateY: lookY * 2.15 }, active);
            // Temporary alpha utilities are modifier chords so normal CoD-style controls stay clean.
            this.edgeChord(pad, "view+y", 8, 3, "team-switch");
            this.edgeChord(pad, "view+x", 8, 2, "reconnect");
            this.edgeChord(pad, "view+b", 8, 1, "debug-kill");
        }
        if (!found) {
            this.hub.update("gamepad", { moveX: 0, moveY: 0, jumpHeld: false, sprintHeld: false, crouchHeld: false, lookRateX: 0, lookRateY: 0 }, false);
            this.onTelemetry?.({ at: performance.now(), index: -1, id: "", mapping: "", connected: false, axes: [], buttons: [] });
        }
        this.frame = requestAnimationFrame(this.poll);
    };
    edgeChord(pad, key, modifierIndex, buttonIndex, action) {
        const pressed = Boolean(pad.buttons[modifierIndex]?.pressed) && Boolean(pad.buttons[buttonIndex]?.pressed);
        const token = `${pad.index}:${key}`;
        const wasPressed = this.previous.get(token) ?? false;
        if (pressed && !wasPressed)
            this.hub.emit(action, "gamepad");
        this.previous.set(token, pressed);
    }
}
