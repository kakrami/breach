# Menu, armory and Infected integration — 2.15.0

The canvas widget graph and live game state remain authoritative. There are no HTML menu overlays or separate demo state stores.

| Component | Responsibility |
| --- | --- |
| game-menu.js | Menu presentation, transient focus previews, direct card activation, stable comparisons and independent roster pages |
| client.js:createIntegratedMenuAdapter | Existing game actions, per-class weapon preference cache, class activation, explicit streak replacement and settings/host drafts |
| armory-stats.js | Actual weapon metrics, category-specific rows, immutable factory comparisons and fixed per-metric scales |
| game-config.js:resolveWeaponRules | Shared client/server tuning and attachment resolution |
| menu-scene.js | Shared 3D renderer, cached per-weapon framing envelopes, independent thumbnails and borrowed weapon geometry |
| menu-equipment.js | Equipment and killstreak display models |
| native-layout.js | Canvas hit testing, two-pointer preview gestures, hover transitions, safe-area layout and shared text/chat keyboard |
| match-menu-ui.js | Scoreboard/result layouts, discrete paging and six-card role shops |
| infection-models.js | Shared procedural 3D infected equipment for shop thumbnails and gameplay |
| infection-rules.js | Shared round rules, catalog, purchase availability and replicated inventory |
| infection-mode.js (server) | Authoritative single round, safe spawns, combat, ammo packs, grenades and bot equipment |
| infection-inventory.js (server) | Initial role inventory and reconnect preservation |
| infection-field.js (server) | Barricade/supply/ping authority and map restoration |
| infection-world.js | Shared dynamic-object geometry and secondary roof approaches |
| infection-presentation.js | World meshes generated from authoritative field state |
| bot-navigation.js (server) | Collision-based ground routes, roof approaches and descent |
| team-model.js | Self, friendly human, friendly bot and enemy presentation |
| app-lifecycle.js | Fullscreen entry, landscape gate and gameplay input ownership |
| worker.js | Authoritative match transport, projectile/collision services and Infected director integration |

Focus/hover preview state lives only in `game-menu.js`; the adapter is called only on activation. Weapon, attachment and equipment changes use the existing loadout commit path. The optional local per-weapon cache remembers preferences and is normalized through shared weapon rules before use. It never overrides authoritative match state on receipt.

Armory stats compare the full selected build against the same weapon without attachments, using current match tuning on both sides. Marker position does not depend on the currently equipped attachment. Every changed segment spans exactly the interval between the factory and selected scores. Lower-is-better metrics use an inverse monotonic scale; no visual minimum creates a fake change. Values and labels are distinct from synthetic rating scores.

Attachment choices share a horizontally clipped rail. Only intersecting cards receive hit targets; controller focus scrolls offscreen cards into view. A swipe cancels activation. The weapon preview owns each touch pointer separately, allowing pinch and rotation without leaking input into gameplay.

Host permissions and batch tuning retain Apply/Cancel. A controller slider enters edit mode with A/cross and adjusts with left/right; B exits editing. Right-stick rotation and trigger zoom are restricted to the visible armory; overlays block underlying menu actions.

Infected mode uses the canvas input owner and game lifecycle. One movable preparation phase opens the optional armory, followed by the outbreak. The armory remains available throughout play and from Pause. A card activation sends one purchase or class selection request; hover/controller focus never spends packs. Class selection applies on the next infected spawn. Shopping does not hold automatic respawns.

Combat uses the room's existing collision and projectile services. Claw infection requires close range, facing and line of sight. Humans and bots share role damage, inventory, class profiles and safe spawn checks. Pending spawns wait until safe placement exists. Reconnect preserves health, ammo, purchases and class selection. Bot navigation uses the compiled collision geometry.

Both upload folders use version 2.15.0 and protocol 109. No deployment was performed. See VERIFICATION.md for the implemented rules, controls, tested behavior and limits.

Field objects use the existing map geometry compiler and collision services. The field snapshot is sent after match reset so map initialization cannot discard it. Builds and pickups take one contextual action; no extra phase or shop countdown is introduced. Class ability, equipped consumable and timer state are replicated through the shared Infection contract. Final-minute sound uses the existing Music bus.
