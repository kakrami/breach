import { BREACH_VERSION, PROTOCOL_VERSION } from "../../../../packages/shared/src/version.js";
const PROFILE_LABELS = {
    "desktop-kbm": "Desktop · Keyboard / Mouse",
    "desktop-controller": "Desktop · Controller",
    "iphone-touch": "iPhone Safari · Touch",
    "iphone-controller": "iPhone Safari · Bluetooth Controller"
};
const STANDARD_REQUIRED_BUTTONS = Array.from({ length: 16 }, (_, index) => index); // Home/system (16) is intentionally excluded.
const EMPTY_DIRECTIONS = () => ({ forward: false, back: false, left: false, right: false });
const EMPTY_COMMON = () => ({ lookX: false, lookY: false, jump: false, sprint: false, crouch: false });
export function validationProfileLabel(profile) { return PROFILE_LABELS[profile]; }
export class HardwareValidation {
    sendPing;
    listeners = new Set();
    maxEvents = 900;
    profileValue = "desktop-kbm";
    statusValue = "idle";
    runId = null;
    startedAtMs = 0;
    endedAtMs = 0;
    platformStart = null;
    platformCurrent = null;
    frameTimes = [];
    latencies = [];
    catchupDrops = 0;
    invariantViolations = 0;
    runtimeErrors = 0;
    teamSwitches = 0;
    respawns = 0;
    reconnectRequests = 0;
    successfulReconnects = 0;
    pendingReconnects = 0;
    gamepadWasConnected = false;
    gamepadDisconnectedAfterConnection = false;
    gamepadReconnectedAfterDisconnect = false;
    previousPlatformGamepad = null;
    hiddenSeen = false;
    visibleAfterHidden = false;
    orientationSeen = new Set();
    viewportSizes = new Set();
    inputModes = new Set();
    modeTransitions = [];
    lastObservedMode = null;
    actionsByMode = {
        "keyboard-mouse": new Set(), touch: new Set(), gamepad: new Set()
    };
    localTeamsSeen = new Set();
    localLifeIdsSeen = new Set();
    presentation = null;
    previousLocalTeam = null;
    keyboard = { ...EMPTY_DIRECTIONS(), ...EMPTY_COMMON() };
    touch = { ...EMPTY_DIRECTIONS(), ...EMPTY_COMMON(), multiTouchMoveLook: false };
    gamepadAxes = new Set();
    gamepadButtons = new Set();
    gamepadIds = new Set();
    gamepadStandardMapping = false;
    touchMovePointer = null;
    touchLookPointer = null;
    manual = {
        "safe-area": "unset",
        "touch-gestures": "unset"
    };
    events = [];
    lastPingAt = 0;
    pingEveryMs = 4000;
    constructor(sendPing) {
        this.sendPing = sendPing;
    }
    profile() { return this.profileValue; }
    status() { return this.statusValue; }
    isRunning() { return this.statusValue === "running"; }
    suggestProfile(platform) {
        if (platform.touchCapable)
            return platform.gamepadConnected ? "iphone-controller" : "iphone-touch";
        return platform.gamepadConnected ? "desktop-controller" : "desktop-kbm";
    }
    setProfile(profile) {
        if (this.isRunning())
            return;
        this.profileValue = profile;
        this.emit();
    }
    start(profile, platform, state) {
        this.resetEvidence();
        this.profileValue = profile;
        this.statusValue = "running";
        this.runId = crypto.randomUUID();
        this.startedAtMs = performance.now();
        this.endedAtMs = 0;
        this.platformStart = { ...platform };
        this.record("run.started", { profile, version: BREACH_VERSION, connected: state.connected });
        this.observePlatform(platform);
        this.observeState(state, null);
        this.emit();
    }
    stop() {
        if (this.isRunning()) {
            this.endedAtMs = performance.now();
            const checks = this.evaluateChecks(true);
            const required = checks.filter((check) => check.required);
            this.statusValue = required.some((check) => check.status === "fail") ? "fail" : required.every((check) => check.status === "pass" || check.status === "na") ? "pass" : "incomplete";
            this.record("run.stopped", { status: this.statusValue });
            this.emit();
        }
        return this.report();
    }
    reset() {
        const platform = this.platformCurrent;
        this.resetEvidence();
        this.statusValue = "idle";
        this.runId = null;
        this.startedAtMs = 0;
        this.endedAtMs = 0;
        this.platformStart = null;
        this.platformCurrent = platform;
        this.emit();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.report());
        return () => this.listeners.delete(listener);
    }
    setManual(id, value) {
        if (!this.isRunning())
            return;
        this.manual[id] = value;
        this.record("manual.result", { id, value });
        this.emit();
    }
    observePlatform(platform) {
        this.platformCurrent = { ...platform };
        if (!this.isRunning()) {
            this.emit();
            return;
        }
        this.orientationSeen.add(platform.orientation);
        this.viewportSizes.add(`${platform.visualWidth}x${platform.visualHeight}`);
        if (!platform.visible)
            this.hiddenSeen = true;
        if (platform.visible && this.hiddenSeen)
            this.visibleAfterHidden = true;
        this.noteGamepadConnection(platform.gamepadConnected);
        this.emit();
    }
    observeInputAction(event) {
        if (!this.isRunning())
            return;
        this.noteMode(event.mode);
        this.actionsByMode[event.mode].add(event.action);
        this.record("input.action", { mode: event.mode, action: event.action });
        this.emit();
    }
    observeReconnectRequested(mode) {
        if (!this.isRunning())
            return;
        this.reconnectRequests += 1;
        this.pendingReconnects += 1;
        this.record("reconnect.requested", { mode, count: this.reconnectRequests });
        this.emit();
    }
    observeInputFrame(frame) {
        if (!this.isRunning())
            return;
        this.noteMode(frame.mode);
        const target = frame.mode === "touch" ? this.touch : frame.mode === "keyboard-mouse" ? this.keyboard : null;
        if (target) {
            if (frame.moveY > 0.55)
                target.forward = true;
            if (frame.moveY < -0.55)
                target.back = true;
            if (frame.moveX < -0.55)
                target.left = true;
            if (frame.moveX > 0.55)
                target.right = true;
            if (Math.abs(frame.lookX) > 0.002)
                target.lookX = true;
            if (Math.abs(frame.lookY) > 0.002)
                target.lookY = true;
            if (frame.jumpHeld || frame.jumpPressed)
                target.jump = true;
            if (frame.sprintHeld)
                target.sprint = true;
            if (frame.crouchHeld)
                target.crouch = true;
        }
        this.emitThrottled();
    }
    observeGamepad(telemetry) {
        if (!this.isRunning())
            return;
        this.noteGamepadConnection(telemetry.connected);
        if (!telemetry.connected) {
            this.emitThrottled();
            return;
        }
        this.gamepadIds.add(telemetry.id);
        if (telemetry.mapping === "standard")
            this.gamepadStandardMapping = true;
        const axes = telemetry.axes;
        markAxis(this.gamepadAxes, "lx", axes[0] ?? 0);
        markAxis(this.gamepadAxes, "ly", axes[1] ?? 0);
        markAxis(this.gamepadAxes, "rx", axes[2] ?? 0);
        markAxis(this.gamepadAxes, "ry", axes[3] ?? 0);
        telemetry.buttons.forEach((button, index) => { if (button.pressed || button.value > 0.55)
            this.gamepadButtons.add(index); });
        this.emitThrottled();
    }
    observeTouch(telemetry) {
        if (!this.isRunning())
            return;
        this.noteMode("touch");
        if (telemetry.kind === "pad" && telemetry.control === "move") {
            if (telemetry.phase === "down")
                this.touchMovePointer = telemetry.pointerId ?? null;
            if (telemetry.phase === "up")
                this.touchMovePointer = null;
        }
        if (telemetry.kind === "pad" && telemetry.control === "look") {
            if (telemetry.phase === "down")
                this.touchLookPointer = telemetry.pointerId ?? null;
            if (telemetry.phase === "up")
                this.touchLookPointer = null;
        }
        if (this.touchMovePointer !== null && this.touchLookPointer !== null && this.touchMovePointer !== this.touchLookPointer)
            this.touch.multiTouchMoveLook = true;
        this.emitThrottled();
    }
    observeState(state, event) {
        if (!this.isRunning())
            return;
        const local = state.localPlayerId ? state.players.find((player) => player.id === state.localPlayerId) : undefined;
        if (local) {
            this.localTeamsSeen.add(local.team);
            this.localLifeIdsSeen.add(local.lifeId);
            if (this.previousLocalTeam === null)
                this.previousLocalTeam = local.team;
            else if (local.team !== this.previousLocalTeam) {
                this.teamSwitches += 1;
                this.previousLocalTeam = local.team;
                this.record("team.changed", { team: local.team, count: this.teamSwitches, lifeId: local.lifeId });
            }
            if (event?.type === "player.respawned" && event.payload.player.id === state.localPlayerId) {
                this.respawns += 1;
                this.record("life.respawned", { count: this.respawns, lifeId: event.payload.player.lifeId });
            }
        }
        this.emitThrottled();
    }
    observePresentation(state, rendererIds, markerIds) {
        if (!this.isRunning())
            return;
        this.presentation = {
            connectedPlayers: state.players.filter((player) => player.connected).length,
            renderers: rendererIds.length,
            markers: markerIds.length,
            rendererIds: [...rendererIds],
            markerIds: [...markerIds]
        };
        this.emitThrottled();
    }
    observeNetworkStatus(status) {
        if (!this.isRunning())
            return;
        if (status === "open" && this.pendingReconnects > 0) {
            this.pendingReconnects -= 1;
            this.successfulReconnects += 1;
            this.record("reconnect.succeeded", { count: this.successfulReconnects });
        }
        this.emit();
    }
    observeLatency(latencyMs) {
        if (!this.isRunning() || !Number.isFinite(latencyMs))
            return;
        this.latencies.push(Math.max(0, latencyMs));
        if (this.latencies.length > 120)
            this.latencies.shift();
        this.emitThrottled();
    }
    observeFrame(now, elapsedMs) {
        if (!this.isRunning())
            return;
        if (this.platformCurrent?.visible !== false && elapsedMs >= 0 && elapsedMs < 1000) {
            this.frameTimes.push(elapsedMs);
            if (this.frameTimes.length > 1800)
                this.frameTimes.shift();
        }
        if (now - this.lastPingAt >= this.pingEveryMs) {
            const sentAt = Date.now();
            if (this.sendPing(sentAt))
                this.lastPingAt = now;
        }
        this.emitThrottled();
    }
    observeCatchupDrop() {
        if (!this.isRunning())
            return;
        this.catchupDrops += 1;
        this.record("simulation.catchup_drop", { count: this.catchupDrops });
        this.emit();
    }
    observeInvariantViolations(violations) {
        if (!this.isRunning() || violations.length === 0)
            return;
        this.invariantViolations += violations.length;
        this.record("invariant.violation", violations);
        this.emit();
    }
    observeRuntimeError(kind, error) {
        if (!this.isRunning())
            return;
        this.runtimeErrors += 1;
        this.record("runtime.error", { kind, error: error instanceof Error ? error.stack ?? error.message : String(error) });
        this.emit();
    }
    report() {
        const now = this.isRunning() ? performance.now() : this.endedAtMs || this.startedAtMs;
        const durationMs = this.startedAtMs ? Math.max(0, now - this.startedAtMs) : 0;
        return {
            schema: "breach-hardware-validation-v1",
            runId: this.runId,
            version: BREACH_VERSION,
            protocol: PROTOCOL_VERSION,
            profile: this.profileValue,
            status: this.statusValue,
            startedAt: this.startedAtMs ? new Date(Date.now() - (performance.now() - this.startedAtMs)).toISOString() : null,
            endedAt: this.endedAtMs ? new Date(Date.now() - (performance.now() - this.endedAtMs)).toISOString() : null,
            durationMs: Math.round(durationMs),
            platformStart: this.platformStart ? { ...this.platformStart } : null,
            platformCurrent: this.platformCurrent ? { ...this.platformCurrent } : null,
            metrics: this.metrics(),
            checks: this.evaluateChecks(!this.isRunning() && this.statusValue !== "idle"),
            manual: { ...this.manual },
            evidence: this.evidence(),
            events: this.events.map((event) => ({ ...event }))
        };
    }
    evaluateChecks(final) {
        const profile = this.profileValue;
        const platform = this.platformCurrent;
        const isIPhoneProfile = profile.startsWith("iphone-");
        const isTouchProfile = profile === "iphone-touch" || profile === "iphone-controller";
        const isControllerProfile = profile === "desktop-controller" || profile === "iphone-controller";
        const isKeyboardProfile = profile === "desktop-kbm";
        const metrics = this.metrics();
        const checks = [];
        const add = (check) => { checks.push(check); };
        add(result("environment", "Environment", "Correct target environment", isIPhoneProfile ? "Run this profile in iPhone Safari." : "Run this profile on desktop browser.", true, platform ? (isIPhoneProfile ? isIPhoneSafari(platform.userAgent) : !isIPhone(platform.userAgent)) : false, platform ? summarizePlatform(platform) : "No platform snapshot", platform ? undefined : "pending"));
        if (isKeyboardProfile) {
            add(allDirectionsCheck("kb-move", "Keyboard / Mouse", "WASD directions", this.keyboard, "Press W, A, S and D."));
            add(commonCheck("kb-look", "Keyboard / Mouse", "Mouse look X/Y", this.keyboard.lookX && this.keyboard.lookY, "Click the game, then look left/right and up/down."));
            add(commonCheck("kb-actions", "Keyboard / Mouse", "Jump / sprint / crouch", this.keyboard.jump && this.keyboard.sprint && this.keyboard.crouch, "Use Space, Shift, and C/Ctrl."));
            const mapped = this.actionsByMode["keyboard-mouse"];
            add(commonCheck("kb-utilities", "Keyboard / Mouse", "Team / reconnect / respawn hotkeys", ["team-switch", "reconnect", "debug-kill"].every((action) => mapped.has(action)), "Use T, R and K at least once."));
        }
        if (isTouchProfile) {
            add(allDirectionsCheck("touch-move", "Touch", "MOVE pad directions", this.touch, "Move the MOVE pad forward, back, left and right."));
            add(commonCheck("touch-look", "Touch", "LOOK pad X/Y", this.touch.lookX && this.touch.lookY, "Drag LOOK horizontally and vertically."));
            add(commonCheck("touch-actions", "Touch", "Jump / sprint / crouch", this.touch.jump && this.touch.sprint && this.touch.crouch, "Use JUMP, SPRINT and CROUCH."));
            add(commonCheck("touch-multitouch", "Touch", "MOVE + LOOK simultaneously", this.touch.multiTouchMoveLook, "Hold MOVE while dragging LOOK with a second finger."));
            const mapped = this.actionsByMode.touch;
            add(commonCheck("touch-utilities", "Touch", "Team / reconnect / respawn buttons", ["team-switch", "reconnect", "debug-kill"].every((action) => mapped.has(action)), "Use TEAM, RECONNECT and RESPAWN at least once."));
        }
        if (isControllerProfile) {
            const axesOk = ["lx-", "lx+", "ly-", "ly+", "rx-", "rx+", "ry-", "ry+"].every((axis) => this.gamepadAxes.has(axis));
            add(commonCheck("gamepad-mapping", "Controller", "Standard browser mapping", this.gamepadStandardMapping, "Connect the Bluetooth/USB controller and press a control."));
            add(commonCheck("gamepad-axes", "Controller", "Both sticks · full axes", axesOk, "Move both sticks to every edge: left/right/up/down."));
            const missingButtons = STANDARD_REQUIRED_BUTTONS.filter((index) => !this.gamepadButtons.has(index));
            add({ id: "gamepad-buttons", category: "Controller", label: "All standard buttons", instruction: "Press A/B/X/Y, bumpers, triggers, View/Menu, both stick clicks, and every D-pad direction.", status: missingButtons.length === 0 ? "pass" : "pending", detail: missingButtons.length === 0 ? "All 16 exposed gameplay buttons observed" : `Still missing: ${missingButtons.map(buttonName).join(", ")}`, required: true });
            add(commonCheck("gamepad-reconnect", "Controller", "Disconnect + reconnect", this.gamepadDisconnectedAfterConnection && this.gamepadReconnectedAfterDisconnect, "Disconnect the controller, wait for detection, then reconnect it."));
            const mapped = this.actionsByMode.gamepad;
            add(commonCheck("gamepad-utilities", "Controller", "View + Y/X/B alpha utilities", ["team-switch", "reconnect", "debug-kill"].every((action) => mapped.has(action)), "Hold View/Back and use Y (team), X (reconnect), and B (respawn) at least once."));
        }
        if (isIPhoneProfile) {
            add(commonCheck("orientation", "iPhone", "Portrait + landscape recovery", this.orientationSeen.has("portrait") && this.orientationSeen.has("landscape") && this.viewportSizes.size >= 2, "Rotate portrait → landscape → portrait/landscape and confirm the game stays usable."));
            add(commonCheck("visibility", "iPhone", "Background + foreground recovery", this.hiddenSeen && this.visibleAfterHidden, "Background Safari, wait a few seconds, then return."));
            add(manualCheck("safe-area", "iPhone", "Safe area / notch clear", this.manual["safe-area"], "Confirm HUD and controls do not sit under the notch/Dynamic Island or home indicator."));
            add(manualCheck("touch-gestures", "iPhone", "Browser gestures do not interfere", this.manual["touch-gestures"], "Confirm MOVE/LOOK/multitouch work without page scrolling, text selection, zooming or accidental navigation."));
        }
        if (profile === "iphone-controller") {
            const handoff = hasTransition(this.modeTransitions, "touch", "gamepad") && hasTransition(this.modeTransitions, "gamepad", "touch");
            add(commonCheck("input-handoff", "Input", "Touch ↔ controller handoff", handoff, "Use touch controls, then the controller, then touch again."));
        }
        add(countCheck("team-stress", "Lifecycle", "10 successful team switches", this.teamSwitches, 10, "Switch teams at least 10 times."));
        add(countCheck("respawn-stress", "Lifecycle", "10 successful respawns", this.respawns, 10, "Use Test Respawn/B at least 10 times and wait for each respawn."));
        add(countCheck("reconnect-stress", "Lifecycle", "3 successful reconnects", this.successfulReconnects, 3, "Reconnect at least 3 times and wait for each connection to reopen."));
        const durationReady = this.startedAtMs > 0 && (this.isRunning() ? performance.now() - this.startedAtMs : this.endedAtMs - this.startedAtMs) >= 10000;
        add({ id: "invariants", category: "Stability", label: "Zero invariant violations", instruction: "Keep exercising the test until the rest of the checks pass.", status: this.invariantViolations > 0 ? "fail" : final || durationReady ? "pass" : "pending", detail: `${this.invariantViolations} violation(s)`, required: true });
        add({ id: "runtime-errors", category: "Stability", label: "Zero runtime errors", instruction: "Keep exercising the test until the rest of the checks pass.", status: this.runtimeErrors > 0 ? "fail" : final || durationReady ? "pass" : "pending", detail: `${this.runtimeErrors} error(s)`, required: true });
        const frameReady = metrics.frameSamples >= 300;
        const frameFail = frameReady && ((metrics.frameP95Ms ?? 0) > 50 || (metrics.frameMaxMs ?? 0) > 250 || metrics.catchupDrops > 2);
        add({ id: "frame-health", category: "Performance", label: "Stable frame pacing", instruction: "Play/move continuously for at least 5 seconds.", status: !frameReady ? "pending" : frameFail ? "fail" : "pass", detail: frameReady ? `avg ${fmt(metrics.frameAverageMs)} · p95 ${fmt(metrics.frameP95Ms)} · max ${fmt(metrics.frameMaxMs)} · catch-up drops ${metrics.catchupDrops}` : `${metrics.frameSamples}/300 frame samples`, required: true });
        const latencyReady = metrics.latencySamples >= 3;
        add({ id: "network-latency", category: "Network", label: "Latency samples captured", instruction: "Stay connected for at least 12 seconds.", status: latencyReady ? "pass" : "pending", detail: latencyReady ? `avg ${fmt(metrics.latencyAverageMs)} · p95 ${fmt(metrics.latencyP95Ms)} · max ${fmt(metrics.latencyMaxMs)}` : `${metrics.latencySamples}/3 ping samples`, required: true });
        return checks;
    }
    metrics() {
        return {
            frameSamples: this.frameTimes.length,
            frameAverageMs: average(this.frameTimes),
            frameP95Ms: percentile(this.frameTimes, 0.95),
            frameMaxMs: this.frameTimes.length ? Math.max(...this.frameTimes) : null,
            catchupDrops: this.catchupDrops,
            latencySamples: this.latencies.length,
            latencyAverageMs: average(this.latencies),
            latencyP95Ms: percentile(this.latencies, 0.95),
            latencyMaxMs: this.latencies.length ? Math.max(...this.latencies) : null,
            invariantViolations: this.invariantViolations,
            runtimeErrors: this.runtimeErrors,
            successfulReconnects: this.successfulReconnects,
            teamSwitches: this.teamSwitches,
            respawns: this.respawns
        };
    }
    evidence() {
        return {
            inputModes: [...this.inputModes],
            modeTransitions: [...this.modeTransitions],
            actionsByMode: {
                "keyboard-mouse": [...this.actionsByMode["keyboard-mouse"]],
                touch: [...this.actionsByMode.touch],
                gamepad: [...this.actionsByMode.gamepad]
            },
            keyboard: { ...this.keyboard },
            touch: { ...this.touch },
            gamepad: {
                ids: [...this.gamepadIds],
                standardMappingSeen: this.gamepadStandardMapping,
                axes: [...this.gamepadAxes].sort(),
                buttonsPressed: [...this.gamepadButtons].sort((a, b) => a - b),
                expectedButtons: [...STANDARD_REQUIRED_BUTTONS],
                disconnectedAfterConnection: this.gamepadDisconnectedAfterConnection,
                reconnectedAfterDisconnect: this.gamepadReconnectedAfterDisconnect
            },
            orientationSeen: [...this.orientationSeen],
            hiddenSeen: this.hiddenSeen,
            visibleAfterHidden: this.visibleAfterHidden,
            viewportSizes: [...this.viewportSizes],
            localTeamsSeen: [...this.localTeamsSeen],
            localLifeIdsSeen: [...this.localLifeIdsSeen].sort((a, b) => a - b),
            presentation: this.presentation ? { ...this.presentation, rendererIds: [...this.presentation.rendererIds], markerIds: [...this.presentation.markerIds] } : null
        };
    }
    resetEvidence() {
        this.frameTimes.length = 0;
        this.latencies.length = 0;
        this.catchupDrops = 0;
        this.invariantViolations = 0;
        this.runtimeErrors = 0;
        this.teamSwitches = 0;
        this.respawns = 0;
        this.reconnectRequests = 0;
        this.successfulReconnects = 0;
        this.pendingReconnects = 0;
        this.gamepadWasConnected = false;
        this.gamepadDisconnectedAfterConnection = false;
        this.gamepadReconnectedAfterDisconnect = false;
        this.previousPlatformGamepad = null;
        this.hiddenSeen = false;
        this.visibleAfterHidden = false;
        this.orientationSeen.clear();
        this.viewportSizes.clear();
        this.inputModes.clear();
        this.modeTransitions.length = 0;
        this.lastObservedMode = null;
        this.actionsByMode["keyboard-mouse"].clear();
        this.actionsByMode.touch.clear();
        this.actionsByMode.gamepad.clear();
        this.localTeamsSeen.clear();
        this.localLifeIdsSeen.clear();
        this.presentation = null;
        this.previousLocalTeam = null;
        Object.assign(this.keyboard, EMPTY_DIRECTIONS(), EMPTY_COMMON());
        Object.assign(this.touch, EMPTY_DIRECTIONS(), EMPTY_COMMON(), { multiTouchMoveLook: false });
        this.gamepadAxes.clear();
        this.gamepadButtons.clear();
        this.gamepadIds.clear();
        this.gamepadStandardMapping = false;
        this.touchMovePointer = null;
        this.touchLookPointer = null;
        this.manual["safe-area"] = "unset";
        this.manual["touch-gestures"] = "unset";
        this.events.length = 0;
        this.lastPingAt = 0;
    }
    noteMode(mode) {
        this.inputModes.add(mode);
        if (this.lastObservedMode !== mode) {
            this.lastObservedMode = mode;
            this.modeTransitions.push(mode);
            if (this.modeTransitions.length > 40)
                this.modeTransitions.shift();
            this.record("input.mode", { mode });
        }
    }
    noteGamepadConnection(connected) {
        if (this.previousPlatformGamepad === null) {
            this.previousPlatformGamepad = connected;
            if (connected)
                this.gamepadWasConnected = true;
            return;
        }
        if (connected === this.previousPlatformGamepad)
            return;
        if (!connected && this.gamepadWasConnected)
            this.gamepadDisconnectedAfterConnection = true;
        if (connected && this.gamepadDisconnectedAfterConnection)
            this.gamepadReconnectedAfterDisconnect = true;
        if (connected)
            this.gamepadWasConnected = true;
        this.previousPlatformGamepad = connected;
        this.record("gamepad.connection", { connected });
    }
    record(kind, data) {
        this.events.push({ at: new Date().toISOString(), kind, data: safe(data) });
        if (this.events.length > this.maxEvents)
            this.events.splice(0, this.events.length - this.maxEvents);
    }
    lastEmitAt = 0;
    emitThrottled() {
        const now = performance.now();
        if (now - this.lastEmitAt < 140)
            return;
        this.lastEmitAt = now;
        this.emit();
    }
    emit() {
        const report = this.report();
        for (const listener of [...this.listeners]) {
            try {
                listener(report);
            }
            catch { /* validation UI isolation */ }
        }
    }
}
function result(id, category, label, instruction, required, ok, detail, forced) {
    return { id, category, label, instruction, status: forced ?? (ok ? "pass" : "fail"), detail, required };
}
function allDirectionsCheck(id, category, label, value, instruction) {
    const missing = ["forward", "back", "left", "right"].filter((key) => !value[key]);
    return { id, category, label, instruction, status: missing.length ? "pending" : "pass", detail: missing.length ? `Missing: ${missing.join(", ")}` : "All four directions observed", required: true };
}
function commonCheck(id, category, label, ok, instruction) {
    return { id, category, label, instruction, status: ok ? "pass" : "pending", detail: ok ? "Observed" : "Waiting for evidence", required: true };
}
function countCheck(id, category, label, count, goal, instruction) {
    return { id, category, label, instruction, status: count >= goal ? "pass" : "pending", detail: `${Math.min(count, goal)}/${goal}`, required: true };
}
function manualCheck(id, category, label, value, instruction) {
    return { id, category, label, instruction, status: value === "unset" ? "pending" : value, detail: value === "unset" ? "Needs visual confirmation" : value === "pass" ? "Confirmed by tester" : "Tester reported failure", required: true };
}
function markAxis(set, name, value) {
    if (value <= -0.72)
        set.add(`${name}-`);
    if (value >= 0.72)
        set.add(`${name}+`);
}
function average(values) {
    if (!values.length)
        return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function percentile(values, fraction) {
    if (!values.length)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? null;
}
function fmt(value) { return value === null ? "—" : `${value.toFixed(1)}ms`; }
function isIPhone(userAgent) { return /iPhone|iPod/i.test(userAgent); }
function isIPhoneSafari(userAgent) { return isIPhone(userAgent) && /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent); }
function summarizePlatform(platform) { return `${platform.visualWidth}×${platform.visualHeight} · ${platform.orientation} · touch ${platform.touchCapable ? "yes" : "no"} · gamepad ${platform.gamepadConnected ? "yes" : "no"}`; }
function safe(value) { try {
    return JSON.parse(JSON.stringify(value));
}
catch {
    return String(value);
} }
function hasTransition(values, from, to) {
    for (let i = 1; i < values.length; i += 1)
        if (values[i - 1] === from && values[i] === to)
            return true;
    return false;
}
function buttonName(index) {
    return ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "L3", "R3", "D-pad Up", "D-pad Down", "D-pad Left", "D-pad Right"][index] ?? `Button ${index}`;
}
