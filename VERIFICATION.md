# Breach 2.9.1 — menu polish

The release contains the integrated game, client and server. It has not been deployed to GitHub Pages or the production Worker.

## Changes

- Armory: larger, consistently framed weapons; improved preview lighting; complete sniper scopes; correctly framed individual attachments; real magazine/barrel hardware; explicit None states without fabricated models.
- Attachment cards keep a fixed size. Sparse lists include a part close-up. All attachment effect tags fit, with positive and negative effects distinguished. The selected preview is separate from the equipped checkmark.
- Weapon callouts use actual mesh positions. Reset and zoom controls occupy a dedicated row. Comparisons always use the equipped configuration; accuracy, recoil and handling bars appear where relevant.
- Pause: matching game-menu layout with map context, direct loadout, roster, team, invite, settings, Cheats and Diagnostics controls.
- Players: Alpha/Bravo columns, stable rows, inline host bot controls and team switching. Host permission editing remains in Cheats.
- Scoreboard: two columns with complete rows, consistent K/D precision, no scrolling. Explicit pages appear only when capacity is exceeded. A nine-player match fits on one page at all tested phone sizes.
- Relationship colors: self lime, friendly humans green, friendly bots blue, enemies red across player lists, scoreboard, chat and kill feed. Faction uniforms retain their original materials.
- Chat/text entry: familiar QWERTY layout, large spacebar, Shift and Backspace, a symbol/number switch, compact Send/Close controls and readable message history. All input remains canvas-native.
- Team/All chat is routed by the authoritative server; Team messages are delivered only to players on the sender's team. Non-team modes use All.
- Version, cache keys, shared exports and server package metadata are 2.9.1. Protocol is 103 so a new client cannot accidentally send private team messages through an older server that only supports global chat.

## Verification performed

- Real production modules rendered in headless Chromium with touch/mobile emulation and desktop mouse input; no uncaught JavaScript errors.
- Actual canvas hit testing exercised preview/equip, zoom/reset, equipment, pause/resume, roster, settings, bots and team actions.
- All ten weapons and every compatible attachment preview rendered. Sniper scope composition checked: factory scope plus the selected scope hardware, rather than detached rings/markers.
- Armory and menu layouts checked at 667×375, 844×390, 932×430 and 1440×900; no menu scroll regions or offscreen hit targets.
- Pause/chat screenshots reviewed at 667×375, 844×390 and 932×430. Touch typing, spaces, Shift, deletion, numbers, channel changes, Send/Close and room-code entry checked.
- Scoreboard layouts checked for 0, 1, 9, 18, 24 and 32 participants in team and non-team modes. Every row retained across pages, no clipped rows, no scroll state, keyboard/controller paging works.
- Real server room logic checked loadout acceptance, team switching, God Mode, admin grant/revoke, guest permission rejection, match setup, bot spawning and live tuning. Team-chat recipient isolation and All-chat delivery verified with three independent socket identities.
- Touch match start confirmed fullscreen=true, landscapeReady=true and canPlay=true after the server's matchReset. Lifecycle checks cover denied APIs, portrait blocking, rotation, guest entry and pause/resume.

These checks use browser emulation and the actual server module in a local socket/storage harness. Physical-device Safari/Android and the live deployment were not exercised.

## Upload

Deploy the contents of `1_SERVER_REPO_UPLOAD` first, then publish `2_CLIENT_REPO_UPLOAD` using the existing repository workflows. Keep the folders separate and preserve entry filenames. Start a new match after updating: protocol 103 intentionally rejects older clients/rooms. Check the in-game version and version.json for 2.9.1.
