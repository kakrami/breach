export function connectedPlayers(state) {
    return state.players.filter((player) => player.connected);
}
export function localPlayer(state) {
    if (!state.localPlayerId)
        return null;
    return state.players.find((player) => player.id === state.localPlayerId) ?? null;
}
export function minimapMarkers(state, localProjection) {
    return connectedPlayers(state).map((player) => {
        const source = localProjection && player.id === state.localPlayerId ? localProjection : player;
        return {
            id: player.id,
            team: player.team,
            x: source.transform.x,
            z: source.transform.z,
            yaw: source.transform.yaw,
            local: player.id === state.localPlayerId,
            alive: source.life === "alive"
        };
    });
}
