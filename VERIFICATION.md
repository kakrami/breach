# Breach 2.7.1 — menu polish and landscape entry

Local release; not deployed. Preserve the two repository folders. Protocol 102 is unchanged.

## Changes

- Shared canvas theme: graphite surfaces, restrained lime accents, sharper cards, subtle backdrop, visible hover/focus and ellipsized overflow.
- Lobby: compact responsive header and tabs, slim context-aware footer, clipped roster scroll area, aligned bot/team controls. Short landscape layouts put navigation on one line and bot difficulty beside the match summary.
- Killstreaks: illustrated native canvas cards, three compact equipped slots, responsive grid and a landscape equipped sidebar.
- Match: compact mode picker and aligned rule controls. Maps: real map overview alongside/before a bounded selection list, contextual editing actions.
- Classes: responsive class grid and compact equipment cards. Shared styling also reaches Settings, Pause and match overlays.
- Start Match requests fullscreen immediately from the initiating gesture, then requests landscape. Orientation stays locked through match menus and unlocks on return to the lobby.
- Unsupported/denied orientation requests show a rotation gate and block local gameplay input. Initial rotation enters gameplay; rotating during gameplay pauses and requires Resume. Guests use the same gate.
- Corrected map-preview animation callback so a frame timestamp cannot be interpreted as a map ID.
- Version/cache keys updated together to 2.7.1. Gameplay rules and network message schemas are unchanged.

## Verified this release

- Actual client module startup in headless Chromium, with no uncaught JavaScript errors.
- Actual client menu rendering at 320×568, 393×852, 852×393 and 1440×900; raster screenshots inspected and layouts iterated.
- Touch event dispatch through the production canvas renderer: bot changes, score limit, map selection, class editor, killstreak selection, Settings opening/canceling.
- Control bounds and unobstructed Start Match hit target at five viewport sizes, including 667×375.
- Session-shell tests: synchronous fullscreen request, request/lock ordering, standalone app mode, denied APIs, guest match entry, portrait input blocking, initial rotation, mid-match rotation, pause/resume and return to lobby.
- Changed JavaScript syntax and release archive integrity.

## Limits

Browser checks use local simulated multiplayer state; no production multiplayer session or deployment was performed. Browser API fallback paths are covered with deterministic fixtures. Physical Android/iPhone rotation, Safari and hardware controller acceptance still require real-device validation. Browsers that reject fullscreen/orientation locking require the user to rotate manually; a website cannot override that policy.
