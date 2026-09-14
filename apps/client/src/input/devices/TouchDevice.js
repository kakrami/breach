export class TouchDevice {
    hub;
    onTelemetry;
    disposers = [];
    move = null;
    look = null;
    sprint = false;
    constructor(hub, onTelemetry) {
        this.hub = hub;
        this.onTelemetry = onTelemetry;
        this.bindAction("touchTeamSwitch", "team-switch");
        this.bindAction("touchReconnect", "reconnect");
        this.bindAction("touchKill", "debug-kill");
        this.bindPad("touchMovePad", "move");
        this.bindPad("touchLookPad", "look");
        this.bindHold("touchJump", "jump");
        this.bindHold("touchSprint", "sprint");
        this.bindHold("touchCrouch", "crouch");
        window.addEventListener("touchstart", this.onTouchStart, { passive: true });
    }
    dispose() {
        for (const dispose of this.disposers.splice(0))
            dispose();
        window.removeEventListener("touchstart", this.onTouchStart);
    }
    onTouchStart = () => this.hub.noteMode("touch");
    bindAction(id, action) {
        const button = document.getElementById(id);
        if (!button)
            return;
        const handler = (event) => {
            event.preventDefault();
            this.hub.emit(action, "touch");
            this.onTelemetry?.({ at: performance.now(), kind: "action", control: action, phase: "fire" });
        };
        button.addEventListener("pointerdown", handler);
        this.disposers.push(() => button.removeEventListener("pointerdown", handler));
    }
    bindHold(id, kind) {
        const button = document.getElementById(id);
        if (!button)
            return;
        const down = (event) => {
            event.preventDefault();
            button.setPointerCapture?.(event.pointerId);
            if (kind === "sprint")
                this.sprint = true;
            const patch = kind === "jump" ? { jumpHeld: true } : kind === "sprint" ? { sprintHeld: true } : { crouchHeld: true };
            this.hub.update("touch", patch, true);
            this.onTelemetry?.({ at: performance.now(), kind: "hold", control: kind, phase: "down", pointerId: event.pointerId });
        };
        const up = (event) => {
            event.preventDefault();
            if (kind === "sprint")
                this.sprint = false;
            const patch = kind === "jump" ? { jumpHeld: false } : kind === "sprint" ? { sprintHeld: false } : { crouchHeld: false };
            this.hub.update("touch", patch, true);
            this.onTelemetry?.({ at: performance.now(), kind: "hold", control: kind, phase: "up", pointerId: event.pointerId });
        };
        button.addEventListener("pointerdown", down);
        button.addEventListener("pointerup", up);
        button.addEventListener("pointercancel", up);
        this.disposers.push(() => { button.removeEventListener("pointerdown", down); button.removeEventListener("pointerup", up); button.removeEventListener("pointercancel", up); });
    }
    bindPad(id, kind) {
        const pad = document.getElementById(id);
        if (!pad)
            return;
        const down = (event) => {
            event.preventDefault();
            pad.setPointerCapture?.(event.pointerId);
            const track = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
            if (kind === "move")
                this.move = track;
            else
                this.look = track;
            this.hub.noteMode("touch");
            this.onTelemetry?.({ at: performance.now(), kind: "pad", control: kind, phase: "down", pointerId: event.pointerId, x: event.clientX, y: event.clientY });
        };
        const move = (event) => {
            const track = kind === "move" ? this.move : this.look;
            if (!track || track.id !== event.pointerId)
                return;
            event.preventDefault();
            if (kind === "move") {
                const dx = event.clientX - track.startX;
                const dy = event.clientY - track.startY;
                const radius = Math.max(34, Math.min(pad.clientWidth, pad.clientHeight) * 0.42);
                this.hub.update("touch", { moveX: clamp(dx / radius), moveY: clamp(-dy / radius), sprintHeld: this.sprint }, true);
            }
            else {
                const dx = event.clientX - track.x;
                const dy = event.clientY - track.y;
                this.hub.addLookDelta("touch", dx * 0.006, dy * 0.006);
                track.x = event.clientX;
                track.y = event.clientY;
            }
            this.onTelemetry?.({ at: performance.now(), kind: "pad", control: kind, phase: "move", pointerId: event.pointerId, x: event.clientX, y: event.clientY });
        };
        const up = (event) => {
            const track = kind === "move" ? this.move : this.look;
            if (!track || track.id !== event.pointerId)
                return;
            event.preventDefault();
            if (kind === "move") {
                this.move = null;
                this.hub.update("touch", { moveX: 0, moveY: 0 }, true);
            }
            else
                this.look = null;
            this.onTelemetry?.({ at: performance.now(), kind: "pad", control: kind, phase: "up", pointerId: event.pointerId, x: event.clientX, y: event.clientY });
        };
        pad.addEventListener("pointerdown", down);
        pad.addEventListener("pointermove", move);
        pad.addEventListener("pointerup", up);
        pad.addEventListener("pointercancel", up);
        this.disposers.push(() => { pad.removeEventListener("pointerdown", down); pad.removeEventListener("pointermove", move); pad.removeEventListener("pointerup", up); pad.removeEventListener("pointercancel", up); });
    }
}
function clamp(value) { return Math.max(-1, Math.min(1, value)); }
