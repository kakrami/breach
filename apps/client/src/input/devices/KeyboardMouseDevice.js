export class KeyboardMouseDevice {
    hub;
    held = new Set();
    constructor(hub) {
        this.hub = hub;
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
        window.addEventListener("mousemove", this.onMouseMove, { passive: true });
        window.addEventListener("blur", this.clear);
    }
    dispose() {
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
        window.removeEventListener("mousemove", this.onMouseMove);
        window.removeEventListener("blur", this.clear);
    }
    onMouseMove = (event) => {
        if (!document.pointerLockElement)
            return;
        this.hub.addLookDelta("keyboard-mouse", event.movementX * 0.0022, event.movementY * 0.0022);
    };
    onKeyDown = (event) => {
        const target = event.target;
        if (target?.matches("input, textarea, select"))
            return;
        this.held.add(event.code);
        this.publish();
        if (event.repeat)
            return;
        if (event.code === "KeyT")
            this.hub.emit("team-switch", "keyboard-mouse");
        else if (event.code === "F8")
            this.hub.emit("diagnostics-export", "keyboard-mouse");
        else if (event.code === "KeyR")
            this.hub.emit("reconnect", "keyboard-mouse");
        else if (event.code === "KeyK")
            this.hub.emit("debug-kill", "keyboard-mouse");
    };
    onKeyUp = (event) => {
        this.held.delete(event.code);
        this.publish();
    };
    clear = () => {
        this.held.clear();
        this.publish(false);
    };
    publish(active = true) {
        const left = this.held.has("KeyA") || this.held.has("ArrowLeft");
        const right = this.held.has("KeyD") || this.held.has("ArrowRight");
        const forward = this.held.has("KeyW") || this.held.has("ArrowUp");
        const back = this.held.has("KeyS") || this.held.has("ArrowDown");
        this.hub.update("keyboard-mouse", {
            moveX: Number(right) - Number(left),
            moveY: Number(forward) - Number(back),
            jumpHeld: this.held.has("Space"),
            sprintHeld: this.held.has("ShiftLeft") || this.held.has("ShiftRight"),
            crouchHeld: this.held.has("ControlLeft") || this.held.has("ControlRight") || this.held.has("KeyC")
        }, active);
    }
}
