# Breach 2.6.2 — local review build

This package has not been pushed or deployed. Upload the server and client folders together. Protocol 102 intentionally rejects older clients: role/economy, boss-phase and supply messages changed, so a mixed client/server pair must not silently continue.

## Gameplay changes

- Infection claws now deal 40 damage every 650 ms; only a lethal claw hit converts a survivor. Armor absorbs half of incoming claw damage while it lasts, making armor and healing meaningful. A healthy unarmored survivor takes three successful claws; full armor takes five. Reach, line of sight, server cooldown, god mode and spawn protection are enforced. Normal gun damage, recoil, movement and timing values are unchanged.
- The randomly chosen first infected receives a one-time refund for purchases made during that preparation phase. Later conversions do not refund purchases; the existing cash cap still applies.
- Conversion and round rewards have separate events. They do not masquerade as respawns or reset position, movement, camera, traversal or prediction. Dead remote players are no longer forced to 100 HP when a snapshot arrives.
- Client prediction, server actor collision, boss rendering and projectile hit zones use the same actor-size contract. Boss route clearance accounts for the enlarged body. Infected remote extrapolation uses infected movement speed.
- Role changes update eyes, skin, uniform and weapon visibility consistently. Infected touch controls show claws, movement and jump without invisible weapon controls intercepting look input. Controller shop directions do not also toggle combat actions.
- The shop uses the same availability rules as the server and shows owned/full/insufficient-cash states. Survivors see health and armor. Attacks have hit/miss feedback, and role/round changes have clear announcements. Infection no longer awards unusable killstreaks.
- Bosses display a growing-intensity ground range warning and raise their arms during windup; damage and strike animation begin on release rather than the start of the warning. Cancelled attacks clear their warning.

## Moon and boss gameplay

- Moon Deathmatch selects Lunar Outpost with its existing low gravity/higher jumps. A real server-scheduled supply UFO first arrives after 30 seconds, then at most once a minute. It approaches a marked landing point, beams down a field medkit or ammo cache, and departs. Supplies restore up to 45 health or refill the owned weapon magazines; they never change damage, speed or weapon tuning. Pickups expire after 45 seconds and are capped at two. Claims are server-authoritative, useful-only, single-use and line-of-sight checked. Joining players receive the current flyby/pickup snapshot.
- Moon supplies have world markers, distinct medkit/ammo meshes, minimap markers, distance/countdown information and arrival/beam/claim feedback. Supply state and presentation clear outside active Moon matches.
- Every fifth Zombie Wave adds an Abomination or Ravager, alternating between archetypes. Both have distinct proportions/armor silhouettes and phase-specific poses.
- The Abomination warns with a radial ground ring before slamming. The Ravager locks a visible lane, then charges down it. A charge stops at cover or an actor instead of sliding around obstacles; only its physically swept segment deals damage. Targets can evade the locked direction. Warning geometry and server damage geometry share one definition.
- Both bosses expose the cyan chest core during a limited recovery window. The visible sphere and authoritative projectile sphere share position/radius/scale. Closed cores are ordinary body hits; exposed core hits receive a capped 2× firearm damage multiplier. Recovery boundaries are server-owned; the HUD announces the punish window. Core transforms stay aligned during animations.
- Tier progression caps at six. Charge range grows from 7 to 11 meters, charge speed stays 11 m/s, warnings stay at least 1.1 seconds, and recovery remains 1.6–1.8 seconds. Health/damage/speed remain bounded and team scaling caps at four players.

## Verification

- Deterministic regression comparisons against actual 2.5.0 client/server Git baselines cover core constants, all weapons/attachments, spread/falloff/heat, movement/physics/traversal/ladder traces and unchanged recoil/aim functions.
- Independent production-entry-point and THREE scene-model tests cover both boss archetypes, five maps, exact weakpoint transforms/damage windows, supply persistence/claim races/expiry, and charge collision against walls and actors. These do not render a browser.
- Focused executable client-function tests cover role/economy/inventory state preservation, mode speed isolation, real shared shop rules, responsive shop bounds, controls, cooldowns and boss collision.
- Production server handlers are exercised with fixture sockets for purchases, armor/healing, damaging claws, lethal-only conversion, refunds, role/reward events, boss windup/release/cancellation, mode reset, reconnect and disabled Infection streaks.
- Syntax, static import closure, shared map/spawn tests and in-process Worker startup/health/origin checks are run against the final package. The ZIP is extracted and checked before delivery.

## Not verified

Actual rendered gameplay, real network WebSockets, deployed Durable Object persistence, physical controllers, Safari/iOS and low-end mobile performance are not verified. Browser startup/local-preview access was unavailable in this environment. Model/VM/fixture tests are not browser or multiplayer QA.

Before deployment, playtest normal → Infection → normal, conversion during movement, round-end death/rewards, boss contact, weakpoint timing and charge/slam telegraphs, UFO approaches and pickup visibility, reconnect, controller/touch controls and two-client latency. Balance numbers are a review starting point, not a claim of completed playtesting.
