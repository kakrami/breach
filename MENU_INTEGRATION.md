# Menu integration map — 2.9.1

The canvas widget graph and live gameplay state remain authoritative. There are no HTML menu overlays or separate demo data stores.

| Component | Responsibility |
| --- | --- |
| game-menu.js | Main menu, lobby, armory, settings, Cheats, pause and player roster |
| client.js:createIntegratedMenuAdapter | Live state, existing game actions, preference and host drafts |
| menu-scene.js | One shared 3D renderer, independent thumbnail framing, borrowed weapon geometry |
| menu-equipment.js | Equipment and killstreak display models |
| native-layout.js | Canvas layout, hit testing, text-entry/chat keyboard and message history |
| match-menu-ui.js | Scoreboard/result layouts and discrete paging with shared input routing |
| team-model.js | Authoritative presentation rules for self, allies, allied bots and enemies |
| app-lifecycle.js | Fullscreen entry, landscape gate and gameplay input lifecycle |
| worker.js | Authoritative Team/All chat recipients and existing match actions |

Deploy the server folder before the client folder. Both use version 2.9.1 and protocol 103. The protocol bump prevents team chat from falling back to global delivery on an old server. Existing entry filenames and repository layout are preserved. No deployment has been performed by this release build.
