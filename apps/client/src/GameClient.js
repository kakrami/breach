import { roomId, sessionId } from "../../../packages/shared/src/ids.js";
import { BREACH_VERSION } from "../../../packages/shared/src/version.js";
import { clonePlayer } from "../../../packages/shared/src/player.js";
import { CLIENT_FIXED_STEP } from "../../../packages/simulation/src/movement.js";
import { ClientStore } from "./state/ClientStore.js";
import { minimapMarkers } from "./state/selectors.js";
import { NetworkClient } from "./network/NetworkClient.js";
import { PlatformCapabilities } from "./platform/PlatformCapabilities.js";
import { InputHub } from "./input/InputHub.js";
import { KeyboardMouseDevice } from "./input/devices/KeyboardMouseDevice.js";
import { TouchDevice } from "./input/devices/TouchDevice.js";
import { GamepadDevice } from "./input/devices/GamepadDevice.js";
import { DiagnosticsRecorder } from "./diagnostics/DiagnosticsRecorder.js";
import { checkClientInvariants } from "./diagnostics/InvariantMonitor.js";
import { SceneController } from "./render/SceneController.js";
import { Minimap } from "./ui/Minimap.js";
import { UiRoot } from "./ui/UiRoot.js";
import { LocalPrediction } from "./simulation/LocalPrediction.js";
import { HardwareValidation } from "./validation/HardwareValidation.js";
import { HardwareValidationPanel } from "./validation/HardwareValidationPanel.js";
const STORAGE = {
    session: "breach.alpha.session",
    server: "breach.alpha.server",
    room: "breach.alpha.room",
    name: "breach.alpha.name"
};
const SEND_EVERY_FIXED_STEPS = 3;
const MAX_FRAME_CATCH_UP = 4;
export class GameClient {
    ui = new UiRoot();
    store = new ClientStore();
    diagnostics = new DiagnosticsRecorder();
    platform = new PlatformCapabilities();
    input = new InputHub();
    keyboard = new KeyboardMouseDevice(this.input);
    touch;
    gamepad;
    prediction = new LocalPrediction();
    minimap = new Minimap(this.ui.minimapCanvas);
    network;
    validation;
    validationPanel;
    scene = null;
    joined = false;
    sessionId;
    roomId = null;
    serverBase = "";
    displayName = "";
    frame = 0;
    lastFrameAt = performance.now();
    fixedAccumulator = 0;
    fixedStepCount = 0;
    constructor() {
        this.sessionId = this.loadOrCreateSession();
        this.network = new NetworkClient({
            onStatus: (status, detail) => this.onNetworkStatus(status, detail),
            onEvent: (event) => this.onServerEvent(event),
            onDiagnostic: (kind, data) => this.diagnostics.record(kind, data)
        });
        this.validation = new HardwareValidation((sentAt) => {
            if (!this.network.isOpen())
                return false;
            try {
                this.network.send("diagnostics.ping", { sentAt });
                return true;
            }
            catch {
                return false;
            }
        });
        this.touch = new TouchDevice(this.input, (telemetry) => this.validation.observeTouch(telemetry));
        this.gamepad = new GamepadDevice(this.input, (telemetry) => this.validation.observeGamepad(telemetry));
        this.validationPanel = new HardwareValidationPanel(this.validation, {
            onStart: (profile) => this.startHardwareValidation(profile),
            onStop: () => this.validation.stop(),
            onReset: () => this.validation.reset(),
            onExport: () => this.exportHardwareValidation(),
            onManual: (id, value) => this.validation.setManual(id, value)
        });
        this.restoreForm();
        this.ui.setVersion(BREACH_VERSION);
        this.ui.setJoined(false);
        this.ui.joinForm.addEventListener("submit", this.onJoin);
        this.ui.teamButton.addEventListener("click", this.switchTeam);
        this.ui.killButton.addEventListener("click", this.testRespawn);
        this.ui.reconnectButton.addEventListener("click", this.reconnect);
        this.ui.disconnectButton.addEventListener("click", this.leave);
        this.ui.diagnosticsButton.addEventListener("click", this.exportDiagnostics);
        this.ui.validationButton.addEventListener("click", this.openHardwareValidation);
        this.ui.touchValidationButton.addEventListener("click", this.openHardwareValidation);
        this.ui.sceneHost.addEventListener("pointerdown", this.onScenePointerDown);
        this.store.subscribe((state, event) => this.onStateChanged(state, event));
        this.platform.subscribe((snapshot) => {
            this.ui.renderPlatform(snapshot);
            this.validation.observePlatform(snapshot);
            this.diagnostics.record("platform.changed", snapshot);
        });
        this.input.subscribe((event) => {
            this.ui.setInputMode(event.mode);
            this.validation.observeInputAction(event);
            this.diagnostics.record("input.action", event);
            if (event.action === "team-switch")
                this.switchTeam();
            else if (event.action === "reconnect")
                this.reconnect();
            else if (event.action === "diagnostics-export" && !this.validation.isRunning())
                this.exportDiagnostics();
            else if (event.action === "debug-kill")
                this.testRespawn();
        });
        window.addEventListener("error", (event) => {
            this.validation.observeRuntimeError("window.error", event.error ?? event.message);
            this.diagnostics.record("window.error", { message: event.message, stack: event.error?.stack });
        });
        window.addEventListener("unhandledrejection", (event) => {
            this.validation.observeRuntimeError("window.unhandledrejection", event.reason);
            this.diagnostics.record("window.unhandledrejection", String(event.reason));
        });
        this.diagnostics.record("client.boot", { version: BREACH_VERSION, session: "[present]" });
        this.frame = requestAnimationFrame(this.frameLoop);
    }
    dispose() {
        cancelAnimationFrame(this.frame);
        this.network.disconnect();
        this.scene?.dispose();
        this.platform.dispose();
        this.keyboard.dispose();
        this.touch.dispose();
        this.gamepad.dispose();
        this.validationPanel.dispose();
    }
    onJoin = (event) => {
        event.preventDefault();
        try {
            const form = this.ui.readJoinForm();
            if (!/^https?:\/\//i.test(form.serverBase))
                throw new Error("Enter the alpha Worker URL including https://");
            this.roomId = roomId(form.room);
            this.serverBase = form.serverBase.replace(/\/$/, "");
            this.displayName = form.displayName.slice(0, 24) || "Player";
            localStorage.setItem(STORAGE.server, this.serverBase);
            localStorage.setItem(STORAGE.room, this.roomId);
            localStorage.setItem(STORAGE.name, this.displayName);
            this.ensureScene();
            this.ui.setJoined(true);
            this.joined = true;
            this.connect();
        }
        catch (error) {
            this.ui.setStatus(error instanceof Error ? error.message : "Unable to join", true);
        }
    };
    connect() {
        if (!this.roomId || !this.serverBase)
            return;
        this.network.connect({ serverBase: this.serverBase, roomId: this.roomId, sessionId: this.sessionId, displayName: this.displayName });
    }
    switchTeam = () => {
        try {
            this.network.send("player.team.switch", {});
        }
        catch (error) {
            this.ui.setStatus(error instanceof Error ? error.message : "Unable to switch team", true);
        }
    };
    testRespawn = () => {
        try {
            this.network.send("debug.life.kill", {});
        }
        catch (error) {
            this.ui.setStatus(error instanceof Error ? error.message : "Unable to test respawn", true);
        }
    };
    reconnect = () => {
        if (!this.joined)
            return;
        this.validation.observeReconnectRequested(this.input.snapshot().mode);
        this.ui.setStatus("Reconnecting…");
        this.prediction.markAllUnsent();
        this.network.reconnect();
    };
    leave = () => {
        this.network.disconnect();
        this.store.clearForLeave();
        this.prediction.clear();
        this.scene?.dispose();
        this.scene = null;
        this.joined = false;
        this.ui.setJoined(false);
        this.ui.setStatus("Disconnected. Session ID is preserved for reconnect testing.");
    };
    exportDiagnostics = () => {
        this.diagnostics.record("diagnostics.export", { failures: this.diagnostics.countInvariantFailures(), pendingInputs: this.prediction.pendingCount() });
        const validation = this.validation.status() === "idle" ? undefined : this.validation.report();
        this.diagnostics.export(this.store.snapshot(), this.platform.snapshot(), this.input.snapshot(), validation);
    };
    openHardwareValidation = () => {
        const suggested = this.validation.suggestProfile(this.platform.snapshot());
        this.validationPanel.show(suggested);
    };
    startHardwareValidation(profile) {
        if (!this.joined || !this.network.isOpen()) {
            this.ui.setStatus("Join the alpha room before starting hardware validation.", true);
            return;
        }
        this.validation.start(profile, this.platform.snapshot(), this.store.snapshot());
        this.diagnostics.record("hardware_validation.started", { profile });
        this.ui.setStatus(`Hardware validation running: ${profile}. Follow the guided checklist.`);
    }
    exportHardwareValidation() {
        const report = this.validation.report();
        this.diagnostics.record("hardware_validation.export", { profile: report.profile, status: report.status, runId: report.runId });
        this.diagnostics.export(this.store.snapshot(), this.platform.snapshot(), this.input.snapshot(), report);
    }
    onScenePointerDown = (event) => {
        if (event.pointerType === "mouse")
            this.scene?.requestPointerLock();
    };
    onNetworkStatus(status, detail) {
        this.validation.observeNetworkStatus(status);
        const connected = status === "open";
        this.store.setTransportConnected(connected);
        if (status === "connecting")
            this.ui.setStatus("Connecting to movement alpha…");
        else if (status === "open") {
            this.prediction.markAllUnsent();
            this.ui.setStatus("Connected. WASD / sticks / touch move; K or Test Respawn verifies lifecycle.");
        }
        else if (status === "closed")
            this.ui.setStatus(`Connection closed${detail ? ` (${detail})` : ""}`, true);
        else if (status === "error")
            this.ui.setStatus(detail ?? "Network error", true);
    }
    onServerEvent(event) {
        this.store.apply(event);
        if (event.type === "session.welcome")
            this.ui.setStatus(`Joined. Server ${event.payload.version}.`);
        if (event.type === "diagnostics.pong") {
            const latency = Math.max(0, Date.now() - event.payload.sentAt);
            this.validation.observeLatency(latency);
            this.diagnostics.record("diagnostics.pong", { latency });
        }
    }
    onStateChanged(state, event) {
        this.validation.observeState(state, event);
        this.ui.renderState(state);
        const authoritative = state.localPlayerId ? state.players.find((player) => player.id === state.localPlayerId) ?? null : null;
        if (authoritative) {
            const result = this.prediction.setAuthoritative(authoritative);
            if (event?.type === "simulation.snapshot" || event?.type === "player.respawned") {
                this.diagnostics.record("prediction.reconcile", result);
            }
        }
        this.renderPresentation(state);
        if (event?.type === "player.updated" || event?.type === "player.respawned") {
            this.diagnostics.record("player.lifecycle.applied", {
                id: event.payload.player.id,
                team: event.payload.player.team,
                life: event.payload.player.life,
                lifeId: event.payload.player.lifeId,
                playerRevision: event.payload.player.revision,
                roomRevision: event.payload.revision
            });
        }
    }
    frameLoop = (now) => {
        const rawElapsedMs = Math.max(0, now - this.lastFrameAt);
        const elapsed = Math.max(0, Math.min(0.1, rawElapsedMs / 1000));
        this.validation.observeFrame(now, rawElapsedMs);
        this.lastFrameAt = now;
        this.fixedAccumulator += elapsed;
        let steps = 0;
        while (this.fixedAccumulator + 1e-9 >= CLIENT_FIXED_STEP && steps < MAX_FRAME_CATCH_UP) {
            this.fixedAccumulator -= CLIENT_FIXED_STEP;
            this.fixedStep();
            steps += 1;
        }
        if (steps === MAX_FRAME_CATCH_UP && this.fixedAccumulator >= CLIENT_FIXED_STEP) {
            this.fixedAccumulator = 0;
            this.validation.observeCatchupDrop();
            this.diagnostics.record("prediction.catchup_dropped", { at: now });
        }
        this.frame = requestAnimationFrame(this.frameLoop);
    };
    fixedStep() {
        if (!this.joined || !this.network.isOpen())
            return;
        const state = this.store.snapshot();
        const local = state.localPlayerId ? state.players.find((player) => player.id === state.localPlayerId) : undefined;
        if (!local || local.life !== "alive") {
            this.renderPresentation(state);
            return;
        }
        const action = this.input.sample(CLIENT_FIXED_STEP);
        this.validation.observeInputFrame(action);
        this.ui.setInputMode(action.mode);
        const generated = this.prediction.predict(action);
        if (!generated)
            return;
        this.fixedStepCount += 1;
        if (this.fixedStepCount % SEND_EVERY_FIXED_STEPS === 0)
            this.flushInput();
        this.renderPresentation(state);
    }
    flushInput() {
        const predicted = this.prediction.state();
        if (!predicted || predicted.life !== "alive" || !this.network.isOpen())
            return;
        const frames = this.prediction.unsentBatch(12);
        if (frames.length === 0)
            return;
        try {
            this.network.send("movement.input", { lifeId: predicted.lifeId, frames });
            this.prediction.markSent(frames.at(-1).seq);
        }
        catch (error) {
            this.diagnostics.record("movement.send_failed", error instanceof Error ? error.message : String(error));
        }
    }
    renderPresentation(state = this.store.snapshot()) {
        const predicted = this.prediction.state();
        const players = state.players.map((player) => predicted && player.id === state.localPlayerId ? clonePlayer(predicted) : player);
        this.guard("scene.reconcile", () => this.scene?.reconcile(players, state.localPlayerId));
        this.guard("scene.local_camera", () => this.scene?.setLocalPlayer(predicted));
        const markers = minimapMarkers(state, predicted);
        this.guard("minimap.render", () => this.minimap.render(markers));
        const rendererIds = this.scene?.registry.ids() ?? [];
        this.validation.observePresentation(state, rendererIds, markers.map((marker) => marker.id));
        const violations = checkClientInvariants(state, rendererIds, markers);
        this.validation.observeInvariantViolations(violations);
        this.diagnostics.recordViolations(violations);
        this.ui.setInvariantStatus(this.diagnostics.countInvariantFailures());
        this.ui.renderMovement(predicted, this.prediction.pendingCount());
    }
    ensureScene() {
        if (!this.scene)
            this.scene = new SceneController(this.ui.sceneHost);
    }
    guard(name, action) {
        try {
            action();
        }
        catch (error) {
            this.validation.observeRuntimeError(`subsystem.${name}`, error);
            this.diagnostics.record("subsystem.error", { name, error: error instanceof Error ? error.stack ?? error.message : String(error) });
            this.ui.setStatus(`${name} failed; networking/state remain active. Export diagnostics.`, true);
        }
    }
    loadOrCreateSession() {
        const existing = localStorage.getItem(STORAGE.session);
        if (existing) {
            try {
                return sessionId(existing);
            }
            catch {
                localStorage.removeItem(STORAGE.session);
            }
        }
        const created = sessionId(`s_${crypto.randomUUID()}`);
        localStorage.setItem(STORAGE.session, created);
        return created;
    }
    restoreForm() {
        this.ui.serverBase.value = localStorage.getItem(STORAGE.server) ?? "https://breach-online-alpha.kiadesignenterprise.workers.dev";
        this.ui.room.value = localStorage.getItem(STORAGE.room) ?? "ALPHA";
        this.ui.displayName.value = localStorage.getItem(STORAGE.name) ?? `Player-${Math.floor(100 + Math.random() * 900)}`;
    }
}
