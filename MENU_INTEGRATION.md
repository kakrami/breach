# Menu and Infected mode integration — 2.10.0

The canvas widget graph and live game state remain authoritative. There are no HTML menu overlays or separate demo state stores.

| Component | Responsibility |
| --- | --- |
| game-menu.js | Menu presentation, transient focus previews, direct card activation, stable comparisons and independent roster pages |
| client.js:createIntegratedMenuAdapter | Existing game actions, per-class weapon preference cache, class activation, explicit streak replacement and settings/host drafts |
| client.js:loadoutPreviewNodePoint | Physical-only hardware bounds for attachment guides |
| menu-scene.js | Shared 3D renderer, independent thumbnail framing and borrowed weapon geometry |
| menu-equipment.js | Equipment and killstreak display models |
| native-layout.js | Canvas hit testing, hover transitions, actual safe-area layout and shared text/chat keyboard |
| match-menu-ui.js | Scoreboard/result layouts, discrete paging and six-card role shops |
| infection-models.js | Shared procedural 3D infected equipment for shop thumbnails and gameplay |
| infection-rules.js | Shared round rules, catalog, purchase availability and replicated inventory |
| infection-mode.js (server) | Authoritative rounds, safe spawn selection, combat, economy, supplies and bot equipment |
| infection-inventory.js (server) | Initial role inventory and reconnect preservation |
| team-model.js | Self, friendly human, friendly bot and enemy presentation |
| app-lifecycle.js | Fullscreen entry, landscape gate and gameplay input ownership |
| worker.js | Authoritative match transport, projectile/collision services and Infected director integration |

Focus/hover preview state lives only in `game-menu.js`; the adapter is called only on activation. Weapon, attachment and equipment changes use the existing loadout commit path. The optional local per-weapon cache remembers preferences and is normalized through shared weapon rules before use. It never overrides authoritative match state on receipt.

Host permissions and batch tuning retain Apply/Cancel. A controller slider enters edit mode with A/cross and adjusts with left/right; B exits editing. Right-stick rotation and trigger zoom are restricted to the visible armory; overlays block underlying menu actions.

Infected mode uses the existing canvas input owner and game lifecycle. Shops appear during preparation and infected respawn waits; survivors can also open a shop near a supply point. Activating a card sends one purchase request. The server validates phase, role, ownership, price and location, then publishes the result. Hover/controller focus never sends a purchase.

Infected combat uses the room's existing collision/projectile services. Humans and bots share role damage, inventory, recovery and spawn checks. Pending spawns stay dead until a safe position exists. Preparation freezes movement; a roster that lacks safe opening capacity returns to the lobby. Reconnect state cannot replace retained health/ammo with fresh spawn defaults.

Both upload folders use version 2.10.0 and protocol 104. Existing filenames and repository layout are preserved. No deployment was performed. See VERIFICATION.md for controls, tested behavior and limits.
