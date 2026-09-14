export function checkClientInvariants(state, rendererIds, markers) {
    const violations = [];
    const playerIds = new Set();
    for (const player of state.players) {
        if (playerIds.has(player.id))
            violations.push({ code: "duplicate_player_state", detail: player.id });
        playerIds.add(player.id);
        if (player.team !== "blue" && player.team !== "red")
            violations.push({ code: "invalid_team", detail: `${player.id}:${String(player.team)}` });
        if (player.life !== "alive" && player.life !== "dead" && player.life !== "respawning")
            violations.push({ code: "invalid_life", detail: `${player.id}:${String(player.life)}` });
        if (player.life === "alive" && player.health.hp <= 0)
            violations.push({ code: "alive_without_hp", detail: player.id });
        if (player.health.hp < 0 || player.health.hp > player.health.maxHp)
            violations.push({ code: "invalid_hp", detail: `${player.id}:${player.health.hp}/${player.health.maxHp}` });
        if (!Number.isFinite(player.transform.x + player.transform.y + player.transform.z + player.transform.yaw + player.transform.pitch))
            violations.push({ code: "invalid_transform", detail: player.id });
        if (player.life === "alive" && player.respawnAt !== null)
            violations.push({ code: "alive_has_respawn_timer", detail: player.id });
    }
    const connected = state.players.filter((player) => player.connected);
    const expectedRendererIds = new Set(connected.map((player) => player.id));
    const rendererSet = new Set(rendererIds);
    if (rendererSet.size !== rendererIds.length)
        violations.push({ code: "duplicate_renderer", detail: rendererIds.join(",") });
    for (const id of expectedRendererIds)
        if (!rendererSet.has(id))
            violations.push({ code: "missing_renderer", detail: id });
    for (const id of rendererSet)
        if (!expectedRendererIds.has(id))
            violations.push({ code: "stale_renderer", detail: id });
    const markerById = new Map(markers.map((marker) => [marker.id, marker]));
    for (const player of connected) {
        const marker = markerById.get(player.id);
        if (!marker)
            violations.push({ code: "missing_minimap_marker", detail: player.id });
        else if (marker.team !== player.team)
            violations.push({ code: "minimap_team_mismatch", detail: `${player.id}:${marker.team}/${player.team}` });
    }
    if (markers.length !== markerById.size)
        violations.push({ code: "duplicate_minimap_marker", detail: `${markers.length}/${markerById.size}` });
    return violations;
}
