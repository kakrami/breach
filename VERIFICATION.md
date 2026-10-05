# Breach 2.6.0 — review candidate

This package contains updated client and server source. It has not been pushed or deployed. Both folders must be updated together because the protocol changed to 100.

## Implemented

- Moon Deathmatch is a standalone free-for-all mode. It selects the new shared Lunar Outpost map, low gravity and higher jumps. Craters, cover and perimeter geometry use the same render/collision source. Earth, stars and a small decorative UFO give the arena its lunar setting.
- Infection is a separate round-based mode. A 15-second preparation/buy phase precedes selection of one random first infected. Survivors win by lasting two minutes or eliminating the infected; infected win by converting/eliminating all survivors. Infected move 20% faster and use server-validated, line-of-sight claws only. The first infected has 300 health; subsequent infected have 220. Rounds reset after seven seconds.
- Players start with a pistol and $2,000. The server owns purchases, available equipment, cash and round awards. Cash is capped at $16,000. The shop offers primary weapons, armor, medkits and frag grenades. Free loadout changes and killstreaks are disabled in Infection. Players/bots return as survivors for each new round. Mid-round newcomers spectate until the next round.
- Infection has random supply drops and touch/keyboard/controller shop and healing controls.
- Zombie Waves remains separate. Every fifth wave adds an enlarged Abomination boss. Bounded tier scaling increases health, speed and reach gradually; later tiers add a telegraphed close-range slam. The larger body has matching projectile and movement collision scaling.

## Verified in this workspace

- JavaScript syntax and relative static import closure across client and server modules.
- In-process Worker startup, GameRoom construction, real HTTP health handler and origin rejection.
- Shared mode, state serialization, lunar terrain, spawn clearance and free-for-all spawn tests.
- Focused client-function tests for shop layout bounds on phone dimensions, purchase dispatch, authoritative inventory, infected health, movement multiplier, claw cooldown and phase cleanup.
- Production WebSocket message handlers exercised with fixture sockets: repeated purchases, armor cap, medkit consumption, phase locks, forged weapon ownership and infected weapon rejection.
- Production reconnect fetch path exercised with fixture WebSocketPair/101 Response: current-round role/health/cash retention, stale/new arrivals spectating, plus lobby/mode-reset cleanup. These are in-process tests, not live network sessions.

## Not verified

- Actual browser rendering or complete rendered gameplay. Chromium could not start because socket creation was restricted; the cloud browser also rejected localhost access.
- A live network WebSocket session, deployed Cloudflare Durable Object persistence or production multiplayer. Backend tests use in-process fixtures, not a live server.
- Physical controllers, Safari/iOS, low-end mobile performance, or gameplay balance with real players.

This is an implementation candidate for review, not a claim of production readiness or fully playtested balance. Earlier 2.5.0 editor test results do not certify these new mode changes.

## Controls

Infection shop: tap an item, press 1–6, or use controller left/right and X during the buy phase. Heal during active play: H, the onscreen heal button, or controller D-pad down. Infected attack with the normal fire control.
