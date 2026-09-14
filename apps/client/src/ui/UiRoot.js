export class UiRoot {
    joinForm = must("joinForm");
    serverBase = must("serverBase");
    room = must("roomCode");
    displayName = must("displayName");
    joinPanel = must("joinPanel");
    gameShell = must("gameShell");
    sceneHost = must("sceneHost");
    minimapCanvas = must("minimap");
    connectionText = must("connectionText");
    teamText = must("teamText");
    lifeText = must("lifeText");
    inputText = must("inputText");
    movementText = must("movementText");
    versionText = must("versionText");
    playerCount = must("playerCount");
    invariantText = must("invariantText");
    orientationHint = must("orientationHint");
    touchControls = must("touchControls");
    teamButton = must("teamButton");
    killButton = must("killButton");
    reconnectButton = must("reconnectButton");
    disconnectButton = must("disconnectButton");
    diagnosticsButton = must("diagnosticsButton");
    validationButton = must("validationButton");
    touchValidationButton = must("touchValidation");
    statusLine = must("statusLine");
    readJoinForm() {
        return { serverBase: this.serverBase.value.trim(), room: this.room.value.trim(), displayName: this.displayName.value.trim() };
    }
    setJoined(joined) {
        this.joinPanel.hidden = joined;
        this.gameShell.hidden = !joined;
    }
    renderState(state) {
        this.connectionText.textContent = state.connected ? "Connected" : "Disconnected";
        this.connectionText.dataset.state = state.connected ? "ok" : "off";
        const local = state.localPlayerId ? state.players.find((p) => p.id === state.localPlayerId) : undefined;
        this.setTeam(local?.team ?? null);
        this.lifeText.textContent = local ? formatLife(local) : "—";
        this.lifeText.dataset.state = local?.life === "alive" ? "ok" : local ? "warn" : "off";
        this.playerCount.textContent = String(state.players.filter((p) => p.connected).length);
        this.teamButton.disabled = !state.connected || !local;
        this.killButton.disabled = !state.connected || !local || local.life !== "alive";
        this.reconnectButton.disabled = !state.localPlayerId;
        if (state.lastError)
            this.setStatus(state.lastError, true);
    }
    renderPlatform(platform) {
        this.orientationHint.hidden = !(platform.touchCapable && platform.orientation === "portrait");
        this.touchControls.hidden = !platform.touchCapable;
        document.documentElement.dataset.orientation = platform.orientation;
        document.documentElement.dataset.touch = platform.touchCapable ? "yes" : "no";
    }
    renderMovement(player, pending) {
        if (!player) {
            this.movementText.textContent = "—";
            return;
        }
        const speed = Math.hypot(player.movement.velocityX, player.movement.velocityZ);
        this.movementText.textContent = `${speed.toFixed(1)} m/s · q${pending}`;
    }
    setInputMode(mode) {
        this.inputText.textContent = mode === "keyboard-mouse" ? "Keyboard / Mouse" : mode === "gamepad" ? "Controller" : "Touch";
    }
    setVersion(version) { this.versionText.textContent = version; }
    setInvariantStatus(failures) {
        this.invariantText.textContent = failures === 0 ? "All checks green" : `${failures} invariant failure${failures === 1 ? "" : "s"}`;
        this.invariantText.dataset.state = failures === 0 ? "ok" : "bad";
    }
    setStatus(message, error = false) {
        this.statusLine.textContent = message;
        this.statusLine.dataset.state = error ? "bad" : "ok";
    }
    setTeam(team) {
        this.teamText.textContent = team ? `${team[0].toUpperCase()}${team.slice(1)}` : "—";
        this.teamText.dataset.team = team ?? "none";
        this.teamButton.textContent = team ? `Switch to ${team === "blue" ? "Red" : "Blue"}` : "Switch Team";
    }
}
function formatLife(player) {
    if (player.life === "alive")
        return `Alive · L${player.lifeId}`;
    if (player.life === "respawning")
        return `Respawning · L${player.lifeId}`;
    return `Dead · L${player.lifeId}`;
}
function must(id) {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Missing #${id}`);
    return element;
}
